-- Pay periods, payments made outside Linara, 13th-month pay, her real first
-- day, and notice from her side. Closes KNOWN_GAPS.md O15 and O16 and the C60
-- residuals. Apply by hand in the Supabase SQL editor, AFTER
-- add-employment-end.sql. Idempotent and safe to re-run.
--
-- --------------------------------------------------------------------------
-- THE MODEL
-- --------------------------------------------------------------------------
-- A PAY PERIOD is one cutoff of one employment. helper_pay_periods() lists
-- every period from the day Linara started tracking her to today (or to her
-- last day), each with the days she actually worked in it -- a first period
-- starts on helper_profiles.started_on, a final one stops on ended_on -- and
-- the payslip that settled it, if any. It is the one list the web's Pay Dial,
-- Money page, Past staff and Needs You, and the mobile My Pay, all read.
--
-- A period is settled by exactly one non-failed REGULAR payslip overlapping
-- it, paid either way:
--   * through Xendit (initiate_payslip, as before, now able to target a
--     missed period instead of only the current one), or
--   * outside Linara (record_offapp_payslip): cash, bank transfer, other.
--     The row is payout_provider = 'manual', and helper_ack starts 'pending'
--     until she says in the app that she received it ('confirmed') or not
--     ('disputed'). The manager can withdraw a record she hasn't confirmed,
--     which frees the period to be paid again.
-- Both kinds share payslips_one_per_cutoff plus the overlap guard in
-- pay_target(), so a period can't be paid twice by mixing the two.
--
-- 13th-month pay (RA 10361 Sec. 25: at least 1/12 of the basic salary earned
-- in the calendar year, by Dec 24; pro-rated on separation) is a payslip of
-- kind 'thirteenth_month', computed here from the regular basic pay on
-- record for that year. Payable from December 1, or once the employment has
-- ended. No contributions and no vale are taken from it.
--
-- Periods before she was added to Linara aren't listed: they're not
-- Linara's to know about. started_on (her real first day) only moves the
-- start of the first period she has in Linara.

-- --------------------------------------------------------------------------
-- 1. Columns
-- --------------------------------------------------------------------------
ALTER TABLE public.helper_profiles
    ADD COLUMN IF NOT EXISTS started_on DATE,
    ADD COLUMN IF NOT EXISTS notice_last_day DATE,
    ADD COLUMN IF NOT EXISTS notice_note TEXT,
    ADD COLUMN IF NOT EXISTS notice_given_at TIMESTAMPTZ;

COMMENT ON COLUMN public.helper_profiles.started_on IS
    'Her first working day in this household. Defaults to the day the invite '
    'was created; the first pay period in Linara starts here.';

UPDATE public.helper_profiles hp
SET started_on = (hp.created_at AT TIME ZONE public.household_timezone(hp.household_id))::date
WHERE hp.started_on IS NULL;

ALTER TABLE public.payslips
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'regular',
    ADD COLUMN IF NOT EXISTS paid_on DATE,
    ADD COLUMN IF NOT EXISTS manual_note TEXT,
    ADD COLUMN IF NOT EXISTS helper_ack TEXT,
    ADD COLUMN IF NOT EXISTS helper_ack_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS helper_ack_note TEXT;

ALTER TABLE public.payslips DROP CONSTRAINT IF EXISTS payslips_kind_check;
ALTER TABLE public.payslips
    ADD CONSTRAINT payslips_kind_check CHECK (kind IN ('regular', 'thirteenth_month'));

ALTER TABLE public.payslips DROP CONSTRAINT IF EXISTS payslips_helper_ack_check;
ALTER TABLE public.payslips
    ADD CONSTRAINT payslips_helper_ack_check
    CHECK (helper_ack IS NULL OR helper_ack IN ('pending', 'confirmed', 'disputed'));

-- Cash, bank transfer and "other" are how a household pays outside Linara.
ALTER TABLE public.payslips DROP CONSTRAINT IF EXISTS payslips_payout_channel_code_check;
ALTER TABLE public.payslips
    ADD CONSTRAINT payslips_payout_channel_code_check
    CHECK (payout_channel_code IN ('PH_GCASH', 'PH_PAYMAYA', 'CASH', 'BANK_TRANSFER', 'OTHER'));

-- --------------------------------------------------------------------------
-- 2. Managers can still read the names of people who worked for them, so
--    "from [name]" on tasks she created survives her leaving (C60 residual).
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS user_profiles_former_staff_read ON public.user_profiles;
CREATE POLICY user_profiles_former_staff_read ON public.user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.user_id = user_profiles.id
              AND hp.household_id = public.current_household_id()
        )
    );

