-- Staff pay & HR is the Linara team's own payroll, not a household feature
-- (owner, 2026-10-30 and 2026-11-03; console spec D50).
--
-- Until now one switch, app_switches 'staff_pay_hr', meant two things: a plan
-- feature households could get (billing_feature_keys, Premium had it), and the
-- gate that holds back the household payslip features (add-pay-hr-switch.sql,
-- O72). This splits them:
--
--   1. The household payslip gate gets its own switch, 'household_pay_hr',
--      starting as 'staff_pay_hr' is now (off). pay_hr_enabled() and every
--      trigger built on it read that one, so they behave exactly as before.
--   2. 'staff_pay_hr' stays, for the Linara team's payroll only. Nothing in
--      either app reads it any more; the Business Console shows it and keeps
--      it off until team payroll exists.
--   3. It stops being a plan feature: out of billing_feature_keys(), out of
--      every stored plan version and draft (so billing_valid_version's CHECK
--      still holds on a dump and restore), out of billing_household_has(), and
--      out of the public catalog's switches.
--
-- Stored versions are otherwise immutable (R3). Removing this key changes no
-- household's access: billing_household_has() always answered false for it
-- while the switch was off, which it has been since it was added.
--
-- Deploy together with the Business Console change that stops sending the key
-- (LINARA_ADMIN, D50): run this first. A console still sending it would have its
-- plan saves refused by the CHECK until it's deployed.
--
-- Apply by hand in the Supabase SQL editor, after add-billing-pause.sql.
-- Safe to run twice. Tested in PGlite: supabase/tests/staff-pay-hr-linara-team.test.mjs.

BEGIN;

-- 1. The household payslip gate, on its own switch. -------------------------
INSERT INTO public.app_switches (key, enabled, note)
SELECT 'household_pay_hr',
       COALESCE((SELECT enabled FROM public.app_switches WHERE key = 'staff_pay_hr'), false),
       'Household payslips, vale, where a helper is paid and wage changes. Off while pay and HR are brought in line with the law (O72).'
ON CONFLICT (key) DO NOTHING;

-- A missing row still counts as off.
CREATE OR REPLACE FUNCTION public.pay_hr_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT enabled FROM public.app_switches WHERE key = 'household_pay_hr'), false);
$$;
GRANT EXECUTE ON FUNCTION public.pay_hr_enabled() TO authenticated;

-- 2. 'staff_pay_hr' is the Linara team's. ------------------------------------
UPDATE public.app_switches
   SET note = 'Payroll and HR for the Linara team. Off until team payroll exists.'
 WHERE key = 'staff_pay_hr';

-- 3. Not a plan feature. -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_feature_keys()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
    SELECT ARRAY['tasks', 'quick_utos', 'schedule', 'pantry', 'time_off', 'after_hours',
                 'teams_labels', 'remote_admin', 'work_record']
$$;

-- The stored versions and drafts, so they match the new key list.
ALTER TABLE public.billing_plan_versions DISABLE TRIGGER billing_versions_immutable;
UPDATE public.billing_plan_versions
   SET features = features - 'staff_pay_hr'
 WHERE features ? 'staff_pay_hr';
ALTER TABLE public.billing_plan_versions ENABLE TRIGGER billing_versions_immutable;

UPDATE public.billing_plans
   SET draft = jsonb_set(draft, '{features}', (draft -> 'features') - 'staff_pay_hr')
 WHERE draft IS NOT NULL AND (draft -> 'features') ? 'staff_pay_hr';

-- As add-billing-pause.sql, without the staff_pay_hr case.
CREATE OR REPLACE FUNCTION public.billing_household_has(p_household UUID, p_key TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner UUID := public.billing_household_owner(p_household);
    v_features JSONB;
BEGIN
    IF p_key = ANY (public.billing_every_plan_keys()) THEN
        RETURN true;
    END IF;
    SELECT pv.features INTO v_features FROM public.billing_plan_versions pv
     WHERE pv.id = public.billing_effective_version(public.billing_subscription_json(v_owner));
    RETURN COALESCE((v_features ->> p_key)::boolean, false);
END;
$$;

-- As add-billing.sql, with no household-facing switch left to publish.
CREATE OR REPLACE FUNCTION public.billing_catalog()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'plans', COALESCE((
            SELECT jsonb_agg(public.billing_version_json(public.billing_current_version(p.id))
                             ORDER BY p.display_order, p.id)
              FROM public.billing_plans p
             WHERE p.status = 'published' AND public.billing_current_version(p.id) IS NOT NULL),
            '[]'::jsonb),
        'addons', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'limitKey', a.limit_key,
                                                'step', a.step, 'monthlyPrice', a.monthly_price)
                             ORDER BY a.id)
              FROM public.billing_addons a WHERE a.active), '[]'::jsonb),
        'switches', '{}'::jsonb)
$$;
REVOKE ALL ON FUNCTION public.billing_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_catalog() TO anon, authenticated;

COMMIT;
