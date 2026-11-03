-- Where a helper is paid is not part of staff pay & HR. The staff_pay_hr
-- switch is about Linara's own staff; for a household, "pay" is only the
-- helper's GCash or Maya account, shown to the family so they can send pay
-- themselves (add-direct-gcash-pay.sql). So a helper can save and change
-- that account whatever the switch says. Payslips, vales and wage changes
-- stay behind the switch.
--
-- Apply by hand in the Supabase SQL editor, after add-pay-hr-switch.sql.
-- Re-running add-pay-hr-switch.sql puts the trigger back: run this again
-- after it. Safe to run twice. Tested in PGlite:
-- supabase/tests/separate-gcash-from-pay-hr.test.mjs.

DROP TRIGGER IF EXISTS pay_hr_switch ON public.helper_payout_accounts;
