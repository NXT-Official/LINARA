-- Session C of PAYMENTS_REMEDIATION.md, time-off-in-lieu branch. Apply by hand
-- in the Supabase SQL editor. Idempotent and safe to re-run.
--
-- Depends on add-manager-bootstrap.sql (households/helper_profiles) and
-- whichever migration created ledger_entries.
--
-- --------------------------------------------------------------------------
-- PRODUCT DECISION (user, 2026-08-16): after-hours work is TIME, not money.
-- --------------------------------------------------------------------------
-- "Live-in kasambahay are not paid hourly overtime the way an office worker
-- is, so the ledger does not track OT pay as its default. Off-hours work is
-- balanced by rest owed (time off in lieu)... the after-hours balance accrues
-- in hours/minutes of rest, not pesos."
--
-- So there is no peso path here at all. The kasambahay REQUESTS rest off (a
-- date and a time range), a manager APPROVES it, and the approved duration is
-- DEBITED from the accrued balance. Cash treatment of rest-day premium is
-- explicitly deferred pending a separate policy decision -- see the note on
-- premium_pay below, which is the one judgement call this migration had to
-- make in the meantime.
--
-- The line this exists to hold, from the same decision: "Available means 'you
-- may disturb me,' never 'this is free.'" Every off-shift completion already
-- accrues a ledger_entries row; this is the other half -- the accrual has to
-- be redeemable, or "owed" is a word with no mechanism behind it.
--
-- --------------------------------------------------------------------------
-- BALANCE = accrued - approved. Both halves matter.
-- --------------------------------------------------------------------------
-- Accrued: SUM(duration_minutes + adjust_minutes) over the helper's
-- ledger_entries, floored at zero per entry (mirrors ledgerEntryMinutes() in
-- both apps -- a negative manual adjustment shrinks that entry, it does not
-- claw back others).
--
-- NOTE on premium_pay entries: ledger_entries.resolution_type is
-- 'rest_owed' | 'premium_pay' | NULL, and BOTH apps currently exclude
-- 'premium_pay' from the rest-owed counter on the assumption it gets paid in
-- cash instead. But no code path has ever paid it -- initiate_payslip does not
-- read ledger_entries at all -- so premium_pay minutes today accrue to
-- literally nothing. Since the cash policy is deferred, counting them here is
-- the only reading that does not leave rest-DAY work (the kind the decision
-- calls out as mattering most) earning less than ordinary off-shift work.
-- They stay tagged as premium_pay, so if a cash policy later lands, only the
-- UNSETTLED ones convert -- anything already redeemed as time is settled and
-- cannot be double-counted. Flip COUNT_PREMIUM_AS_REST below to change this.

-- --------------------------------------------------------------------------
-- 1. The request table.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rest_off_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID NOT NULL REFERENCES public.helper_profiles(id) ON DELETE CASCADE,
    -- The civil date being requested off, in the household's timezone (C38).
    rest_date DATE NOT NULL,
    -- Half-open [start, end) within that date. Stored as TIME, read as
    -- "HH:MM:SS" -- see C34 before parsing these on a client.
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    -- Denormalized so the debit is a stable historical fact even if someone
    -- later edits the window. Same "snapshot at decision time" reasoning as
    -- payslips' base_pay (C21) and ledger_entries.title (C10).
    minutes INT NOT NULL CHECK (minutes > 0),
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
    decided_by UUID REFERENCES public.user_profiles(id),
    decided_at TIMESTAMPTZ,
    decline_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_rest_off_requests_helper
    ON public.rest_off_requests (helper_id, rest_date DESC);

-- Only APPROVED requests debit the balance, so only they need to be unique per
-- window -- a helper may re-request a slot that was declined.
CREATE UNIQUE INDEX IF NOT EXISTS rest_off_one_approved_per_window
    ON public.rest_off_requests (helper_id, rest_date, start_time, end_time)
    WHERE status = 'approved';

-- --------------------------------------------------------------------------
-- 2. RLS. Same "scope via join through helper_profiles" pattern as
--    ledger_entries_isolation / vales_isolation / payslips_isolation.
--    Deliberately NOT helper_notes-style privacy: a rest-off request is
--    addressed TO the manager, so it is meant to be readable by them.
-- --------------------------------------------------------------------------
ALTER TABLE public.rest_off_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rest_off_requests_isolation ON public.rest_off_requests;
CREATE POLICY rest_off_requests_isolation ON public.rest_off_requests
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = rest_off_requests.helper_id
              AND hp.household_id = public.current_household_id()
        )
    );

-- --------------------------------------------------------------------------
-- 3. The balance, in minutes. One definition, read by both apps and by the
--    approval guard -- so the manager's number, the helper's number, and the
--    number the guard enforces cannot drift apart. ("...surfaced to both sides
--    as the same number.")
-- --------------------------------------------------------------------------
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
              -- COUNT_PREMIUM_AS_REST: premium_pay counted in, because no cash
              -- path exists yet. See the header note before changing this.
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
    )::int;
$$;

GRANT EXECUTE ON FUNCTION public.rest_owed_balance_minutes(UUID) TO authenticated;

