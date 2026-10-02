-- Unpaid leave on pay: step 5 of LEAVE_PLAN.md (KNOWN_GAPS O21). Apply by
-- hand in the Supabase SQL editor, AFTER add-leave.sql (and so after
-- add-pay-periods.sql and add-payout-attempts.sql, whose functions it
-- replaces). Idempotent and safe to re-run. Tested in PGlite:
-- supabase/tests/unpaid-leave-pay.test.mjs.
--
-- --------------------------------------------------------------------------
-- THE RULE
-- --------------------------------------------------------------------------
--     net = max(0, base - statutory employee share - unsettled approved vales
--                  - unpaid leave)
--     unpaid leave = days x monthly_rate x 12 / pay_days_per_year,
--                    rounded to centavos
--
-- Still no term from ledger_entries: after-hours work stays time (C39).
--
-- WHICH LEAVE. Approved, kind 'unpaid', not yet on a payslip, and whose LAST
-- day is on or before the cutoff's last day. A leave comes off whole from the
-- cutoff it ends in, so one spanning two cutoffs comes off the later one.
-- The exception is her final cutoff (she has left and it ends on her last
-- day): it also takes leave that started by then, counting only its working
-- days up to her last day, since there is no later cutoff to take it from.
-- Days are the working days snapshotted when it was approved
-- (leave_requests.days); her weekly rest day costs nothing.
--
-- Settled like vales: leave_requests.settled_in_payslip_id points at the
-- payslip that deducted it, so it comes off once. A payout that fails or is
-- cancelled releases it (record_payout_attempt_result, below); withdrawing an
-- off-app record deletes the payslip and the foreign key's ON DELETE SET NULL
-- releases it. cancel_leave_request already refuses settled leave.
--
-- Contributions are unchanged (they're on the monthly rate). 13th-month pay
-- counts basic pay actually earned, so it subtracts the deduction.
--
-- Both payout functions now lock her helper_profiles row before reading
-- leave, the same lock every leave function takes first: a leave approved
-- while a payout is being written can't be settled without being deducted.
--
-- The web (src/features/pay/net-pay.ts) and the helper app
-- (LINARA_MOBILE/lib/net-pay.ts) mirror this rule for their estimates;
-- net-pay.test.ts reads the initiate_payslip below to keep them in step.

-- --------------------------------------------------------------------------
-- 1. What each payslip deducted, snapshotted like vale_deductions.
-- --------------------------------------------------------------------------
ALTER TABLE public.payslips
    ADD COLUMN IF NOT EXISTS unpaid_leave_days INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unpaid_leave_deduction NUMERIC(10,2) NOT NULL DEFAULT 0;

-- --------------------------------------------------------------------------
-- 2. The leave a payslip for the cutoff ending p_cutoff_end takes, with the
--    days each contributes. Internal: the payout functions settle exactly
--    these rows.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unpaid_leave_for_cutoff(
    p_helper_id UUID,
    p_cutoff_end DATE,
    p_final BOOLEAN
)
RETURNS TABLE (leave_id UUID, leave_days INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT l.id,
           CASE
               WHEN l.end_date <= p_cutoff_end THEN l.days
               ELSE (
                   SELECT COUNT(*)::int
                   FROM generate_series(l.start_date, p_cutoff_end, interval '1 day') AS d
                   WHERE EXTRACT(DOW FROM d)::int <> hp.weekly_rest_day
               )
           END
    FROM public.leave_requests l
    JOIN public.helper_profiles hp ON hp.id = l.helper_id
    WHERE l.helper_id = p_helper_id
      AND l.kind = 'unpaid'
      AND l.status = 'approved'
      AND l.settled_in_payslip_id IS NULL
      AND (l.end_date <= p_cutoff_end OR (p_final AND l.start_date <= p_cutoff_end));
$$;
REVOKE ALL ON FUNCTION public.unpaid_leave_for_cutoff(UUID, DATE, BOOLEAN)
    FROM PUBLIC, anon, authenticated;

-- Days and pesos, for the payout functions and anyone who may see her pay.
CREATE OR REPLACE FUNCTION public.unpaid_leave_due(
    p_helper_id UUID,
    p_cutoff_end DATE,
    p_final BOOLEAN DEFAULT false
)
RETURNS TABLE (leave_days INT, deduction NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days INT;
    v_rate NUMERIC;
    v_per_year INT;
BEGIN
    IF NOT public.can_see_helper_pay(p_helper_id) THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT COALESCE(SUM(u.leave_days), 0)::int INTO v_days
    FROM public.unpaid_leave_for_cutoff(p_helper_id, p_cutoff_end, p_final) u;

    SELECT hp.monthly_rate, hp.pay_days_per_year INTO v_rate, v_per_year
    FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id;

    leave_days := v_days;
    deduction := ROUND(v_days * v_rate * 12 / v_per_year, 2);
    RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.unpaid_leave_due(UUID, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unpaid_leave_due(UUID, DATE, BOOLEAN) TO authenticated;

-- --------------------------------------------------------------------------
-- 3. A failed or cancelled payout releases its leave as well as its vales.
--    Otherwise as add-payout-attempts.sql.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_payout_attempt_result(
    p_attempt_id UUID,
    p_status TEXT,
    p_psp_payout_id TEXT DEFAULT NULL,
    p_failure_reason TEXT DEFAULT NULL
)
RETURNS TABLE (payslip_id UUID, payslip_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payslip_id UUID;
    v_new_payslip_status TEXT;
BEGIN
    IF p_status NOT IN ('accepted', 'succeeded', 'failed', 'cancelled', 'ambiguous') THEN
        RAISE EXCEPTION 'Invalid attempt status: %', p_status;
    END IF;

    UPDATE public.payout_attempts
    SET status = p_status,
        psp_payout_id = COALESCE(p_psp_payout_id, psp_payout_id),
        failure_reason = p_failure_reason,
        resolved_at = CASE
            WHEN p_status IN ('succeeded', 'failed', 'cancelled') THEN timezone('utc', now())
            ELSE resolved_at
        END
    WHERE id = p_attempt_id
    RETURNING payout_attempts.payslip_id INTO v_payslip_id;

    IF v_payslip_id IS NULL THEN
        RAISE EXCEPTION 'Payout attempt not found';
    END IF;

    v_new_payslip_status := CASE p_status
        WHEN 'accepted'  THEN 'processing'
        WHEN 'succeeded' THEN 'succeeded'
        WHEN 'failed'    THEN 'failed'
        WHEN 'cancelled' THEN 'failed'
        WHEN 'ambiguous' THEN 'needs_review'
    END;

    UPDATE public.payslips
    SET payout_status = v_new_payslip_status,
        failure_reason = p_failure_reason,
        payout_external_id = COALESCE(p_psp_payout_id, payout_external_id),
        confirmed_at = CASE
            WHEN p_status IN ('succeeded', 'failed', 'cancelled') THEN timezone('utc', now())
            ELSE confirmed_at
        END
    WHERE id = v_payslip_id;

    -- Only a definitively-not-paid outcome releases what the payslip took.
    -- 'ambiguous' must NOT: it may already have been paid out.
    IF p_status IN ('failed', 'cancelled') THEN
        UPDATE public.vales
        SET settled_in_payslip_id = NULL
        WHERE settled_in_payslip_id = v_payslip_id;
        UPDATE public.leave_requests
        SET settled_in_payslip_id = NULL
        WHERE settled_in_payslip_id = v_payslip_id;
    END IF;

    RETURN QUERY SELECT v_payslip_id, v_new_payslip_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_payout_attempt_result(UUID, TEXT, TEXT, TEXT)
    TO authenticated;

-- --------------------------------------------------------------------------
-- 4. 13th-month pay counts basic pay actually earned: less unpaid leave.
--    Otherwise as add-pay-periods.sql.
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
    -- went out, less any she disputed, less the unpaid leave they deducted.
    SELECT COALESCE(SUM(p.base_pay - p.unpaid_leave_deduction), 0) INTO basic_earned
    FROM public.payslips p
    WHERE p.helper_id = p_helper_id
      AND p.kind = 'regular'
      AND p.payout_status = 'succeeded'
      AND COALESCE(p.helper_ack, 'confirmed') <> 'disputed'
      AND EXTRACT(YEAR FROM p.cutoff_end) = v_year;

    amount := ROUND(GREATEST(0, basic_earned) / 12, 2);

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
-- 5. Ending an employment previews the unpaid leave her final pay will take,
--    and the year's basic pay net of it. Otherwise as add-pay-periods.sql.
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
    v_leave RECORD;
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

    -- What her final pay will deduct if she leaves on p_last_day.
    SELECT * INTO v_leave FROM public.unpaid_leave_due(p_helper_id, p_last_day, true);

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
        'unpaid_leave_days', v_leave.leave_days,
        'unpaid_leave_deduction', v_leave.deduction,
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
            SELECT COALESCE(SUM(p.base_pay - p.unpaid_leave_deduction), 0) FROM public.payslips p
            WHERE p.helper_id = p_helper_id AND p.kind = 'regular'
              AND p.payout_status = 'succeeded'
              AND COALESCE(p.helper_ack, 'confirmed') <> 'disputed'
              AND EXTRACT(YEAR FROM p.cutoff_end) = EXTRACT(YEAR FROM p_last_day)
        )
    );
END;
$$;

-- --------------------------------------------------------------------------
-- 6. A payment made outside Linara takes the same unpaid leave as a Xendit
--    payout. Same signature and result as add-pay-periods.sql.
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
    v_final BOOLEAN;
    v_leave_days INT := 0;
    v_leave_total NUMERIC := 0;
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

    -- After pay_target's manager and household checks: the lock every leave
    -- function takes first, so no leave is approved between reading and settling.
    SELECT (hp.status = 'INACTIVE' AND hp.ended_on = v_target.cutoff_end) INTO v_final
    FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id
    FOR UPDATE;

    IF p_kind = 'thirteenth_month' THEN
        v_base := v_target.thirteenth_amount;
        v_statutory := 0;
    ELSE
        SELECT COALESCE(SUM(v.amount), 0) INTO v_vales
        FROM public.vales v
        WHERE v.helper_id = p_helper_id
          AND v.status = 'approved'
          AND v.settled_in_payslip_id IS NULL;
        SELECT d.leave_days, d.deduction INTO v_leave_days, v_leave_total
        FROM public.unpaid_leave_due(p_helper_id, v_target.cutoff_end, COALESCE(v_final, false)) d;
    END IF;

    v_net := GREATEST(0, v_base - v_statutory - v_vales - v_leave_total);

    IF v_target.reuse_payslip_id IS NULL THEN
        INSERT INTO public.payslips (
            helper_id, kind, cutoff_start, cutoff_end, base_pay, statutory_employee_share,
            vale_deductions, unpaid_leave_days, unpaid_leave_deduction, net_pay,
            payout_provider, payout_channel_code,
            payout_status, requested_by, confirmed_at,
            paid_on, manual_note, helper_ack
        )
        VALUES (
            p_helper_id, p_kind, v_target.cutoff_start, v_target.cutoff_end, v_base, v_statutory,
            v_vales, v_leave_days, v_leave_total, v_net,
            'manual', p_method,
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
            unpaid_leave_days = v_leave_days,
            unpaid_leave_deduction = v_leave_total,
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
        UPDATE public.leave_requests l
        SET settled_in_payslip_id = v_id
        WHERE l.id IN (
            SELECT u.leave_id
            FROM public.unpaid_leave_for_cutoff(p_helper_id, v_target.cutoff_end, COALESCE(v_final, false)) u
        );
    END IF;

    RETURN QUERY SELECT v_id, v_net, v_target.cutoff_start, v_target.cutoff_end;
END;
$$;

REVOKE ALL ON FUNCTION public.record_offapp_payslip(UUID, NUMERIC, NUMERIC, TEXT, DATE, TEXT, DATE, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_offapp_payslip(UUID, NUMERIC, NUMERIC, TEXT, DATE, TEXT, DATE, TEXT) TO authenticated;

-- --------------------------------------------------------------------------
-- 7. initiate_payslip, taking unpaid leave. Its result gains
--    unpaid_leave_deduction, so it is dropped and recreated (same arguments).
--
--    Kept LAST in this file on purpose: src/features/pay/net-pay.test.ts
--    reads everything from this CREATE FUNCTION onward and asserts it never
--    touches the ledger.
-- --------------------------------------------------------------------------
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
    unpaid_leave_deduction NUMERIC,
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
    v_final BOOLEAN;
    v_vale_total NUMERIC := 0;
    v_leave_days INT := 0;
    v_leave_total NUMERIC := 0;
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

    -- The lock every leave function takes first (see the header).
    SELECT (hp.status = 'INACTIVE' AND hp.ended_on = v_cutoff_end) INTO v_final
    FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id
    FOR UPDATE;

    IF p_kind = 'thirteenth_month' THEN
        p_base_pay := v_target.thirteenth_amount;
        p_statutory_employee_share := 0;
    ELSE
        SELECT COALESCE(SUM(v.amount), 0) INTO v_vale_total
        FROM public.vales v
        WHERE v.helper_id = p_helper_id
          AND v.status = 'approved'
          AND v.settled_in_payslip_id IS NULL;
        SELECT d.leave_days, d.deduction INTO v_leave_days, v_leave_total
        FROM public.unpaid_leave_due(p_helper_id, v_cutoff_end, COALESCE(v_final, false)) d;
    END IF;

    v_net_pay := GREATEST(0, p_base_pay - p_statutory_employee_share - v_vale_total - v_leave_total);

    IF v_payslip_id IS NULL THEN
        BEGIN
            INSERT INTO public.payslips (
                helper_id, kind, cutoff_start, cutoff_end, base_pay, statutory_employee_share,
                vale_deductions, unpaid_leave_days, unpaid_leave_deduction, net_pay,
                payout_channel_code, requested_by
            )
            VALUES (
                p_helper_id, p_kind, v_cutoff_start, v_cutoff_end, p_base_pay, p_statutory_employee_share,
                v_vale_total, v_leave_days, v_leave_total, v_net_pay,
                p_channel_code, auth.uid()
            )
            RETURNING id INTO v_payslip_id;
        EXCEPTION WHEN unique_violation THEN
            RAISE EXCEPTION 'A payslip already exists for this cutoff'
                USING ERRCODE = 'unique_violation';
        END;
    ELSE
        UPDATE public.payslips p
        SET kind = p_kind,
            payout_provider = 'xendit',
            payout_status = 'pending_send',
            failure_reason = NULL,
            payout_external_id = NULL,
            base_pay = p_base_pay,
            statutory_employee_share = p_statutory_employee_share,
            vale_deductions = v_vale_total,
            unpaid_leave_days = v_leave_days,
            unpaid_leave_deduction = v_leave_total,
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
        WHERE p.id = v_payslip_id;
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
        UPDATE public.vales v
        SET settled_in_payslip_id = v_payslip_id
        WHERE v.helper_id = p_helper_id
          AND v.status = 'approved'
          AND v.settled_in_payslip_id IS NULL;
        UPDATE public.leave_requests l
        SET settled_in_payslip_id = v_payslip_id
        WHERE l.id IN (
            SELECT u.leave_id
            FROM public.unpaid_leave_for_cutoff(p_helper_id, v_cutoff_end, COALESCE(v_final, false)) u
        );
    END IF;

    RETURN QUERY SELECT v_payslip_id, v_vale_total, v_leave_total, v_net_pay,
                        v_attempt_id, v_reference_id, v_attempt_no,
                        v_cutoff_start, v_cutoff_end;
END;
$$;

REVOKE ALL ON FUNCTION public.initiate_payslip(UUID, NUMERIC, NUMERIC, TEXT, DATE, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.initiate_payslip(UUID, NUMERIC, NUMERIC, TEXT, DATE, TEXT)
    TO authenticated;
