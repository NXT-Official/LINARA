-- Session B of PAYMENTS_REMEDIATION.md: put every persisted/compared calendar
-- day on Postgres's clock, in an explicit household timezone. Apply by hand in
-- the Supabase SQL editor. Idempotent and safe to re-run.
--
-- Depends on add-manager-bootstrap.sql (households), add-payslips-table.sql,
-- add-payslip-double-pay-guards.sql and add-payout-attempts.sql.
--
-- --------------------------------------------------------------------------
-- WHY
-- --------------------------------------------------------------------------
-- src/features/pay/pay.utils.ts's currentCutoffRange built a Date from LOCAL
-- components and then formatted it with toISOString() (UTC). Verified by
-- running the real function under three TZs:
--
--   TZ                   Aug 10 04:00Z          Aug 16 04:00Z
--   UTC                  2026-08-01..08-15 ok   2026-08-16..08-31 ok
--   Asia/Manila          2026-07-31..08-14 BAD  2026-08-15..08-30 BAD
--   America/Los_Angeles  2026-08-01..08-15 ok   2026-08-01..08-15 BAD bucket
--
-- The bug is one-directional -- only positive UTC offsets shift, because local
-- midnight renders to the PREVIOUS day in UTC. Asia/Manila (UTC+8) is exactly
-- the broken case. Two consequences beyond the obvious off-by-one:
--   * Month-end is truncated: in Manila, 16->EOM on a 31-day August produced
--     2026-08-15..2026-08-30. The 31st fell into NO cutoff at all.
--   * Near a boundary the BUCKET flips, not just the formatting (the LA
--     column above picks the first-half cutoff on the 16th) -- so this could
--     never have been fixed by correcting the date formatting alone.
--
-- And because the same function ran on BOTH sides -- the server wrote
-- cutoff_start/cutoff_end, the browser looked the current cutoff up -- the two
-- disagreed. Session 0 confirmed the server ran UTC, so stored dates were
-- right by accident while the Manila browser searched for a cutoff a day off,
-- never matched, and therefore kept showing "Pay via GCash/Maya" immediately
-- after a successful payout. That is what invited the second click that
-- C36/C37 now prevent structurally.
--
-- Fix: derive the civil date in Postgres via (now() at time zone <tz>)::date,
-- on the same frame as server_now() (C32). Postgres now() is a timestamptz --
-- an instant; AT TIME ZONE renders it in a named civil zone; ::date takes the
-- calendar day IN THAT ZONE. Immune to both the browser's timezone and the
-- Node/Vercel process timezone. Month lengths and leap Februaries come free
-- from date arithmetic instead of being hand-rolled.

-- --------------------------------------------------------------------------
-- 1. Where the household lives. A real column rather than a hardcoded
--    'Asia/Manila' in the function: it costs nothing now, while there is one
--    household and no real payroll data, and avoids a migration against live
--    payroll later if LINARA ever ships outside PH.
-- --------------------------------------------------------------------------
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Manila';

COMMENT ON COLUMN public.households.timezone IS
  'IANA timezone name (e.g. Asia/Manila). The civil-date frame for this '
  'household: board rollover, cutoff boundaries, and anything else that '
  'persists or compares a calendar day. Never derive a stored day from a '
  'client Date -- see household_today()/household_cutoff().';

