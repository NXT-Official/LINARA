-- Wage history: a pay period is priced at the wage it had (KNOWN_GAPS.md O50).
--
-- Until now every unpaid period, and the payment for it, was worked out from
-- helper_profiles.monthly_rate as it is today. Editing a wage re-priced
-- every closed period nobody had paid yet: a raise in October raised
-- September, and a cut lowered pay already owed.
--
-- THE MODEL
--   * helper_wage_rates: each wage with the day it starts. A period's wage is
--     the one in effect on the period's first day (helper_rate_on); a period
--     that starts before her first recorded wage takes that first wage.
--   * A wage change starts at a cutoff: the one open now, or the next one
--     (set_helper_wage, the user's choice 2026-10-09). A closed period keeps
--     its wage, paid or not, and "this cutoff" is refused once it's paid.
--   * helper_profiles.monthly_rate stays "her wage", the newest one agreed,
--     which may only start next cutoff. Pay reads the history, never it:
--     helper_pay_periods returns each period's monthly_rate, and
--     unpaid_leave_due prices leave at its cutoff's wage. The web's payment
--     path (pay.actions.ts componentsForPayment) asks helper_rate_on.
--   * Any other write to monthly_rate (an older client, the SQL editor) is
--     kept in step by a trigger, as a change from the cutoff open now; an
--     invite not yet claimed just has its one wage replaced.
--
-- Apply by hand in the Supabase SQL editor, AFTER add-pay-periods.sql and
-- add-unpaid-leave-pay.sql (it replaces helper_pay_periods and
-- unpaid_leave_due). Safe to run twice. Tested in PGlite:
-- supabase/tests/wage-history.test.mjs.

-- --------------------------------------------------------------------------
-- 1. The table, filled with each helper's wage today.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.helper_wage_rates (
    helper_id UUID NOT NULL REFERENCES public.helper_profiles(id) ON DELETE CASCADE,
    effective_from DATE NOT NULL,
    monthly_rate NUMERIC(10,2) NOT NULL CHECK (monthly_rate >= 0),
    set_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (helper_id, effective_from)
);
ALTER TABLE public.helper_wage_rates ENABLE ROW LEVEL SECURITY;

-- Her own wages, and her household's managers: whoever may see her pay.
DROP POLICY IF EXISTS helper_wage_rates_read ON public.helper_wage_rates;
CREATE POLICY helper_wage_rates_read ON public.helper_wage_rates
    FOR SELECT USING (public.can_see_helper_pay(helper_id));
REVOKE INSERT, UPDATE, DELETE ON public.helper_wage_rates FROM anon, authenticated;
GRANT SELECT ON public.helper_wage_rates TO authenticated;

-- Her first day in Linara (or the real first day, if earlier).
CREATE OR REPLACE FUNCTION public.helper_wage_first_day(p_helper_id UUID)
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT LEAST(hp.started_on, (hp.created_at AT TIME ZONE public.household_timezone(hp.household_id))::date)
    FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id;
$$;
REVOKE ALL ON FUNCTION public.helper_wage_first_day(UUID) FROM PUBLIC, anon, authenticated;

-- What exists today is all anyone knows about earlier wages.
INSERT INTO public.helper_wage_rates (helper_id, effective_from, monthly_rate)
SELECT hp.id, public.helper_wage_first_day(hp.id), hp.monthly_rate
FROM public.helper_profiles hp
WHERE NOT EXISTS (SELECT 1 FROM public.helper_wage_rates w WHERE w.helper_id = hp.id);

