-- Leave and days off: step 2 of LEAVE_PLAN.md (KNOWN_GAPS O21). Apply by
-- hand in the Supabase SQL editor, AFTER add-rest-off-requests.sql,
-- add-rest-off-validation.sql, add-household-timezone-and-cutoffs.sql (for
-- household_today) and add-pay-periods.sql (for helper_profiles.started_on).
-- Idempotent and safe to re-run. Tested in PGlite: supabase/tests/leave.test.mjs.
--
-- Four kinds of whole-day time off (decided 2026-10-01/02):
--
--   sil         Service incentive leave, RA 10361 section 29: 5 paid days per
--               service year once she has a year of service. Doesn't carry
--               over. See LEGAL_CONSIDERATIONS.md.
--   in_kind     A day off in kind: time off in lieu, paid out of her rest-owed
--               balance, same as rest_off_requests but whole days. One day
--               costs one shift (shift length minus break).
--   unpaid      No balance. Deducted from pay in step 5 (not here) at
--               monthly_rate x 12 / pay_days_per_year.
--   extra_paid  A household perk beyond the law. No balance.
--
-- Pay is NOT touched here: the payslip columns and initiate_payslip change
-- arrive with step 5, so applying this changes nobody's pay.
--
-- Writes only through the functions below. Unlike rest_off_requests (FOR ALL,
-- see KNOWN_GAPS O22), the table's policy is SELECT-only: a helper's session
-- must not be able to approve her own leave by writing the row directly.

-- --------------------------------------------------------------------------
-- 1. The unpaid-leave divisor, per helper. 365 counts every day, as for a
--    live-in; 313 is a six-day week and 261 a five-day week, for staff who
--    aren't there every day.
-- --------------------------------------------------------------------------
ALTER TABLE public.helper_profiles
    ADD COLUMN IF NOT EXISTS pay_days_per_year INT NOT NULL DEFAULT 365;
ALTER TABLE public.helper_profiles DROP CONSTRAINT IF EXISTS helper_profiles_pay_days_per_year_check;
ALTER TABLE public.helper_profiles
    ADD CONSTRAINT helper_profiles_pay_days_per_year_check
    CHECK (pay_days_per_year IN (261, 313, 365));

-- --------------------------------------------------------------------------
-- 2. The table.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID NOT NULL REFERENCES public.helper_profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('sil', 'in_kind', 'unpaid', 'extra_paid')),
    -- What it's for, in her words' place. Not a gate: SIL may be used for any
    -- of these (LEGAL_CONSIDERATIONS.md).
    reason TEXT NOT NULL DEFAULT 'other' CHECK (reason IN ('vacation', 'sick', 'family', 'other')),
    -- Household civil dates, inclusive (C38).
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    -- Working days in the range (her weekly rest day doesn't count), and for
    -- in_kind the minutes debited. Recomputed and snapshotted at approval, so
    -- a later change to her shift or rest day doesn't rewrite history, same
    -- reasoning as rest_off_requests.minutes.
    days INT NOT NULL CHECK (days > 0),
    minutes INT NOT NULL DEFAULT 0 CHECK (minutes >= 0),
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
    requested_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    decided_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    decline_reason TEXT,
    cancelled_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    cancelled_at TIMESTAMPTZ,
    -- Leave a manager recorded for her (she called in sick) is approved at
    -- once and starts 'pending' here; she confirms or disputes it from her
    -- app. NULL for leave she asked for herself. Same shape as
    -- payslips.helper_ack.
    helper_ack TEXT CHECK (helper_ack IS NULL OR helper_ack IN ('pending', 'confirmed', 'disputed')),
    helper_ack_at TIMESTAMPTZ,
    helper_ack_note TEXT,
    -- Unpaid leave only: the payslip that deducted it (step 5), like vales.
    settled_in_payslip_id UUID REFERENCES public.payslips(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_helper
    ON public.leave_requests (helper_id, start_date DESC);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Read: anyone in her household, as with rest off (it's addressed to the
-- manager), plus her own rows after she has left (her record, C60).
DROP POLICY IF EXISTS leave_requests_read ON public.leave_requests;
CREATE POLICY leave_requests_read ON public.leave_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = leave_requests.helper_id
              AND (hp.household_id = public.current_household_id() OR hp.user_id = auth.uid())
        )
    );
-- No INSERT/UPDATE/DELETE policy: writes go through the functions below.
GRANT SELECT ON public.leave_requests TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.leave_requests FROM authenticated, anon;

-- --------------------------------------------------------------------------
-- 3. Building blocks.
-- --------------------------------------------------------------------------