-- --------------------------------------------------------------------------
-- 2. Resolve a household's timezone defensively. An invalid IANA name would
--    make `AT TIME ZONE` raise, which on this path means payroll stops -- so
--    an unrecognized value degrades to Asia/Manila rather than throwing.
--    STABLE, not IMMUTABLE: pg_timezone_names is a catalog view.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.household_timezone(p_household_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tz TEXT;
BEGIN
    SELECT timezone INTO v_tz FROM public.households WHERE id = p_household_id;

    IF v_tz IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
        RETURN 'Asia/Manila';
    END IF;

    RETURN v_tz;
END;
$$;

-- --------------------------------------------------------------------------
-- 3. The household's civil date, server-authoritative. Companion to
--    server_now() (C32) -- and the piece that closes C32's remaining hole:
--    app-store-provider.tsx took the trustworthy server INSTANT and then
--    rendered it to a day with toISODate() in the BROWSER's timezone, so a
--    device with a wrong timezone (as opposed to a wrong clock) still derived
--    the wrong day from a correct answer. This returns the day directly, so
--    there is nothing left for the client to get wrong.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.household_today()
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (now() AT TIME ZONE public.household_timezone(public.current_household_id()))::date;
$$;

GRANT EXECUTE ON FUNCTION public.household_today() TO authenticated;
GRANT EXECUTE ON FUNCTION public.household_timezone(UUID) TO authenticated;

-- --------------------------------------------------------------------------
-- 4. Cutoff bounds for a given interval, derived from that civil date.
--    Philippine semi-monthly convention: 1st-15th and 16th-EOM; monthly is the
--    whole month. Single source of truth -- web, mobile and initiate_payslip
--    all read this instead of each computing it.
--
--    Split into a pure helper (takes the day, so it is IMMUTABLE and directly
--    unit-testable for month-end/leap cases) and a thin RPC that supplies
--    "today". Keeping the arithmetic in an IMMUTABLE function is what lets the
--    test suite below assert 28/29/30/31-day month ends without mocking a
--    clock.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cutoff_bounds_for(p_day DATE, p_payday_interval TEXT)
RETURNS TABLE (cutoff_start DATE, cutoff_end DATE)
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT
        CASE
            WHEN p_payday_interval = 'monthly' THEN date_trunc('month', p_day)::date
            WHEN EXTRACT(DAY FROM p_day) <= 15 THEN date_trunc('month', p_day)::date
            ELSE (date_trunc('month', p_day) + INTERVAL '15 days')::date
        END AS cutoff_start,
        CASE
            WHEN p_payday_interval = 'monthly'
                THEN (date_trunc('month', p_day) + INTERVAL '1 month - 1 day')::date
            WHEN EXTRACT(DAY FROM p_day) <= 15
                THEN (date_trunc('month', p_day) + INTERVAL '14 days')::date
            ELSE (date_trunc('month', p_day) + INTERVAL '1 month - 1 day')::date
        END AS cutoff_end;
$$;

CREATE OR REPLACE FUNCTION public.household_cutoff(p_payday_interval TEXT DEFAULT 'semi_monthly')
RETURNS TABLE (today DATE, cutoff_start DATE, cutoff_end DATE, timezone TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tz TEXT := public.household_timezone(public.current_household_id());
    v_today DATE;
BEGIN
    IF public.current_household_id() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_payday_interval NOT IN ('semi_monthly', 'monthly') THEN
        RAISE EXCEPTION 'Unknown payday_interval: %', p_payday_interval;
    END IF;

    v_today := (now() AT TIME ZONE v_tz)::date;

    RETURN QUERY
    SELECT v_today, b.cutoff_start, b.cutoff_end, v_tz
    FROM public.cutoff_bounds_for(v_today, p_payday_interval) b;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cutoff_bounds_for(DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.household_cutoff(TEXT) TO authenticated;

-- --------------------------------------------------------------------------
-- 5. initiate_payslip derives its own cutoff. Previously the caller passed
--    p_cutoff_start/p_cutoff_end, which meant the double-pay guard was only
--    ever as trustworthy as pay.actions.ts's (timezone-broken) arithmetic --
--    a caller that computed the wrong cutoff would have sailed straight past
--    payslips_one_per_cutoff by inserting under the wrong key. Now the
--    function reads the helper's own payday_interval and derives the bounds on
--    the server frame, so the guard is self-contained.
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.initiate_payslip(UUID, DATE, DATE, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.initiate_payslip(UUID, NUMERIC, NUMERIC, TEXT);

CREATE FUNCTION public.initiate_payslip(
    p_helper_id UUID,
    p_base_pay NUMERIC,
    p_statutory_employee_share NUMERIC,
    p_channel_code TEXT
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
    v_household_id UUID := public.current_household_id();
    v_user_type TEXT;
    v_interval TEXT;
    v_today DATE;
    v_cutoff_start DATE;
    v_cutoff_end DATE;
    v_vale_total NUMERIC;
    v_net_pay NUMERIC;
    v_payslip_id UUID;
    v_existing_id UUID;
    v_existing_status TEXT;
    v_attempt_id UUID;
    v_attempt_no INT;
    v_reference_id TEXT;
BEGIN
    IF v_household_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT user_type INTO v_user_type FROM public.user_profiles WHERE id = auth.uid();
    IF v_user_type NOT IN ('primary_manager', 'co_manager') THEN
        RAISE EXCEPTION 'Forbidden: only managers can initiate a payout';
    END IF;

    -- Read the interval from the helper rather than trusting the caller, and
    -- confirm household membership in the same query.
    SELECT payday_interval INTO v_interval
    FROM public.helper_profiles
    WHERE id = p_helper_id AND household_id = v_household_id;

    IF v_interval IS NULL THEN
        RAISE EXCEPTION 'Helper not found in this household';
    END IF;

    v_today := (now() AT TIME ZONE public.household_timezone(v_household_id))::date;

    SELECT b.cutoff_start, b.cutoff_end
      INTO v_cutoff_start, v_cutoff_end
    FROM public.cutoff_bounds_for(v_today, v_interval) b;

    SELECT id, payout_status
      INTO v_existing_id, v_existing_status
    FROM public.payslips
    WHERE helper_id = p_helper_id
      AND payslips.cutoff_start = v_cutoff_start
      AND payslips.cutoff_end = v_cutoff_end
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing_status <> 'failed' THEN
            RAISE EXCEPTION 'A payslip already exists for this cutoff'
                USING ERRCODE = 'unique_violation';
        END IF;
        v_payslip_id := v_existing_id;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_vale_total
    FROM public.vales
    WHERE helper_id = p_helper_id
      AND status = 'approved'
      AND settled_in_payslip_id IS NULL;

    v_net_pay := GREATEST(0, p_base_pay - p_statutory_employee_share - v_vale_total);

    IF v_payslip_id IS NULL THEN
        BEGIN
            INSERT INTO public.payslips (
                helper_id, cutoff_start, cutoff_end, base_pay, statutory_employee_share,
                vale_deductions, net_pay, payout_channel_code, requested_by
            )
            VALUES (
                p_helper_id, v_cutoff_start, v_cutoff_end, p_base_pay, p_statutory_employee_share,
                v_vale_total, v_net_pay, p_channel_code, auth.uid()
            )
            RETURNING id INTO v_payslip_id;
        EXCEPTION WHEN unique_violation THEN
            RAISE EXCEPTION 'A payslip already exists for this cutoff'
                USING ERRCODE = 'unique_violation';
        END;
    ELSE
        UPDATE public.payslips
        SET payout_status = 'pending_send',
            failure_reason = NULL,
            payout_external_id = NULL,
            base_pay = p_base_pay,
            statutory_employee_share = p_statutory_employee_share,
            vale_deductions = v_vale_total,
            net_pay = v_net_pay,
            payout_channel_code = p_channel_code,
            requested_by = auth.uid(),
            requested_at = timezone('utc', now()),
            confirmed_at = NULL
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

    UPDATE public.vales
    SET settled_in_payslip_id = v_payslip_id
    WHERE helper_id = p_helper_id
      AND status = 'approved'
      AND settled_in_payslip_id IS NULL;

    RETURN QUERY SELECT v_payslip_id, v_vale_total, v_net_pay,
                        v_attempt_id, v_reference_id, v_attempt_no,
                        v_cutoff_start, v_cutoff_end;
END;
$$;

GRANT EXECUTE ON FUNCTION public.initiate_payslip(UUID, NUMERIC, NUMERIC, TEXT)
    TO authenticated;
