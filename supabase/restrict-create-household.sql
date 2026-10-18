-- Only a primary manager starts another household (KNOWN_GAPS.md O49, the
-- user's choice 2026-10-09).
--
-- A co-manager could start a household, becoming its primary, and then run
-- both it and the family they help: enough for add-shared-staff-and-places.sql
-- to let them share that family's staff into their own household, which the
-- family's primary manager never agreed to. Now an account that manages
-- households but is primary of none (a co-manager or remote admin only) is
-- refused. A new account still sets up its first household through
-- bootstrap_manager_household, and one that has left every household it
-- managed starts again the same way.
--
-- As add-household-managers.sql otherwise. Apply by hand in the Supabase SQL
-- editor, AFTER add-household-managers.sql. Safe to run twice. Tested in
-- supabase/tests/household-managers.test.mjs.
CREATE OR REPLACE FUNCTION public.create_household(p_name TEXT)
RETURNS TABLE (household_id UUID, user_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_type TEXT;
    v_household_id UUID;
BEGIN
    SELECT up.user_type INTO v_type FROM public.user_profiles up WHERE up.id = v_uid;
    IF v_type IS NULL THEN
        RAISE EXCEPTION 'Set up your account first';
    END IF;
    IF v_type = 'helper' THEN
        RAISE EXCEPTION 'A helper account can''t manage a household. Use a separate manager account.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.household_managers hm WHERE hm.user_id = v_uid)
       AND NOT EXISTS (
            SELECT 1 FROM public.household_managers hm
            WHERE hm.user_id = v_uid AND hm.role = 'primary_manager'
       ) THEN
        RAISE EXCEPTION 'Only a primary manager can start another household';
    END IF;
    IF NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Give the household a name';
    END IF;

    INSERT INTO public.households (name) VALUES (btrim(p_name)) RETURNING id INTO v_household_id;
    INSERT INTO public.household_managers (household_id, user_id, role, added_by)
    VALUES (v_household_id, v_uid, 'primary_manager', v_uid);
    PERFORM public.manager_set_active(v_uid, v_household_id);
    RETURN QUERY SELECT up.household_id, up.user_type FROM public.user_profiles up WHERE up.id = v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.create_household(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_household(text) TO authenticated;