-- --------------------------------------------------------------------------
-- 3. Who may look at a helper's pay: a manager of her household, or herself
--    (in any household she has worked for).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_see_helper_pay(p_helper_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.helper_profiles hp
        WHERE hp.id = p_helper_id
          AND (
              hp.user_id = auth.uid()
              OR (
                  hp.household_id = public.current_household_id()
                  AND EXISTS (
                      SELECT 1 FROM public.user_profiles up
                      WHERE up.id = auth.uid()
                        AND up.user_type IN ('primary_manager', 'co_manager', 'remote_admin')
                  )
              )
          )
    );
$$;

-- --------------------------------------------------------------------------
-- 4. Every pay period of one employment, oldest first.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.helper_pay_periods(p_helper_id UUID)
RETURNS TABLE (
    full_start DATE,
    full_end DATE,
    worked_start DATE,
    worked_end DATE,
    is_current BOOLEAN,
    is_final BOOLEAN,
    payslip_id UUID,
    payslip_status TEXT,
    payslip_provider TEXT,
    payslip_ack TEXT,
    payslip_net NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_hp public.helper_profiles%ROWTYPE;
    v_tz TEXT;
    v_today DATE;
    v_started DATE;
    v_first DATE;
    v_last DATE;
    v_final BOOLEAN;
    v_day DATE;
    v_fs DATE;
    v_fe DATE;
BEGIN
    IF NOT public.can_see_helper_pay(p_helper_id) THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT * INTO v_hp FROM public.helper_profiles h WHERE h.id = p_helper_id;
    IF v_hp.status = 'PENDING_CLAIM' THEN
        RETURN;
    END IF;

    v_tz := public.household_timezone(v_hp.household_id);
    v_today := (now() AT TIME ZONE v_tz)::date;
    v_started := COALESCE(v_hp.started_on, (v_hp.created_at AT TIME ZONE v_tz)::date);
    v_first := GREATEST(v_started, (v_hp.created_at AT TIME ZONE v_tz)::date);
    v_final := v_hp.status = 'INACTIVE' AND v_hp.ended_on IS NOT NULL;
    v_last := CASE WHEN v_final THEN v_hp.ended_on ELSE v_today END;

    v_day := v_first;
    WHILE v_day <= v_last LOOP
        SELECT b.cutoff_start, b.cutoff_end INTO v_fs, v_fe
        FROM public.cutoff_bounds_for(v_day, v_hp.payday_interval) b;

        full_start := v_fs;
        full_end := v_fe;
        worked_start := GREATEST(v_fs, v_started);
        worked_end := CASE WHEN v_final THEN LEAST(v_fe, v_hp.ended_on) ELSE v_fe END;
        is_current := NOT v_final AND v_today BETWEEN v_fs AND v_fe;
        is_final := v_final AND v_hp.ended_on BETWEEN v_fs AND v_fe;

        SELECT p.id, p.payout_status, p.payout_provider, p.helper_ack, p.net_pay
          INTO payslip_id, payslip_status, payslip_provider, payslip_ack, payslip_net
        FROM public.payslips p
        WHERE p.helper_id = p_helper_id
          AND p.kind = 'regular'
          AND p.payout_status <> 'failed'
          AND p.cutoff_start <= v_fe
          AND p.cutoff_end >= v_fs
        ORDER BY p.created_at DESC
        LIMIT 1;
        IF NOT FOUND THEN
            payslip_id := NULL;
            payslip_status := NULL;
            payslip_provider := NULL;
            payslip_ack := NULL;
            payslip_net := NULL;
        END IF;

        RETURN NEXT;
        v_day := v_fe + 1;
    END LOOP;
END;
$$;

-- --------------------------------------------------------------------------
-- 5. The one period a payout is for: the current one (or, once she has left,
--    the final one) when p_cutoff_start is NULL, otherwise the period that
--    starts on p_cutoff_start. Replaces the add-employment-end.sql version,
--    which could only name the current/final one.
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.helper_pay_cutoff(UUID);
DROP FUNCTION IF EXISTS public.helper_pay_cutoff(UUID, DATE);

CREATE FUNCTION public.helper_pay_cutoff(p_helper_id UUID, p_cutoff_start DATE DEFAULT NULL)
RETURNS TABLE (
    cutoff_start DATE,
    cutoff_end DATE,
    full_cutoff_start DATE,
    full_cutoff_end DATE,
    is_final BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT pp.worked_start, pp.worked_end, pp.full_start, pp.full_end, pp.is_final
    FROM public.helper_pay_periods(p_helper_id) pp
    WHERE (p_cutoff_start IS NULL AND (pp.is_current OR pp.is_final))
       OR pp.full_start = p_cutoff_start
    ORDER BY pp.full_start DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No such pay period for this helper';
    END IF;
END;
$$;

-- --------------------------------------------------------------------------
-- 6. 13th-month pay for one employment and calendar year.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.thirteenth_month_due(p_helper_id UUID, p_year INT DEFAULT NULL)
RETURNS TABLE (
    year INT,
    period_start DATE,
    period_end DATE,
    basic_earned NUMERIC,
    amount NUMERIC,
    payslip_id UUID,
    payslip_status TEXT,
    payable BOOLEAN,
    payable_from DATE,
    due_by DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_hp public.helper_profiles%ROWTYPE;
    v_tz TEXT;
    v_today DATE;
    v_final BOOLEAN;
    v_year INT;
    v_first DATE;
BEGIN
    IF NOT public.can_see_helper_pay(p_helper_id) THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT * INTO v_hp FROM public.helper_profiles h WHERE h.id = p_helper_id;
    v_tz := public.household_timezone(v_hp.household_id);
    v_today := (now() AT TIME ZONE v_tz)::date;
    v_final := v_hp.status = 'INACTIVE' AND v_hp.ended_on IS NOT NULL;
    v_year := COALESCE(p_year, EXTRACT(YEAR FROM CASE WHEN v_final THEN v_hp.ended_on ELSE v_today END)::int);
    v_first := GREATEST(
        COALESCE(v_hp.started_on, (v_hp.created_at AT TIME ZONE v_tz)::date),
        (v_hp.created_at AT TIME ZONE v_tz)::date
    );

    year := v_year;
    period_start := GREATEST(make_date(v_year, 1, 1), v_first);
    period_end := CASE
        WHEN v_final AND EXTRACT(YEAR FROM v_hp.ended_on) = v_year THEN v_hp.ended_on
        ELSE make_date(v_year, 12, 31)
    END;

    -- Basic pay actually paid for work in that year: regular payslips that
    -- went out, less any she disputed.
    SELECT COALESCE(SUM(p.base_pay), 0) INTO basic_earned
    FROM public.payslips p
    WHERE p.helper_id = p_helper_id
      AND p.kind = 'regular'
      AND p.payout_status = 'succeeded'
      AND COALESCE(p.helper_ack, 'confirmed') <> 'disputed'
      AND EXTRACT(YEAR FROM p.cutoff_end) = v_year;

    amount := ROUND(basic_earned / 12, 2);

    SELECT p.id, p.payout_status INTO payslip_id, payslip_status
    FROM public.payslips p
    WHERE p.helper_id = p_helper_id
      AND p.kind = 'thirteenth_month'
      AND p.payout_status <> 'failed'
      AND EXTRACT(YEAR FROM p.cutoff_end) = v_year
    ORDER BY p.created_at DESC
    LIMIT 1;
    IF NOT FOUND THEN
        payslip_id := NULL;
        payslip_status := NULL;
    END IF;

    payable_from := CASE
        WHEN v_final AND EXTRACT(YEAR FROM v_hp.ended_on) = v_year THEN v_hp.ended_on
        ELSE make_date(v_year, 12, 1)
    END;
    due_by := CASE
        WHEN v_final AND EXTRACT(YEAR FROM v_hp.ended_on) = v_year THEN v_hp.ended_on
        ELSE make_date(v_year, 12, 24)
    END;
    payable := payslip_id IS NULL AND amount > 0 AND v_today >= payable_from;

    RETURN NEXT;
END;
$$;

-- --------------------------------------------------------------------------
-- 7. What a payment would be for, checked, shared by both ways of paying.
--    Raises if the period is already settled (by either kind of payment).
--    reuse_payslip_id is a FAILED row for exactly this period, which is
--    updated in place rather than duplicated (payslips_one_per_cutoff).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_target(
    p_helper_id UUID,
    p_cutoff_start DATE,
    p_kind TEXT
)
RETURNS TABLE (
    cutoff_start DATE,
    cutoff_end DATE,
    thirteenth_amount NUMERIC,
    reuse_payslip_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
-- The OUT names match payslips columns, so every query below works on
-- v_ variables and table aliases only; the OUT row is filled at the end.
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_status TEXT;
    v_start DATE;
    v_end DATE;
    v_full_start DATE;
    v_full_end DATE;
    v_amount NUMERIC;
    v_t RECORD;
    v_reuse UUID;
    v_existing_status TEXT;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    SELECT up.user_type INTO v_user_type FROM public.user_profiles up WHERE up.id = auth.uid();
    IF v_user_type IS NULL OR v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only managers can pay a helper';
    END IF;

    SELECT hp.status INTO v_status FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id AND hp.household_id = v_household_id;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;
    IF v_status = 'PENDING_CLAIM' THEN
        RAISE EXCEPTION 'This invite has not been claimed yet';
    END IF;

    IF p_kind = 'thirteenth_month' THEN
        SELECT * INTO v_t FROM public.thirteenth_month_due(p_helper_id) t;
        IF NOT v_t.payable THEN
            RAISE EXCEPTION 'No 13th-month pay is payable right now';
        END IF;
        v_start := v_t.period_start;
        v_end := v_t.period_end;
        v_amount := v_t.amount;
    ELSIF p_kind = 'regular' THEN
        SELECT c.cutoff_start, c.cutoff_end, c.full_cutoff_start, c.full_cutoff_end
          INTO v_start, v_end, v_full_start, v_full_end
        FROM public.helper_pay_cutoff(p_helper_id, p_cutoff_start) c;

        -- Settled already, by either kind of payment, under any bounds.
        IF EXISTS (
            SELECT 1 FROM public.payslips p
            WHERE p.helper_id = p_helper_id
              AND p.kind = 'regular'
              AND p.payout_status <> 'failed'
              AND p.cutoff_start <= v_full_end
              AND p.cutoff_end >= v_full_start
        ) THEN
            RAISE EXCEPTION 'A payslip already exists for this cutoff'
                USING ERRCODE = 'unique_violation';
        END IF;
    ELSE
        RAISE EXCEPTION 'Unknown payslip kind: %', p_kind;
    END IF;

    SELECT p.id, p.payout_status INTO v_reuse, v_existing_status
    FROM public.payslips p
    WHERE p.helper_id = p_helper_id
      AND p.cutoff_start = v_start
      AND p.cutoff_end = v_end;
    IF v_reuse IS NOT NULL AND v_existing_status <> 'failed' THEN
        RAISE EXCEPTION 'A payslip already exists for this cutoff'
            USING ERRCODE = 'unique_violation';
    END IF;

    cutoff_start := v_start;
    cutoff_end := v_end;
    thirteenth_amount := v_amount;
    reuse_payslip_id := v_reuse;
    RETURN NEXT;
END;
$$;

-- --------------------------------------------------------------------------
-- 8. A payment made outside Linara. Same figures and the same vale
--    settlement as a Xendit payout; payout_status 'succeeded' because the
--    household says it happened, and helper_ack 'pending' until she says so
--    too.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_offapp_payslip(
    p_helper_id UUID,
    p_base_pay NUMERIC,
    p_statutory_employee_share NUMERIC,
    p_method TEXT,
    p_paid_on DATE,
    p_note TEXT DEFAULT NULL,
    p_cutoff_start DATE DEFAULT NULL,
    p_kind TEXT DEFAULT 'regular'
)
RETURNS TABLE (payslip_id UUID, net_pay NUMERIC, cutoff_start DATE, cutoff_end DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_variable
DECLARE
    v_household_id UUID := public.current_household_id();
    v_target RECORD;
    v_base NUMERIC := p_base_pay;
    v_statutory NUMERIC := p_statutory_employee_share;
    v_vales NUMERIC := 0;
    v_net NUMERIC;
    v_id UUID;
BEGIN
    IF p_method NOT IN ('CASH', 'BANK_TRANSFER', 'OTHER') THEN
        RAISE EXCEPTION 'Unknown payment method: %', p_method;
    END IF;
    IF p_paid_on IS NULL
       OR p_paid_on > (now() AT TIME ZONE public.household_timezone(v_household_id))::date THEN
        RAISE EXCEPTION 'The payment date must be today or earlier';
    END IF;

    SELECT * INTO v_target FROM public.pay_target(p_helper_id, p_cutoff_start, p_kind) t;

    IF p_kind = 'thirteenth_month' THEN
        v_base := v_target.thirteenth_amount;
        v_statutory := 0;
    ELSE
        SELECT COALESCE(SUM(v.amount), 0) INTO v_vales
        FROM public.vales v
        WHERE v.helper_id = p_helper_id
          AND v.status = 'approved'
          AND v.settled_in_payslip_id IS NULL;
    END IF;

    v_net := GREATEST(0, v_base - v_statutory - v_vales);

    IF v_target.reuse_payslip_id IS NULL THEN
        INSERT INTO public.payslips (
            helper_id, kind, cutoff_start, cutoff_end, base_pay, statutory_employee_share,
            vale_deductions, net_pay, payout_provider, payout_channel_code,
            payout_status, requested_by, confirmed_at,
            paid_on, manual_note, helper_ack
        )
        VALUES (
            p_helper_id, p_kind, v_target.cutoff_start, v_target.cutoff_end, v_base, v_statutory,
            v_vales, v_net, 'manual', p_method,
            'succeeded', auth.uid(), timezone('utc', now()),
            p_paid_on, NULLIF(TRIM(p_note), ''), 'pending'
        )
        RETURNING id INTO v_id;
    ELSE
        v_id := v_target.reuse_payslip_id;
        UPDATE public.payslips SET
            kind = p_kind,
            base_pay = v_base,
            statutory_employee_share = v_statutory,
            vale_deductions = v_vales,
            net_pay = v_net,
            payout_provider = 'manual',
            payout_channel_code = p_method,
            payout_external_id = NULL,
            payout_status = 'succeeded',
            failure_reason = NULL,
            requested_by = auth.uid(),
            requested_at = timezone('utc', now()),
            confirmed_at = timezone('utc', now()),
            paid_on = p_paid_on,
            manual_note = NULLIF(TRIM(p_note), ''),
            helper_ack = 'pending',
            helper_ack_at = NULL,
            helper_ack_note = NULL
        WHERE id = v_id;
    END IF;

    IF p_kind = 'regular' THEN
        UPDATE public.vales v
        SET settled_in_payslip_id = v_id
        WHERE v.helper_id = p_helper_id
          AND v.status = 'approved'
          AND v.settled_in_payslip_id IS NULL;
    END IF;

    RETURN QUERY SELECT v_id, v_net, v_target.cutoff_start, v_target.cutoff_end;
END;
$$;

-- Take back an off-app record she hasn't confirmed (a mistake, or she said
-- she didn't receive it). Its vales go back to outstanding and the period is
-- payable again. A confirmed record is part of both sides' history and stays.
CREATE OR REPLACE FUNCTION public.withdraw_offapp_payslip(p_payslip_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_type TEXT;
    v_row public.payslips%ROWTYPE;
BEGIN
    SELECT up.user_type INTO v_user_type FROM public.user_profiles up WHERE up.id = auth.uid();
    IF v_user_type IS NULL OR v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only managers can withdraw a payment record';
    END IF;

    SELECT p.* INTO v_row FROM public.payslips p
    JOIN public.helper_profiles hp ON hp.id = p.helper_id
    WHERE p.id = p_payslip_id AND hp.household_id = public.current_household_id()
    FOR UPDATE OF p;
    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'Payment record not found';
    END IF;
    IF v_row.payout_provider <> 'manual' THEN
        RAISE EXCEPTION 'Only a payment recorded outside Linara can be withdrawn';
    END IF;
    IF v_row.helper_ack = 'confirmed' THEN
        RAISE EXCEPTION 'She has confirmed this payment, so it stays on the record';
    END IF;

    UPDATE public.vales SET settled_in_payslip_id = NULL WHERE settled_in_payslip_id = p_payslip_id;
    DELETE FROM public.payslips WHERE id = p_payslip_id;
END;
$$;

-- Her answer to "did you receive this?". Hers alone, in any household she
-- has worked for. A dispute can later become a confirmation (it arrived
-- late), not the other way round.
CREATE OR REPLACE FUNCTION public.acknowledge_offapp_payslip(
    p_payslip_id UUID,
    p_received BOOLEAN,
    p_note TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.payslips%ROWTYPE;
    v_next TEXT := CASE WHEN p_received THEN 'confirmed' ELSE 'disputed' END;
BEGIN
    SELECT p.* INTO v_row FROM public.payslips p
    JOIN public.helper_profiles hp ON hp.id = p.helper_id
    WHERE p.id = p_payslip_id AND hp.user_id = auth.uid()
    FOR UPDATE OF p;
    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'Payment record not found';
    END IF;
    IF v_row.payout_provider <> 'manual' THEN
        RAISE EXCEPTION 'This payment went through Linara and needs no confirmation';
    END IF;
    IF v_row.helper_ack = 'confirmed' THEN
        RAISE EXCEPTION 'Already confirmed';
    END IF;
    IF v_row.helper_ack = 'disputed' AND v_next = 'disputed' THEN
        RAISE EXCEPTION 'Already disputed';
    END IF;

    UPDATE public.payslips
    SET helper_ack = v_next,
        helper_ack_at = timezone('utc', now()),
        helper_ack_note = NULLIF(TRIM(p_note), '')
    WHERE id = p_payslip_id;

    RETURN v_next;
END;
$$;

-- --------------------------------------------------------------------------
-- 9. Notice from her side. Recorded on her employment for the manager to
--    see; only a manager ENDS the employment (with final pay and her tasks
--    to settle), usually on the day she gave.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.give_notice(p_helper_id UUID, p_last_day DATE, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hp public.helper_profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_hp FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id AND hp.user_id = auth.uid() AND hp.status = 'ACTIVE';
    IF v_hp.id IS NULL THEN
        RAISE EXCEPTION 'Only she can give notice on her current employment';
    END IF;
    IF p_last_day IS NULL
       OR p_last_day < (now() AT TIME ZONE public.household_timezone(v_hp.household_id))::date THEN
        RAISE EXCEPTION 'Her last day must be today or later';
    END IF;

    UPDATE public.helper_profiles
    SET notice_last_day = p_last_day,
        notice_note = NULLIF(TRIM(p_note), ''),
        notice_given_at = timezone('utc', now())
    WHERE id = p_helper_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_notice(p_helper_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.helper_profiles
    SET notice_last_day = NULL, notice_note = NULL, notice_given_at = NULL
    WHERE id = p_helper_id AND user_id = auth.uid() AND status = 'ACTIVE';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only she can withdraw her notice';
    END IF;
END;
$$;

-- --------------------------------------------------------------------------
-- 10. employment_end_preview, now counting every unpaid period (not just the
--     one before her last) and ignoring 13th-month rows when checking what
--     was already paid. end_helper_employment also clears a notice.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employment_end_preview(p_helper_id UUID, p_last_day DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_hp public.helper_profiles%ROWTYPE;
    v_tz TEXT;
    v_today DATE;
    v_started DATE;
    v_start DATE;
    v_full_end DATE;
    v_latest_paid_end DATE;
    v_problem TEXT;
    v_unpaid INT;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();
    IF v_user_type IS NULL OR v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only managers can end an employment';
    END IF;

    SELECT * INTO v_hp FROM public.helper_profiles
    WHERE id = p_helper_id AND household_id = v_household_id;
    IF v_hp.id IS NULL THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;

    v_tz := public.household_timezone(v_household_id);
    v_today := (now() AT TIME ZONE v_tz)::date;
    v_started := COALESCE(v_hp.started_on, (v_hp.created_at AT TIME ZONE v_tz)::date);

    SELECT b.cutoff_start, b.cutoff_end INTO v_start, v_full_end
    FROM public.cutoff_bounds_for(p_last_day, v_hp.payday_interval) b;
    v_start := GREATEST(v_start, v_started);

    SELECT MAX(p.cutoff_end) INTO v_latest_paid_end
    FROM public.payslips p
    WHERE p.helper_id = p_helper_id AND p.kind = 'regular' AND p.payout_status <> 'failed';

    -- Closed periods before her final one with no payment of either kind.
    SELECT COUNT(*) INTO v_unpaid
    FROM public.helper_pay_periods(p_helper_id) pp
    WHERE pp.payslip_id IS NULL AND pp.full_end < v_start;

    v_problem := CASE
        WHEN v_hp.status <> 'ACTIVE' THEN 'not_active'
        WHEN p_last_day > v_today THEN 'future'
        WHEN p_last_day < v_started THEN 'before_start'
        WHEN v_latest_paid_end IS NOT NULL AND v_latest_paid_end > p_last_day THEN 'already_paid_past'
        ELSE NULL
    END;

    RETURN jsonb_build_object(
        'problem', v_problem,
        'today', v_today,
        'started_on', v_started,
        'latest_paid_cutoff_end', v_latest_paid_end,
        'final_cutoff_start', v_start,
        'final_cutoff_end', p_last_day,
        'full_cutoff_start', (SELECT b.cutoff_start FROM public.cutoff_bounds_for(p_last_day, v_hp.payday_interval) b),
        'full_cutoff_end', v_full_end,
        'final_cutoff_paid', EXISTS (
            SELECT 1 FROM public.payslips p
            WHERE p.helper_id = p_helper_id AND p.kind = 'regular'
              AND p.payout_status <> 'failed'
              AND p.cutoff_start <= v_full_end AND p.cutoff_end >= v_start
        ),
        'unpaid_periods', v_unpaid,
        'open_tasks', (
            SELECT COUNT(*) FROM public.tickets t
            WHERE t.helper_id = p_helper_id AND t.status <> 'done'
        ),
        'pending_vales', (
            SELECT COUNT(*) FROM public.vales v
            WHERE v.helper_id = p_helper_id AND v.status = 'pending'
        ),
        'unsettled_vale_total', (
            SELECT COALESCE(SUM(v.amount), 0) FROM public.vales v
            WHERE v.helper_id = p_helper_id AND v.status = 'approved'
              AND v.settled_in_payslip_id IS NULL
        ),
        'pending_rest_off', (
            SELECT COUNT(*) FROM public.rest_off_requests r
            WHERE r.helper_id = p_helper_id AND r.status = 'pending'
        ),
        'future_rest_off', (
            SELECT COUNT(*) FROM public.rest_off_requests r
            WHERE r.helper_id = p_helper_id AND r.status = 'approved' AND r.rest_date > p_last_day
        ),
        'rest_owed_minutes', public.rest_owed_balance_minutes(p_helper_id),
        'base_paid_this_year', (
            SELECT COALESCE(SUM(p.base_pay), 0) FROM public.payslips p
            WHERE p.helper_id = p_helper_id AND p.kind = 'regular'
              AND p.payout_status = 'succeeded'
              AND COALESCE(p.helper_ack, 'confirmed') <> 'disputed'
              AND EXTRACT(YEAR FROM p.cutoff_end) = EXTRACT(YEAR FROM p_last_day)
        )
    );
END;
$$;

-- Wraps add-employment-end.sql's version: same work, plus clearing her notice.
CREATE OR REPLACE FUNCTION public.clear_notice_on_end()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'INACTIVE' AND OLD.status IS DISTINCT FROM 'INACTIVE' THEN
        NEW.notice_last_day := NULL;
        NEW.notice_note := NULL;
        NEW.notice_given_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS helper_profiles_clear_notice_on_end ON public.helper_profiles;
CREATE TRIGGER helper_profiles_clear_notice_on_end
    BEFORE UPDATE OF status ON public.helper_profiles
    FOR EACH ROW EXECUTE FUNCTION public.clear_notice_on_end();

REVOKE ALL ON FUNCTION public.can_see_helper_pay(UUID) FROM public, anon;
REVOKE ALL ON FUNCTION public.helper_pay_periods(UUID) FROM public, anon;
REVOKE ALL ON FUNCTION public.helper_pay_cutoff(UUID, DATE) FROM public, anon;
REVOKE ALL ON FUNCTION public.thirteenth_month_due(UUID, INT) FROM public, anon;
REVOKE ALL ON FUNCTION public.pay_target(UUID, DATE, TEXT) FROM public, anon;
REVOKE ALL ON FUNCTION public.record_offapp_payslip(UUID, NUMERIC, NUMERIC, TEXT, DATE, TEXT, DATE, TEXT) FROM public, anon;
REVOKE ALL ON FUNCTION public.withdraw_offapp_payslip(UUID) FROM public, anon;
REVOKE ALL ON FUNCTION public.acknowledge_offapp_payslip(UUID, BOOLEAN, TEXT) FROM public, anon;
REVOKE ALL ON FUNCTION public.give_notice(UUID, DATE, TEXT) FROM public, anon;
REVOKE ALL ON FUNCTION public.withdraw_notice(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_see_helper_pay(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_pay_periods(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_pay_cutoff(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.thirteenth_month_due(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_target(UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_offapp_payslip(UUID, NUMERIC, NUMERIC, TEXT, DATE, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_offapp_payslip(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_offapp_payslip(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.give_notice(UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_notice(UUID) TO authenticated;

-- --------------------------------------------------------------------------
-- 11. initiate_payslip, able to pay a missed period (p_cutoff_start) and
--     13th-month pay (p_kind), through pay_target's checks. For 13th-month the
--     amount is Postgres's own (thirteenth_month_due), not the caller's, and
--     neither contributions nor vales come out of it. The net-pay rule itself
--     is the same single line.
--
--     Kept LAST in this file on purpose: src/features/pay/net-pay.test.ts
--     reads everything from this CREATE FUNCTION onward and asserts it never
--     touches the ledger.
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.initiate_payslip(UUID, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.initiate_payslip(UUID, NUMERIC, NUMERIC, TEXT, DATE, TEXT);

CREATE FUNCTION public.initiate_payslip(
    p_helper_id UUID,
    p_base_pay NUMERIC,
    p_statutory_employee_share NUMERIC,
    p_channel_code TEXT,
    p_cutoff_start DATE DEFAULT NULL,
    p_kind TEXT DEFAULT 'regular'
)
RETURNS TABLE (
    payslip_id UUID,
    vale_deductions NUMERIC,
    net_pay NUMERIC,
    attempt_id UUID,
    reference_id TEXT,
    attempt_number INT,
    cutoff_start DATE,
    cutoff_end DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target RECORD;
    v_cutoff_start DATE;
    v_cutoff_end DATE;
    v_vale_total NUMERIC := 0;
    v_net_pay NUMERIC;
    v_payslip_id UUID;
    v_attempt_id UUID;
    v_attempt_no INT;
    v_reference_id TEXT;
BEGIN
    IF p_channel_code NOT IN ('PH_GCASH', 'PH_PAYMAYA') THEN
        RAISE EXCEPTION 'Linara pays out by GCash or Maya only';
    END IF;

    -- Manager check, household check, which period, and the double-pay
    -- guards across both kinds of payment.
    SELECT * INTO v_target FROM public.pay_target(p_helper_id, p_cutoff_start, p_kind) t;
    v_cutoff_start := v_target.cutoff_start;
    v_cutoff_end := v_target.cutoff_end;
    v_payslip_id := v_target.reuse_payslip_id;

    IF p_kind = 'thirteenth_month' THEN
        p_base_pay := v_target.thirteenth_amount;
        p_statutory_employee_share := 0;
    ELSE
        SELECT COALESCE(SUM(amount), 0) INTO v_vale_total
        FROM public.vales
        WHERE helper_id = p_helper_id
          AND status = 'approved'
          AND settled_in_payslip_id IS NULL;
    END IF;

    v_net_pay := GREATEST(0, p_base_pay - p_statutory_employee_share - v_vale_total);

    IF v_payslip_id IS NULL THEN
        BEGIN
            INSERT INTO public.payslips (
                helper_id, kind, cutoff_start, cutoff_end, base_pay, statutory_employee_share,
                vale_deductions, net_pay, payout_channel_code, requested_by
            )
            VALUES (
                p_helper_id, p_kind, v_cutoff_start, v_cutoff_end, p_base_pay, p_statutory_employee_share,
                v_vale_total, v_net_pay, p_channel_code, auth.uid()
            )
            RETURNING id INTO v_payslip_id;
        EXCEPTION WHEN unique_violation THEN
            RAISE EXCEPTION 'A payslip already exists for this cutoff'
                USING ERRCODE = 'unique_violation';
        END;
    ELSE
        UPDATE public.payslips
        SET kind = p_kind,
            payout_provider = 'xendit',
            payout_status = 'pending_send',
            failure_reason = NULL,
            payout_external_id = NULL,
            base_pay = p_base_pay,
            statutory_employee_share = p_statutory_employee_share,
            vale_deductions = v_vale_total,
            net_pay = v_net_pay,
            payout_channel_code = p_channel_code,
            requested_by = auth.uid(),
            requested_at = timezone('utc', now()),
            confirmed_at = NULL,
            paid_on = NULL,
            manual_note = NULL,
            helper_ack = NULL,
            helper_ack_at = NULL,
            helper_ack_note = NULL
        WHERE id = v_payslip_id;
    END IF;

    SELECT COALESCE(MAX(a.attempt_number), 0) + 1 INTO v_attempt_no
    FROM public.payout_attempts a
    WHERE a.payslip_id = v_payslip_id;

    v_reference_id := gen_random_uuid()::text;

    INSERT INTO public.payout_attempts (
        payslip_id, attempt_number, reference_id, status,
        amount_sent, channel_code, requested_by
    )
    VALUES (
        v_payslip_id, v_attempt_no, v_reference_id, 'sending',
        v_net_pay, p_channel_code, auth.uid()
    )
    RETURNING id INTO v_attempt_id;

    IF p_kind = 'regular' THEN
        UPDATE public.vales
        SET settled_in_payslip_id = v_payslip_id
        WHERE helper_id = p_helper_id
          AND status = 'approved'
          AND settled_in_payslip_id IS NULL;
    END IF;

    RETURN QUERY SELECT v_payslip_id, v_vale_total, v_net_pay,
                        v_attempt_id, v_reference_id, v_attempt_no,
                        v_cutoff_start, v_cutoff_end;
END;
$$;

GRANT EXECUTE ON FUNCTION public.initiate_payslip(UUID, NUMERIC, NUMERIC, TEXT, DATE, TEXT)
    TO authenticated;