-- Working days between two dates, inclusive: every day except her weekly rest
-- day. Only for a helper in the caller's household (0 otherwise), so it can't
-- be used to read another household's rest days.
CREATE OR REPLACE FUNCTION public.leave_working_days(p_helper_id UUID, p_start DATE, p_end DATE)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::int
    FROM public.helper_profiles hp,
         generate_series(p_start, p_end, interval '1 day') AS d
    WHERE hp.id = p_helper_id
      AND hp.household_id = public.current_household_id()
      AND EXTRACT(DOW FROM d)::int <> hp.weekly_rest_day;
$$;
GRANT EXECUTE ON FUNCTION public.leave_working_days(UUID, DATE, DATE) TO authenticated;

-- One day off in kind costs one working day: her shift minus her break.
CREATE OR REPLACE FUNCTION public.leave_minutes_per_day(p_helper_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT GREATEST(
        0,
        (EXTRACT(EPOCH FROM (hp.shift_end - hp.shift_start)) / 60)::int
        - CASE
            WHEN hp.break_start IS NOT NULL AND hp.break_end IS NOT NULL
                 AND hp.break_end > hp.break_start
            THEN (EXTRACT(EPOCH FROM (hp.break_end - hp.break_start)) / 60)::int
            ELSE 0
          END
    )
    FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id
      AND hp.household_id = public.current_household_id();
$$;
GRANT EXECUTE ON FUNCTION public.leave_minutes_per_day(UUID) TO authenticated;

-- The service year containing p_on, counted from her first day
-- (started_on; created_at for rows from before that column). SIL starts in
-- her second service year.
CREATE OR REPLACE FUNCTION public.sil_service_year(p_helper_id UUID, p_on DATE)
RETURNS TABLE (year_start DATE, year_end DATE, eligible BOOLEAN, eligible_from DATE)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_first DATE;
    v_years INT;
BEGIN
    SELECT COALESCE(hp.started_on, hp.created_at::date) INTO v_first
    FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id
      AND hp.household_id = public.current_household_id();

    IF v_first IS NULL THEN
        RETURN;
    END IF;

    eligible_from := (v_first + interval '1 year')::date;
    IF p_on < v_first THEN
        year_start := v_first;
        year_end := (v_first + interval '1 year' - interval '1 day')::date;
        eligible := false;
        RETURN NEXT;
        RETURN;
    END IF;

    v_years := EXTRACT(YEAR FROM age(p_on, v_first))::int;
    year_start := (v_first + make_interval(years => v_years))::date;
    year_end := (v_first + make_interval(years => v_years + 1) - interval '1 day')::date;
    eligible := v_years >= 1;
    RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.sil_service_year(UUID, DATE) TO authenticated;

-- SIL days left in the service year containing p_on (today by default):
-- 5 minus approved SIL that starts in that year. 0 before her first year.
CREATE OR REPLACE FUNCTION public.sil_balance_days(p_helper_id UUID, p_on DATE DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_year RECORD;
    v_used INT;
BEGIN
    SELECT * INTO v_year
    FROM public.sil_service_year(p_helper_id, COALESCE(p_on, public.household_today()));

    IF NOT FOUND OR NOT v_year.eligible THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(SUM(l.days), 0) INTO v_used
    FROM public.leave_requests l
    WHERE l.helper_id = p_helper_id
      AND l.kind = 'sil'
      AND l.status = 'approved'
      AND l.start_date BETWEEN v_year.year_start AND v_year.year_end;

    -- RA 10361 section 29: five days a year.
    RETURN GREATEST(0, 5 - v_used);
END;
$$;
GRANT EXECUTE ON FUNCTION public.sil_balance_days(UUID, DATE) TO authenticated;

-- Rest owed now also pays for approved days off in kind. Same definition as
-- add-rest-off-requests.sql otherwise (premium_pay counted in, see the note
-- there), so there is still exactly one rest-owed number for both apps and
-- both approval guards.
CREATE OR REPLACE FUNCTION public.rest_owed_balance_minutes(p_helper_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT GREATEST(
        0,
        COALESCE((
            SELECT SUM(GREATEST(0, le.duration_minutes + COALESCE(le.adjust_minutes, 0)))
            FROM public.ledger_entries le
            WHERE le.helper_id = p_helper_id
              AND (le.resolution_type IS NULL
                   OR le.resolution_type IN ('rest_owed', 'premium_pay'))
        ), 0)
        -
        COALESCE((
            SELECT SUM(r.minutes)
            FROM public.rest_off_requests r
            WHERE r.helper_id = p_helper_id
              AND r.status = 'approved'
        ), 0)
        -
        COALESCE((
            SELECT SUM(l.minutes)
            FROM public.leave_requests l
            WHERE l.helper_id = p_helper_id
              AND l.kind = 'in_kind'
              AND l.status = 'approved'
        ), 0)
    )::int;
$$;
GRANT EXECUTE ON FUNCTION public.rest_owed_balance_minutes(UUID) TO authenticated;

-- --------------------------------------------------------------------------
-- 4. The one set of rules every write path checks. Internal: callers hold
--    the lock on her helper_profiles row first, so two requests or approvals
--    can't both pass a balance or overlap check (the C39 lesson, see
--    add-rest-off-validation.sql). p_count_pending: a NEW request also counts
--    what's already waiting, so she can't queue more than she has; an
--    approval counts only what's approved.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_guard(
    p_helper_id UUID,
    p_kind TEXT,
    p_start DATE,
    p_end DATE,
    p_exclude_id UUID,
    p_count_pending BOOLEAN
)
RETURNS TABLE (leave_days INT, leave_minutes INT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days INT;
    v_minutes INT := 0;
    v_per_day INT;
    v_clash RECORD;
    v_year RECORD;
    v_used INT;
    v_balance INT;
    v_pending INT;
BEGIN
    IF p_kind NOT IN ('sil', 'in_kind', 'unpaid', 'extra_paid') THEN
        RAISE EXCEPTION 'Unknown kind of leave: %', p_kind;
    END IF;
    IF p_end < p_start THEN
        RAISE EXCEPTION 'The last day must be on or after the first day';
    END IF;
    IF p_end - p_start + 1 > 90 THEN
        RAISE EXCEPTION 'One request can cover at most 90 days';
    END IF;

    v_days := public.leave_working_days(p_helper_id, p_start, p_end);
    IF v_days = 0 THEN
        RAISE EXCEPTION 'Those dates are all rest days, so there is nothing to take';
    END IF;

    SELECT l.kind, l.status, l.start_date, l.end_date INTO v_clash
    FROM public.leave_requests l
    WHERE l.helper_id = p_helper_id
      AND l.status IN ('pending', 'approved')
      AND l.id IS DISTINCT FROM p_exclude_id
      AND p_start <= l.end_date
      AND p_end >= l.start_date
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'That overlaps % leave (%) from % to %',
            v_clash.status, v_clash.kind, v_clash.start_date, v_clash.end_date;
    END IF;

    SELECT r.rest_date, r.status INTO v_clash
    FROM public.rest_off_requests r
    WHERE r.helper_id = p_helper_id
      AND r.status IN ('pending', 'approved')
      AND r.rest_date BETWEEN p_start AND p_end
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'There is % rest off on %; cancel or decline it first',
            v_clash.status, v_clash.rest_date;
    END IF;

    IF p_kind = 'sil' THEN
        SELECT * INTO v_year FROM public.sil_service_year(p_helper_id, p_start);
        IF NOT FOUND OR NOT v_year.eligible THEN
            RAISE EXCEPTION 'Service incentive leave starts after one year of service (from %)',
                v_year.eligible_from;
        END IF;
        IF p_end > v_year.year_end THEN
            RAISE EXCEPTION 'A new service year starts on %; split this into two requests',
                v_year.year_end + 1;
        END IF;
        SELECT COALESCE(SUM(l.days), 0) INTO v_used
        FROM public.leave_requests l
        WHERE l.helper_id = p_helper_id
          AND l.kind = 'sil'
          AND l.id IS DISTINCT FROM p_exclude_id
          AND (l.status = 'approved' OR (p_count_pending AND l.status = 'pending'))
          AND l.start_date BETWEEN v_year.year_start AND v_year.year_end;
        IF v_days > 5 - v_used THEN
            RAISE EXCEPTION 'Not enough service incentive leave: % days left this service year, % asked for',
                GREATEST(0, 5 - v_used), v_days;
        END IF;

    ELSIF p_kind = 'in_kind' THEN
        v_per_day := public.leave_minutes_per_day(p_helper_id);
        IF COALESCE(v_per_day, 0) = 0 THEN
            RAISE EXCEPTION 'Her shift hours are not set, so a day off in kind can''t be counted';
        END IF;
        v_minutes := v_days * v_per_day;
        v_balance := public.rest_owed_balance_minutes(p_helper_id);
        v_pending := 0;
        IF p_count_pending THEN
            SELECT COALESCE(SUM(l.minutes), 0) INTO v_pending
            FROM public.leave_requests l
            WHERE l.helper_id = p_helper_id AND l.kind = 'in_kind' AND l.status = 'pending'
              AND l.id IS DISTINCT FROM p_exclude_id;
            v_pending := v_pending + COALESCE((
                SELECT SUM(r.minutes) FROM public.rest_off_requests r
                WHERE r.helper_id = p_helper_id AND r.status = 'pending'
            ), 0);
        END IF;
        IF v_minutes + v_pending > v_balance THEN
            RAISE EXCEPTION 'Not enough rest owed: % minutes available, % already requested, % more asked for',
                v_balance, v_pending, v_minutes;
        END IF;
    END IF;

    RETURN QUERY SELECT v_days, v_minutes;
END;
$$;
REVOKE ALL ON FUNCTION public.leave_guard(UUID, TEXT, DATE, DATE, UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 5. She asks.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_leave(
    p_helper_id UUID,
    p_kind TEXT,
    p_reason TEXT,
    p_start DATE,
    p_end DATE,
    p_note TEXT DEFAULT NULL
)
RETURNS TABLE (request_id UUID, requested_days INT, requested_minutes INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_owner UUID;
    v_today DATE;
    v_check RECORD;
    v_id UUID;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock her row: the contended resource is her balance and her days.
    SELECT hp.user_id INTO v_owner
    FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id AND hp.household_id = v_household_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;
    IF v_owner IS NULL OR v_owner <> auth.uid() THEN
        RAISE EXCEPTION 'Only she can ask for her own leave; a manager records it instead';
    END IF;

    v_today := public.household_today();
    IF p_start < v_today THEN
        RAISE EXCEPTION 'That date has already passed (today is %)', v_today;
    END IF;

    SELECT * INTO v_check
    FROM public.leave_guard(p_helper_id, p_kind, p_start, p_end, NULL, true);

    INSERT INTO public.leave_requests (
        helper_id, kind, reason, start_date, end_date, days, minutes, note, requested_by
    )
    VALUES (
        p_helper_id, p_kind, COALESCE(p_reason, 'other'), p_start, p_end,
        v_check.leave_days, v_check.leave_minutes, p_note, auth.uid()
    )
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_check.leave_days, v_check.leave_minutes;
END;
$$;
GRANT EXECUTE ON FUNCTION public.request_leave(UUID, TEXT, TEXT, DATE, DATE, TEXT) TO authenticated;

-- --------------------------------------------------------------------------
-- 6. A manager records leave for her (she called in sick). Approved at once;
--    past dates allowed, since sick days are usually recorded after. She
--    confirms or disputes it from her app (ack_leave).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_leave(
    p_helper_id UUID,
    p_kind TEXT,
    p_reason TEXT,
    p_start DATE,
    p_end DATE,
    p_note TEXT DEFAULT NULL
)
RETURNS TABLE (request_id UUID, recorded_days INT, recorded_minutes INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_check RECORD;
    v_id UUID;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();
    IF v_user_type IS NULL OR v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only a manager can record leave';
    END IF;

    PERFORM 1
    FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id AND hp.household_id = v_household_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;

    SELECT * INTO v_check
    FROM public.leave_guard(p_helper_id, p_kind, p_start, p_end, NULL, false);

    INSERT INTO public.leave_requests (
        helper_id, kind, reason, start_date, end_date, days, minutes, note,
        status, requested_by, decided_by, decided_at, helper_ack
    )
    VALUES (
        p_helper_id, p_kind, COALESCE(p_reason, 'other'), p_start, p_end,
        v_check.leave_days, v_check.leave_minutes, p_note,
        'approved', auth.uid(), auth.uid(), timezone('utc', now()), 'pending'
    )
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_check.leave_days, v_check.leave_minutes;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_leave(UUID, TEXT, TEXT, DATE, DATE, TEXT) TO authenticated;

-- --------------------------------------------------------------------------
-- 7. A manager decides her request. Rechecked under the lock, with days and
--    minutes recomputed and snapshotted now.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_leave_request(
    p_request_id UUID,
    p_decision TEXT,
    p_decline_reason TEXT DEFAULT NULL
)
RETURNS TABLE (request_id UUID, resulting_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_req RECORD;
    v_check RECORD;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF p_decision NOT IN ('approved', 'declined') THEN
        RAISE EXCEPTION 'Decision must be approved or declined';
    END IF;

    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();
    IF v_user_type IS NULL OR v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only a manager can decide a leave request';
    END IF;

    SELECT l.helper_id INTO v_req
    FROM public.leave_requests l
    JOIN public.helper_profiles hp ON hp.id = l.helper_id
    WHERE l.id = p_request_id AND hp.household_id = v_household_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Leave request not found';
    END IF;

    -- Her row first, then the request: the same order every path takes.
    PERFORM 1 FROM public.helper_profiles WHERE id = v_req.helper_id FOR UPDATE;
    SELECT l.helper_id, l.kind, l.start_date, l.end_date, l.status INTO v_req
    FROM public.leave_requests l
    WHERE l.id = p_request_id
    FOR UPDATE;

    IF v_req.status <> 'pending' THEN
        RAISE EXCEPTION 'That request was already %', v_req.status;
    END IF;

    IF p_decision = 'approved' THEN
        SELECT * INTO v_check
        FROM public.leave_guard(
            v_req.helper_id, v_req.kind, v_req.start_date, v_req.end_date, p_request_id, false
        );
        UPDATE public.leave_requests l
        SET status = 'approved',
            days = v_check.leave_days,
            minutes = v_check.leave_minutes,
            decided_by = auth.uid(),
            decided_at = timezone('utc', now())
        WHERE l.id = p_request_id;
    ELSE
        UPDATE public.leave_requests l
        SET status = 'declined',
            decline_reason = p_decline_reason,
            decided_by = auth.uid(),
            decided_at = timezone('utc', now())
        WHERE l.id = p_request_id;
    END IF;

    RETURN QUERY SELECT p_request_id, p_decision;
END;
$$;
GRANT EXECUTE ON FUNCTION public.decide_leave_request(UUID, TEXT, TEXT) TO authenticated;

-- --------------------------------------------------------------------------
-- 8. Cancel. She (for her own) or a manager. A pending request any time; an
--    approved one only before it starts and before any payslip has settled
--    it. Cancelling approved leave gives the days back by itself, since every
--    balance counts approved rows only.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_leave_request(p_request_id UUID)
RETURNS TABLE (request_id UUID, resulting_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_req RECORD;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();

    SELECT l.helper_id, hp.user_id AS owner INTO v_req
    FROM public.leave_requests l
    JOIN public.helper_profiles hp ON hp.id = l.helper_id
    WHERE l.id = p_request_id AND hp.household_id = v_household_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Leave request not found';
    END IF;

    IF COALESCE(v_user_type, '') NOT IN ('primary_manager', 'co_manager')
       AND (v_req.owner IS NULL OR v_req.owner <> auth.uid()) THEN
        RAISE EXCEPTION 'Forbidden: only she or a manager can cancel this';
    END IF;

    PERFORM 1 FROM public.helper_profiles WHERE id = v_req.helper_id FOR UPDATE;
    SELECT l.status, l.start_date, l.settled_in_payslip_id INTO v_req
    FROM public.leave_requests l
    WHERE l.id = p_request_id
    FOR UPDATE;

    IF v_req.status NOT IN ('pending', 'approved') THEN
        RAISE EXCEPTION 'That request was already %', v_req.status;
    END IF;
    IF v_req.status = 'approved' THEN
        IF v_req.start_date <= public.household_today() THEN
            RAISE EXCEPTION 'That leave has already started, so it can''t be cancelled';
        END IF;
        IF v_req.settled_in_payslip_id IS NOT NULL THEN
            RAISE EXCEPTION 'That leave is already on a payslip, so it can''t be cancelled';
        END IF;
    END IF;

    UPDATE public.leave_requests l
    SET status = 'cancelled',
        cancelled_by = auth.uid(),
        cancelled_at = timezone('utc', now())
    WHERE l.id = p_request_id;

    RETURN QUERY SELECT p_request_id, 'cancelled'::TEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_leave_request(UUID) TO authenticated;

-- --------------------------------------------------------------------------
-- 9. She confirms or disputes leave a manager recorded for her. A dispute
--    doesn't undo it; it flags it for the manager, like a disputed payment.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ack_leave(
    p_request_id UUID,
    p_ack TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS TABLE (request_id UUID, resulting_ack TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF p_ack NOT IN ('confirmed', 'disputed') THEN
        RAISE EXCEPTION 'Answer must be confirmed or disputed';
    END IF;

    SELECT l.helper_ack, hp.user_id AS owner INTO v_req
    FROM public.leave_requests l
    JOIN public.helper_profiles hp ON hp.id = l.helper_id
    WHERE l.id = p_request_id
    FOR UPDATE OF l;
    IF NOT FOUND OR v_req.owner IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Leave request not found';
    END IF;
    IF v_req.helper_ack IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'There is nothing to confirm on that leave';
    END IF;

    UPDATE public.leave_requests l
    SET helper_ack = p_ack,
        helper_ack_at = timezone('utc', now()),
        helper_ack_note = p_note
    WHERE l.id = p_request_id;

    RETURN QUERY SELECT p_request_id, p_ack;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ack_leave(UUID, TEXT, TEXT) TO authenticated;
