-- A helper still employed can't ask for her account to be deleted (KNOWN_GAPS.md
-- O55, the user's choice 2026-10-09).
--
-- process_account_deletion already refused while her employment was ACTIVE,
-- but request_account_deletion took the request, so she was told it would be
-- done within 30 days when it couldn't be. Now the request itself is refused,
-- in the helper app's words, pointing her at the notice she gives first
-- (give_notice, add-pay-periods.sql): the household ends the employment on her
-- last day, settling her final pay, and then she can ask again.
--
-- Managers are unchanged. As add-account-deletion.sql otherwise. Apply by hand
-- in the Supabase SQL editor, AFTER add-account-deletion.sql. Safe to run
-- twice. Tested in supabase/tests/privacy.test.mjs.
CREATE OR REPLACE FUNCTION public.request_account_deletion(p_note TEXT DEFAULT NULL)
RETURNS public.account_deletion_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_type TEXT;
    v_row public.account_deletion_requests;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not signed in';
    END IF;

    IF EXISTS (SELECT 1 FROM public.helper_profiles
               WHERE user_id = v_uid AND status = 'ACTIVE') THEN
        RAISE EXCEPTION 'May trabaho ka pa. Magbigay muna ng abiso sa employer mo; kapag natapos na nila ang employment mo, saka mo mabubura ang account mo.';
    END IF;

    SELECT * INTO v_row FROM public.account_deletion_requests
        WHERE user_id = v_uid AND status = 'pending';
    IF FOUND THEN
        RETURN v_row;
    END IF;

    SELECT user_type INTO v_type FROM public.user_profiles WHERE id = v_uid;

    INSERT INTO public.account_deletion_requests (user_id, user_type, note)
    VALUES (v_uid, v_type, NULLIF(btrim(COALESCE(p_note, '')), ''))
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_account_deletion(TEXT) TO authenticated;
