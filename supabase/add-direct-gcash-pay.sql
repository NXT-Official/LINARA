-- Paying her straight to her GCash or Maya, with Linara keeping the record
-- and moving no money (client, 2026-10-03; KNOWN_GAPS O35). Apply by hand in
-- the Supabase SQL editor, AFTER add-pay-periods.sql, add-unpaid-leave-pay.sql
-- and add-household-managers.sql. Idempotent and safe to re-run. Tested in
-- PGlite: supabase/tests/direct-gcash-pay.test.mjs.
--
-- The flow: she saves where she wants to be paid, in her app. On payday the
-- manager's Pay screen shows the amount and her number (and her GCash QR),
-- the manager sends it from their own GCash / Maya, and taps "I've sent it",
-- which records a payslip through record_offapp_payslip (method PH_GCASH or
-- PH_PAYMAYA, the GCash reference in the note). Her app asks whether it
-- arrived, as for any payment made outside Linara.
--
--   * helper_payout_accounts: hers. Only she writes it; managers of a
--     household she works (or worked) in read it, to pay her and to pay a
--     final or missed period after she's left.
--   * Her QR image: storage path payout/<her user id>/..., written only by
--     her (the household folders' policy lets anyone in the household
--     overwrite a file, which won't do for where her pay goes), read by the
--     same managers.
--   * record_offapp_payslip accepts PH_GCASH and PH_PAYMAYA as methods.

-- --------------------------------------------------------------------------
-- 1. Where she wants to be paid.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.helper_payout_accounts (
    user_id UUID PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('PH_GCASH', 'PH_PAYMAYA')),
    account_name TEXT NOT NULL CHECK (btrim(account_name) <> ''),
    -- A Philippine mobile number, as GCash and Maya use: 09 and nine digits.
    account_number TEXT NOT NULL CHECK (account_number ~ '^09[0-9]{9}$'),
    qr_path TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.helper_payout_accounts ENABLE ROW LEVEL SECURITY;

-- Can the signed-in manager pay this person? A manager role, in a household
-- where she has an employment (current or ended).
CREATE OR REPLACE FUNCTION public.can_pay_person(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_household_admin() AND EXISTS (
        SELECT 1 FROM public.helper_profiles hp
         WHERE hp.user_id = p_user_id AND hp.household_id = public.current_household_id());
$$;
REVOKE ALL ON FUNCTION public.can_pay_person(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_pay_person(UUID) TO authenticated;

DROP POLICY IF EXISTS helper_payout_accounts_own ON public.helper_payout_accounts;
CREATE POLICY helper_payout_accounts_own ON public.helper_payout_accounts
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS helper_payout_accounts_managers_read ON public.helper_payout_accounts;
CREATE POLICY helper_payout_accounts_managers_read ON public.helper_payout_accounts
    FOR SELECT USING (public.can_pay_person(user_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.helper_payout_accounts TO authenticated;

CREATE OR REPLACE FUNCTION public.helper_payout_accounts_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS helper_payout_accounts_touch ON public.helper_payout_accounts;
CREATE TRIGGER helper_payout_accounts_touch
    BEFORE UPDATE ON public.helper_payout_accounts
    FOR EACH ROW EXECUTE FUNCTION public.helper_payout_accounts_touch();

-- --------------------------------------------------------------------------
-- 2. Her QR image: payout/<her user id>/... in household-evidence.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    v_cmd TEXT;
BEGIN
    IF to_regclass('storage.objects') IS NULL THEN
        RETURN;
    END IF;
    EXECUTE 'DROP POLICY IF EXISTS payout_qr_read ON storage.objects';
    EXECUTE $p$CREATE POLICY payout_qr_read ON storage.objects FOR SELECT USING (
        bucket_id = 'household-evidence'
        AND (storage.foldername(name))[1] = 'payout'
        AND ((storage.foldername(name))[2] = auth.uid()::text
             OR public.can_pay_person(((storage.foldername(name))[2])::uuid)))$p$;
    FOREACH v_cmd IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'payout_qr_own_' || v_cmd);
        EXECUTE format(
            'CREATE POLICY %I ON storage.objects FOR %s %s (bucket_id = %L AND (storage.foldername(name))[1] = %L AND (storage.foldername(name))[2] = auth.uid()::text)',
            'payout_qr_own_' || v_cmd, v_cmd,
            CASE WHEN v_cmd = 'insert' THEN 'WITH CHECK' ELSE 'USING' END,
            'household-evidence', 'payout');
    END LOOP;
END;
$$;

-- --------------------------------------------------------------------------
-- 3. "I've sent it" by GCash or Maya is a payment made outside Linara.
--    Read the live definition and widen its one method list (the same way
--    add-remote-admin-pay.sql widens role lists); stop if it isn't there.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    v_fn CONSTANT REGPROCEDURE :=
        'public.record_offapp_payslip(uuid, numeric, numeric, text, date, text, date, text)'::regprocedure;
    v_def TEXT := pg_get_functiondef(v_fn);
    v_old CONSTANT TEXT := 'NOT IN (''CASH'', ''BANK_TRANSFER'', ''OTHER'')';
    v_new CONSTANT TEXT := 'NOT IN (''CASH'', ''BANK_TRANSFER'', ''OTHER'', ''PH_GCASH'', ''PH_PAYMAYA'')';
BEGIN
    IF position(v_new IN v_def) > 0 THEN
        RETURN; -- already applied
    END IF;
    IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
        RAISE EXCEPTION 'record_offapp_payslip doesn''t have exactly one method list to widen; nothing changed';
    END IF;
    EXECUTE replace(v_def, v_old, v_new);
END;
$$;