-- --------------------------------------------------------------------------
-- 2. Her wage on a day.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.helper_rate_on(p_helper_id UUID, p_day DATE)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rate NUMERIC;
BEGIN
    IF NOT public.can_see_helper_pay(p_helper_id) THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT w.monthly_rate INTO v_rate
    FROM public.helper_wage_rates w
    WHERE w.helper_id = p_helper_id AND w.effective_from <= p_day
    ORDER BY w.effective_from DESC
    LIMIT 1;
    IF v_rate IS NOT NULL THEN
        RETURN v_rate;
    END IF;

    -- Before her first recorded wage (her first period starts on the
    -- cutoff's first day, before her own): that first wage.
    SELECT w.monthly_rate INTO v_rate
    FROM public.helper_wage_rates w
    WHERE w.helper_id = p_helper_id
    ORDER BY w.effective_from
    LIMIT 1;
    IF v_rate IS NOT NULL THEN
        RETURN v_rate;
    END IF;

    SELECT hp.monthly_rate INTO v_rate FROM public.helper_profiles hp WHERE hp.id = p_helper_id;
    RETURN v_rate;
END;
$$;
REVOKE ALL ON FUNCTION public.helper_rate_on(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.helper_rate_on(UUID, DATE) TO authenticated;

-- --------------------------------------------------------------------------
-- 3. Changing a wage: from the cutoff open now, or from the next one.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_helper_wage(
    p_helper_id UUID,
    p_monthly_rate NUMERIC,
    p_effective_from DATE DEFAULT NULL
)
RETURNS TABLE (monthly_rate NUMERIC, effective_from DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_hp public.helper_profiles%ROWTYPE;
    v_today DATE;
    v_cs DATE;
    v_ce DATE;
    v_from DATE;
BEGIN
    SELECT * INTO v_hp FROM public.helper_profiles h WHERE h.id = p_helper_id;
    IF v_hp.id IS NULL
       OR v_hp.household_id IS DISTINCT FROM public.current_household_id()
       OR NOT EXISTS (
            SELECT 1 FROM public.user_profiles up
            WHERE up.id = auth.uid() AND up.user_type IN ('primary_manager', 'co_manager')
       ) THEN
        RAISE EXCEPTION 'Only this household''s managers can change a wage';
    END IF;
    IF p_monthly_rate IS NULL OR p_monthly_rate <= 0 THEN
        RAISE EXCEPTION 'Enter the monthly wage';
    END IF;
    IF v_hp.status = 'INACTIVE' THEN
        RAISE EXCEPTION 'This employment has ended; the wage can''t change now';
    END IF;

    PERFORM set_config('linara.setting_wage', 'on', true);

    IF v_hp.status = 'PENDING_CLAIM' THEN
        -- No pay periods yet: the invite's one wage is replaced.
        v_from := public.helper_wage_first_day(p_helper_id);
        DELETE FROM public.helper_wage_rates w WHERE w.helper_id = p_helper_id;
    ELSE
        v_today := (now() AT TIME ZONE public.household_timezone(v_hp.household_id))::date;
        SELECT b.cutoff_start, b.cutoff_end INTO v_cs, v_ce
        FROM public.cutoff_bounds_for(v_today, v_hp.payday_interval) b;
        v_from := COALESCE(p_effective_from, v_cs);
        IF v_from NOT IN (v_cs, v_ce + 1) THEN
            RAISE EXCEPTION 'A new wage starts at this cutoff (%) or the next one (%)', v_cs, v_ce + 1;
        END IF;
        IF v_from = v_cs AND EXISTS (
            SELECT 1 FROM public.payslips p
            WHERE p.helper_id = p_helper_id
              AND p.kind = 'regular'
              AND p.payout_status <> 'failed'
              AND p.cutoff_start <= v_ce
              AND p.cutoff_end >= v_cs
        ) THEN
            RAISE EXCEPTION 'This cutoff is already paid. Start the new wage from the next one.';
        END IF;
        -- A change planned for later gives way to this one.
        DELETE FROM public.helper_wage_rates w
        WHERE w.helper_id = p_helper_id AND w.effective_from >= v_from;
    END IF;

    INSERT INTO public.helper_wage_rates (helper_id, effective_from, monthly_rate, set_by)
    VALUES (p_helper_id, v_from, p_monthly_rate, auth.uid());
    UPDATE public.helper_profiles SET monthly_rate = p_monthly_rate WHERE id = p_helper_id;

    PERFORM set_config('linara.setting_wage', 'off', true);
    RETURN QUERY SELECT p_monthly_rate, v_from;
END;
$$;
REVOKE ALL ON FUNCTION public.set_helper_wage(UUID, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_helper_wage(UUID, NUMERIC, DATE) TO authenticated;

-- Every other write to the wage, kept in step: a new helper's first wage,
-- and a change made around set_helper_wage, from the cutoff open now.
CREATE OR REPLACE FUNCTION public.helper_wage_history_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_from DATE;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.helper_wage_rates (helper_id, effective_from, monthly_rate, set_by)
        VALUES (NEW.id, public.helper_wage_first_day(NEW.id), NEW.monthly_rate, auth.uid())
        ON CONFLICT (helper_id, effective_from) DO NOTHING;
        RETURN NULL;
    END IF;

    IF NEW.monthly_rate IS NOT DISTINCT FROM OLD.monthly_rate
       OR current_setting('linara.setting_wage', true) = 'on' THEN
        RETURN NULL;
    END IF;

    IF NEW.status = 'PENDING_CLAIM' THEN
        DELETE FROM public.helper_wage_rates WHERE helper_id = NEW.id;
        v_from := public.helper_wage_first_day(NEW.id);
    ELSE
        SELECT b.cutoff_start INTO v_from
        FROM public.cutoff_bounds_for(
            (now() AT TIME ZONE public.household_timezone(NEW.household_id))::date,
            NEW.payday_interval
        ) b;
        DELETE FROM public.helper_wage_rates WHERE helper_id = NEW.id AND effective_from >= v_from;
    END IF;
    INSERT INTO public.helper_wage_rates (helper_id, effective_from, monthly_rate, set_by)
    VALUES (NEW.id, v_from, NEW.monthly_rate, auth.uid());
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS helper_wage_history_sync ON public.helper_profiles;
CREATE TRIGGER helper_wage_history_sync
    AFTER INSERT OR UPDATE OF monthly_rate ON public.helper_profiles
    FOR EACH ROW EXECUTE FUNCTION public.helper_wage_history_sync();

-- --------------------------------------------------------------------------
-- 4. helper_pay_periods, now with each period's wage. As add-pay-periods.sql
--    otherwise; a new column means drop and create.
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.helper_pay_periods(UUID);

CREATE FUNCTION public.helper_pay_periods(p_helper_id UUID)
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
    payslip_net NUMERIC,
    monthly_rate NUMERIC
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
        monthly_rate := public.helper_rate_on(p_helper_id, v_fs);

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
REVOKE ALL ON FUNCTION public.helper_pay_periods(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.helper_pay_periods(UUID) TO authenticated;

-- --------------------------------------------------------------------------
-- 5. unpaid_leave_due, at the wage of the cutoff it comes off. As
--    add-unpaid-leave-pay.sql otherwise.
-- --------------------------------------------------------------------------
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

    -- Wages change only at a cutoff's first day, so its last day has its wage.
    v_rate := public.helper_rate_on(p_helper_id, p_cutoff_end);
    SELECT hp.pay_days_per_year INTO v_per_year
    FROM public.helper_profiles hp
    WHERE hp.id = p_helper_id;

    leave_days := v_days;
    deduction := ROUND(v_days * v_rate * 12 / v_per_year, 2);
    RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.unpaid_leave_due(UUID, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unpaid_leave_due(UUID, DATE, BOOLEAN) TO authenticated;
