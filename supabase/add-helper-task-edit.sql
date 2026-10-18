-- A helper may fix her own task's time and note from the app (KNOWN_GAPS.md
-- O31), and her login may write nothing else on tickets (the tickets half of
-- C72's residual). Apply by hand in the Supabase SQL editor, AFTER
-- add-cancelled-tasks.sql and add-household-managers.sql (for
-- is_household_admin). Idempotent and safe to re-run. Tested in PGlite:
-- supabase/tests/helper-task-edit.test.mjs.
--
-- Until now tickets_isolation was one FOR ALL policy scoped only by
-- household, so a helper's own login, used straight against the REST API,
-- could change any task in the house: its title, who it's for, the
-- after-hours or emergency flag (which decides rest owed, add-ticket-ledger.sql),
-- or delete it. Only the app's code stood in the way. Now:
--
--   * Updating: on her own task she may change what her app already writes
--     (status, actual_start / actual_end, block_reason, photo_evidence_url)
--     plus, new, scheduled_start and notes. Not title, helper, flags or
--     anything else. Not to or from 'cancelled' (cancelling is a manager's
--     call, C74), and nothing at all once it's done or cancelled, except
--     reopening a done one (her "untick", reopenTicket).
--   * Inserting: only a task for herself, as "Promote to Board" does.
--   * Deleting: managers only. Neither app deletes as a helper.
--
-- Managers (any of the three roles; a remote admin is held further by
-- add-household-managers.sql's RESTRICTIVE policies), and anything running
-- inside a SECURITY DEFINER function (ending an employment, the ledger
-- trigger), are not affected. Rest owed still follows completion: the ledger
-- trigger reads actual_start / actual_end and the flags, which she can't
-- set, never scheduled_start.

-- --------------------------------------------------------------------------
-- 1. Is this task hers? (helper_profiles is readable to her already; this
--    just keeps the rule in one place for the trigger and the policy.)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_own_helper_profile(p_helper_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_helper_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.helper_profiles WHERE id = p_helper_id AND user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.is_own_helper_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_own_helper_profile(UUID) TO authenticated;

-- --------------------------------------------------------------------------
-- 2. Updates from a helper's session: her own task, these columns only.
--    Named zz so it runs after tickets_stamp_cancel (BEFORE triggers fire in
--    name order) and sees the row as it will be written.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tickets_guard_helper_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_allowed CONSTANT TEXT[] := ARRAY[
        'status', 'actual_start', 'actual_end', 'block_reason', 'photo_evidence_url',
        'scheduled_start', 'notes'
    ];
BEGIN
    IF current_user <> 'authenticated' OR public.is_household_admin() THEN
        RETURN NEW;
    END IF;
    IF NOT public.is_own_helper_profile(OLD.helper_id) THEN
        RAISE EXCEPTION 'You can only change your own tasks';
    END IF;
    -- Before the column check: tickets_stamp_cancel has already filled
    -- cancelled_* by now, which would otherwise be the reason given.
    IF 'cancelled' IN (OLD.status, NEW.status) THEN
        RAISE EXCEPTION 'Only a manager can cancel or restore a task';
    END IF;
    IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
        RAISE EXCEPTION 'Only a task''s time, note and progress can be changed from your app';
    END IF;
    -- A finished task stays as it was, apart from unticking it.
    IF OLD.status = 'done' AND NEW.status = 'done'
       AND (NEW.scheduled_start IS DISTINCT FROM OLD.scheduled_start
            OR NEW.notes IS DISTINCT FROM OLD.notes) THEN
        RAISE EXCEPTION 'A finished task can''t be changed';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_zz_guard_helper_update ON public.tickets;
CREATE TRIGGER tickets_zz_guard_helper_update
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.tickets_guard_helper_update();

-- --------------------------------------------------------------------------
-- 3. Inserts and deletes. RESTRICTIVE, so they narrow tickets_isolation (and
--    sit beside the remote-admin ones) rather than replace it.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS tickets_helper_insert_own ON public.tickets;
CREATE POLICY tickets_helper_insert_own ON public.tickets AS RESTRICTIVE
    FOR INSERT TO authenticated
    WITH CHECK (public.is_household_admin() OR public.is_own_helper_profile(helper_id));

DROP POLICY IF EXISTS tickets_managers_delete ON public.tickets;
CREATE POLICY tickets_managers_delete ON public.tickets AS RESTRICTIVE
    FOR DELETE TO authenticated
    USING (public.is_household_admin());
