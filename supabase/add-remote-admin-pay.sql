-- A remote admin can pay the helper (KNOWN_GAPS O34; client, 2026-10-03:
-- the OFW parent is usually the one funding the household). Apply by hand in
-- the Supabase SQL editor, AFTER add-pay-periods.sql, add-unpaid-leave-pay.sql
-- and add-household-managers.sql. Idempotent and safe to re-run. Tested in
-- PGlite: supabase/tests/remote-admin-pay.test.mjs.
--
-- Every way of paying goes through two functions' role checks:
--   * pay_target(): the GCash / Maya payout (initiate_payslip) and "Paid
--     outside Linara" (record_offapp_payslip) both ask it first.
--   * withdraw_offapp_payslip(): taking back a "Paid outside Linara" record.
-- (record_payout_attempt_result checks the household, not the role.)
--
-- Both were last redefined in long migrations, so instead of copying their
-- bodies here (and risking an old copy), this reads each function's live
-- definition, adds remote_admin to its one role list, and recreates it. It
-- stops, changing nothing, if that list isn't there as expected.

DO $$
DECLARE
    v_fn REGPROCEDURE;
    v_def TEXT;
    v_old CONSTANT TEXT := 'NOT IN (''primary_manager'', ''co_manager'')';
    v_new CONSTANT TEXT := 'NOT IN (''primary_manager'', ''co_manager'', ''remote_admin'')';
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'public.pay_target(uuid, date, text)'::regprocedure,
        'public.withdraw_offapp_payslip(uuid)'::regprocedure
    ] LOOP
        v_def := pg_get_functiondef(v_fn);
        IF position(v_new IN v_def) > 0 THEN
            CONTINUE; -- already applied
        END IF;
        IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
            RAISE EXCEPTION '% doesn''t have exactly one manager role check to widen; nothing changed', v_fn;
        END IF;
        EXECUTE replace(v_def, v_old, v_new);
    END LOOP;
END;
$$;
