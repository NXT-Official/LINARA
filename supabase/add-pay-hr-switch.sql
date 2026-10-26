-- Staff pay & HR switch: pay and HR are temporarily disabled while they're
-- brought in line with the law. The web hides them and its server functions
-- refuse (src/lib/pay-hr.ts), the helper app hides them
-- (../LINARA_MOBILE/lib/pay-hr.ts); this refuses the same writes in the
-- database, for the helper app's direct writes, for app builds already
-- installed, and for anyone calling the API with their own token.
--
-- REFUSED while off
--   * a new payslip (any path: record_offapp_payslip, a Xendit payout,
--     13th-month pay)
--   * a new vale, or a vale approved
--   * saving or changing where a helper is paid (helper_payout_accounts)
--   * a wage change (helper_profiles.monthly_rate; set_helper_wage)
-- STILL ALLOWED
--   * reading everything: records are kept and stay visible to their owners
--   * a pending vale declined (ending an employment declines them)
--   * payslip updates (a Xendit webhook settling a payout already sent,
--     her "did you receive it?" answer), deletions, account deletion
--   * an invite's first wage (an INSERT, not a change)
--
-- Turn it back on with
--   UPDATE public.app_switches SET enabled = true WHERE key = 'staff_pay_hr';
-- together with PAY_HR_ENABLED in both apps.
--
-- Apply by hand in the Supabase SQL editor, after add-direct-gcash-pay.sql
-- and add-wage-history.sql. Safe to run twice. Tested in PGlite:
-- supabase/tests/pay-hr-switch.test.mjs.

CREATE TABLE IF NOT EXISTS public.app_switches (
    key TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL,
    note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_switches ENABLE ROW LEVEL SECURITY;
-- Readable so the apps can follow it later; written only from the SQL editor.
DROP POLICY IF EXISTS app_switches_read ON public.app_switches;
CREATE POLICY app_switches_read ON public.app_switches FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.app_switches TO authenticated;

INSERT INTO public.app_switches (key, enabled, note)
VALUES ('staff_pay_hr', false, 'Temporarily disabled while pay and HR are brought in line with the law.')
ON CONFLICT (key) DO NOTHING;

-- A missing row counts as off: deleting it can't quietly turn pay back on.
CREATE OR REPLACE FUNCTION public.pay_hr_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT enabled FROM public.app_switches WHERE key = 'staff_pay_hr'), false);
$$;
GRANT EXECUTE ON FUNCTION public.pay_hr_enabled() TO authenticated;

CREATE OR REPLACE FUNCTION public.refuse_while_pay_hr_off()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.pay_hr_enabled() THEN
        RETURN NEW;
    END IF;
    -- Nested, not ANDed: PL/pgSQL doesn't promise to stop at the table-name
    -- test, and NEW.status / NEW.monthly_rate don't exist on the other tables.
    IF TG_TABLE_NAME = 'vales' AND TG_OP = 'UPDATE' THEN
        IF NOT (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved') THEN
            RETURN NEW;
        END IF;
    ELSIF TG_TABLE_NAME = 'helper_profiles' THEN
        IF NEW.monthly_rate IS NOT DISTINCT FROM OLD.monthly_rate THEN
            RETURN NEW;
        END IF;
    END IF;
    RAISE EXCEPTION 'Pay and HR features are temporarily disabled while we make sure they follow the law.'
        USING ERRCODE = 'P0001', HINT = 'pay_hr_disabled';
END;
$$;

DROP TRIGGER IF EXISTS pay_hr_switch ON public.payslips;
CREATE TRIGGER pay_hr_switch
    BEFORE INSERT ON public.payslips
    FOR EACH ROW EXECUTE FUNCTION public.refuse_while_pay_hr_off();

DROP TRIGGER IF EXISTS pay_hr_switch ON public.vales;
CREATE TRIGGER pay_hr_switch
    BEFORE INSERT OR UPDATE OF status ON public.vales
    FOR EACH ROW EXECUTE FUNCTION public.refuse_while_pay_hr_off();

DROP TRIGGER IF EXISTS pay_hr_switch ON public.helper_payout_accounts;
CREATE TRIGGER pay_hr_switch
    BEFORE INSERT OR UPDATE ON public.helper_payout_accounts
    FOR EACH ROW EXECUTE FUNCTION public.refuse_while_pay_hr_off();

DROP TRIGGER IF EXISTS pay_hr_switch ON public.helper_profiles;
CREATE TRIGGER pay_hr_switch
    BEFORE UPDATE OF monthly_rate ON public.helper_profiles
    FOR EACH ROW EXECUTE FUNCTION public.refuse_while_pay_hr_off();
