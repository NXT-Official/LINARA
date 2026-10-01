-- Part of closing KNOWN_GAPS.md O8: an in-app way to delete an account, as
-- both app stores require, reconciled with the employment records Philippine
-- labor law makes the household keep (payslips, hours, leave -- RA 10361 and
-- the Labor Code's three-year record rule).
--
-- Two steps, on purpose:
--   1. request_account_deletion() -- from either app. Records the request; the
--      account keeps working until it's processed, and the request can be
--      withdrawn (cancel_account_deletion).
--   2. process_account_deletion(user_id) -- run by whoever operates Linara, from
--      the SQL editor, within 30 days (the privacy policy's promise). Not callable
--      by any app user. Pending requests:
--        SELECT * FROM account_deletion_requests WHERE status = 'pending';
--
-- What processing deletes: the login (auth.users) and everything that cascades
-- from it (user_profiles, push_tokens); a helper's private notes; for the last
-- manager of a household, its appointments, pantry, groceries, house SOPs,
-- Quick Utos and unclaimed invites (and the household itself if nobody ever
-- worked there). What it keeps: each employment (helper_profiles, now with
-- user_id NULL), its payslips, vales, hours and leave, and the tasks she did --
-- the household's legal record and the helper's own work history. Attribution
-- columns that pointed at the deleted person ("created by", "approved by") are
-- set to NULL.
--
-- Apply by hand in the SQL editor, after add-employment-end.sql.

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- No foreign key: the request outlives the account, as the record that the
    -- deletion was asked for and done.
    user_id UUID NOT NULL,
    user_type TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'done')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_pending
    ON public.account_deletion_requests (user_id) WHERE status = 'pending';

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_deletion_requests_own_read ON public.account_deletion_requests;
CREATE POLICY account_deletion_requests_own_read ON public.account_deletion_requests
    FOR SELECT USING (user_id = auth.uid());
-- Writes go through the functions below only.
REVOKE INSERT, UPDATE, DELETE ON public.account_deletion_requests FROM anon, authenticated;
GRANT SELECT ON public.account_deletion_requests TO authenticated;

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

CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.account_deletion_requests
        SET status = 'cancelled', processed_at = now()
        WHERE user_id = auth.uid() AND status = 'pending';
$$;

GRANT EXECUTE ON FUNCTION public.request_account_deletion(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;

CREATE OR REPLACE FUNCTION public.process_account_deletion(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile public.user_profiles;
    v_last_manager BOOLEAN := FALSE;
    v_household_deleted BOOLEAN := FALSE;
    v_fk RECORD;
    v_table TEXT;
    v_notes INTEGER := 0;
BEGIN
    SELECT * INTO v_profile FROM public.user_profiles WHERE id = p_user_id;

    -- Every job she still holds has to be ended by the household first, so her
    -- final pay and record are settled (end_helper_employment).
    IF EXISTS (SELECT 1 FROM public.helper_profiles
               WHERE user_id = p_user_id AND status = 'ACTIVE') THEN
        RAISE EXCEPTION 'Her employment is still active. Ask the household to end it (with final pay) first.';
    END IF;

    IF v_profile.user_type IN ('primary_manager', 'co_manager', 'remote_admin') THEN
        v_last_manager := NOT EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE household_id = v_profile.household_id
              AND id <> p_user_id
              AND user_type IN ('primary_manager', 'co_manager', 'remote_admin'));

        IF v_last_manager AND EXISTS (
            SELECT 1 FROM public.helper_profiles
            WHERE household_id = v_profile.household_id AND status = 'ACTIVE') THEN
            RAISE EXCEPTION 'This household still employs someone. End each employment (with final pay) first.';
        END IF;
    END IF;

    -- Her private notes: nobody else may ever read them, so nobody keeps them.
    DELETE FROM public.helper_notes
        WHERE helper_id IN (SELECT id FROM public.helper_profiles WHERE user_id = p_user_id);
    GET DIAGNOSTICS v_notes = ROW_COUNT;

    IF v_last_manager THEN
        DELETE FROM public.quick_utos
            WHERE recipient_id IN (SELECT id FROM public.helper_profiles
                                   WHERE household_id = v_profile.household_id);
        FOREACH v_table IN ARRAY ARRAY['appointments', 'pantry_items', 'grocery_items', 'house_sops'] LOOP
            IF to_regclass('public.' || v_table) IS NOT NULL THEN
                EXECUTE format('DELETE FROM public.%I WHERE household_id = $1', v_table)
                    USING v_profile.household_id;
            END IF;
        END LOOP;
        DELETE FROM public.helper_profiles
            WHERE household_id = v_profile.household_id
              AND status = 'PENDING_CLAIM' AND user_id IS NULL;
    END IF;

    -- "Created by" / "approved by" columns pointing at this person: keep the
    -- row, drop the name. Found from the catalog so a column added later can't
    -- be missed (a missed one would block the delete below, not leak).
    FOR v_fk IN
        SELECT c.conrelid::regclass AS tbl, a.attname AS col
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f'
          AND array_length(c.conkey, 1) = 1
          AND c.confrelid IN ('public.user_profiles'::regclass, 'auth.users'::regclass)
          AND c.confdeltype IN ('a', 'r')
          AND NOT a.attnotnull
    LOOP
        EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', v_fk.tbl, v_fk.col, v_fk.col)
            USING p_user_id;
    END LOOP;

    -- The login itself. Cascades to user_profiles (and push_tokens); each
    -- employment's user_id goes NULL, keeping it and its pay records.
    DELETE FROM auth.users WHERE id = p_user_id;

    IF v_last_manager AND NOT EXISTS (
        SELECT 1 FROM public.helper_profiles WHERE household_id = v_profile.household_id) THEN
        DELETE FROM public.households WHERE id = v_profile.household_id;
        v_household_deleted := TRUE;
    END IF;

    UPDATE public.account_deletion_requests
        SET status = 'done', processed_at = now(), note = NULL
        WHERE user_id = p_user_id AND status = 'pending';

    RETURN jsonb_build_object(
        'user_id', p_user_id,
        'user_type', v_profile.user_type,
        'private_notes_deleted', v_notes,
        'household_data_deleted', v_last_manager,
        'household_deleted', v_household_deleted);
END;
$$;

-- Operator-only: run from the SQL editor (as postgres), never from an app.
REVOKE ALL ON FUNCTION public.process_account_deletion(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_account_deletion(UUID) FROM anon, authenticated;