-- --------------------------------------------------------------------------
-- 4. Request rest off. Helper-initiated; the helper's own session is the
--    caller, so this checks household membership rather than manager rights.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_rest_off(
    p_helper_id UUID,
    p_rest_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_note TEXT DEFAULT NULL
)
-- OUT names are deliberately NOT bare `minutes`/`status`: plpgsql resolves an
-- unqualified column reference against OUT params too, so `SUM(minutes)` below
-- would raise "column reference is ambiguous" at runtime. Same precaution as
-- initiate_payslip's resulting_status. Every query in the body also qualifies
-- its columns with a table alias.
RETURNS TABLE (request_id UUID, requested_minutes INT, balance_after_if_approved INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_minutes INT;
    v_balance INT;
    v_pending INT;
    v_request_id UUID;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.helper_profiles
        WHERE id = p_helper_id AND household_id = v_household_id
    ) THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'The end time must be after the start time';
    END IF;

    v_minutes := EXTRACT(EPOCH FROM (p_end_time - p_start_time))::int / 60;

    IF v_minutes <= 0 THEN
        RAISE EXCEPTION 'That window is zero minutes long';
    END IF;

    v_balance := public.rest_owed_balance_minutes(p_helper_id);

    -- Pending requests are not debited yet, but a helper shouldn't be able to
    -- queue up more than they have -- otherwise the manager is handed a stack
    -- of requests that cannot all be approved, and whoever approves last gets
    -- an error they did nothing to cause.
    SELECT COALESCE(SUM(r.minutes), 0) INTO v_pending
    FROM public.rest_off_requests r
    WHERE r.helper_id = p_helper_id AND r.status = 'pending';

    IF v_minutes + v_pending > v_balance THEN
        RAISE EXCEPTION 'Not enough rest owed: % minutes available, % already requested, % more asked for',
            v_balance, v_pending, v_minutes;
    END IF;

    INSERT INTO public.rest_off_requests (
        helper_id, rest_date, start_time, end_time, minutes, note
    )
    VALUES (p_helper_id, p_rest_date, p_start_time, p_end_time, v_minutes, p_note)
    RETURNING id INTO v_request_id;

    RETURN QUERY SELECT v_request_id, v_minutes, (v_balance - v_minutes)::int;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_rest_off(UUID, DATE, TIME, TIME, TEXT) TO authenticated;

-- --------------------------------------------------------------------------
-- 5. Approve or decline. Manager-gated, same posture as initiate_payslip and
--    decideVale. The balance re-check happens HERE, under a row lock, because
--    the check at request time is advisory -- minutes can be spent by another
--    approval in between. Same TOCTOU discipline as C36: two managers (or one
--    in two tabs) must not be able to approve past the balance.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_rest_off_request(
    p_request_id UUID,
    p_decision TEXT,
    p_decline_reason TEXT DEFAULT NULL
)
-- `resulting_status`, not `status`, for the same ambiguity reason as
-- request_rest_off above.
RETURNS TABLE (request_id UUID, resulting_status TEXT, balance_after INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_helper_id UUID;
    v_minutes INT;
    v_status TEXT;
    v_balance INT;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_decision NOT IN ('approved', 'declined') THEN
        RAISE EXCEPTION 'Decision must be approved or declined';
    END IF;

    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();
    IF v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only managers can decide a rest-off request';
    END IF;

    -- Resolve the request and confirm it belongs to this household.
    SELECT r.helper_id INTO v_helper_id
    FROM public.rest_off_requests r
    JOIN public.helper_profiles hp ON hp.id = r.helper_id
    WHERE r.id = p_request_id
      AND hp.household_id = v_household_id;

    IF v_helper_id IS NULL THEN
        RAISE EXCEPTION 'Rest-off request not found';
    END IF;

    -- Serialize on the HELPER, not on the request row. The contended resource
    -- is the helper's balance, and two managers approving two DIFFERENT
    -- requests lock different request rows, so a per-request lock lets them
    -- both pass the balance check and both approve. Caught by the concurrent
    -- test: 240 minutes of balance approved two 240-minute requests, and the
    -- GREATEST(0, ...) floor in rest_owed_balance_minutes then HID the
    -- overdraw by clamping the display to zero. Locking helper_profiles makes
    -- every approval for one helper take its turn.
    PERFORM 1 FROM public.helper_profiles WHERE id = v_helper_id FOR UPDATE;

    -- Re-read the request under that lock -- its status may have changed while
    -- we waited.
    SELECT r.minutes, r.status
      INTO v_minutes, v_status
    FROM public.rest_off_requests r
    WHERE r.id = p_request_id
    FOR UPDATE;

    IF v_status <> 'pending' THEN
        RAISE EXCEPTION 'That request was already %', v_status;
    END IF;

    IF p_decision = 'approved' THEN
        -- Re-check under the lock. rest_owed_balance_minutes already excludes
        -- this row (it is still 'pending'), so this is the true remaining
        -- balance.
        v_balance := public.rest_owed_balance_minutes(v_helper_id);
        IF v_minutes > v_balance THEN
            RAISE EXCEPTION 'Not enough rest owed to approve: % minutes available, % requested',
                v_balance, v_minutes;
        END IF;
    END IF;

    UPDATE public.rest_off_requests
    SET status = p_decision,
        decided_by = auth.uid(),
        decided_at = timezone('utc', now()),
        decline_reason = CASE WHEN p_decision = 'declined' THEN p_decline_reason ELSE NULL END
    WHERE id = p_request_id;

    RETURN QUERY
    SELECT p_request_id, p_decision, public.rest_owed_balance_minutes(v_helper_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_rest_off_request(UUID, TEXT, TEXT) TO authenticated;
