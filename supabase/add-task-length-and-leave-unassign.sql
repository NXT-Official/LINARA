-- Two loose ends of shared staff (KNOWN_GAPS.md O41), decided 2026-10-06:
--
--   1. TASK LENGTH. tickets.duration_minutes: how long a task takes, set by
--      the manager (optional; a task without one counts as 30 minutes where
--      a length matters). With it, "busy at the other house" is a window,
--      not a guess around a start time: staff_elsewhere() now returns it.
--   2. LEAVE CLEARS EVERY HOUSE. Approving (or recording) leave could move
--      her open tasks on those days to Unassigned only in her home
--      household: the manager's login can't reach the Beach House's tasks
--      unless they also run it. unassign_tasks_for_leave() does it in every
--      house she works in, for a manager of her HOME household and only for
--      dates covered by her live leave. Each other house's moved task gets a
--      comment saying why, so its managers see it in the task's thread.
--      The day boundaries are each task's own household's (its timezone).
--
-- Apply by hand in the SQL editor, after add-shared-staff-availability.sql,
-- add-leave.sql and add-ticket-comments.sql. Safe to run twice. Tested in
-- PGlite: supabase/tests/shared-staff-and-places.test.mjs ("Leave and length").

-- --------------------------------------------------------------------------
-- 1. Task length.
-- --------------------------------------------------------------------------
ALTER TABLE public.tickets
    ADD COLUMN IF NOT EXISTS duration_minutes INT
        CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 720);

-- The return type changes, so it's dropped and made again.
DROP FUNCTION IF EXISTS public.staff_elsewhere(TIMESTAMPTZ, TIMESTAMPTZ);
CREATE FUNCTION public.staff_elsewhere(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
    helper_id UUID,
    household_id UUID,
    household_name TEXT,
    scheduled_start TIMESTAMPTZ,
    duration_minutes INT,
    status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH here AS (
        SELECT hp.id FROM public.helper_profiles hp
        WHERE hp.household_id = public.current_household_id() AND hp.status = 'ACTIVE'
        UNION
        SELECT hh.helper_id FROM public.helper_households hh
        JOIN public.helper_profiles hp ON hp.id = hh.helper_id AND hp.status = 'ACTIVE'
        WHERE hh.household_id = public.current_household_id()
    )
    SELECT t.helper_id, t.household_id, h.name, t.scheduled_start, t.duration_minutes, t.status
    FROM public.tickets t
    JOIN here ON here.id = t.helper_id
    JOIN public.households h ON h.id = t.household_id
    WHERE t.household_id <> public.current_household_id()
      AND t.status <> 'cancelled'
      -- A task that started before the window but runs into it counts too.
      AND t.scheduled_start < p_to
      AND t.scheduled_start + make_interval(mins => COALESCE(t.duration_minutes, 30)) > p_from
      AND public.current_user_type() IN ('primary_manager', 'co_manager', 'remote_admin')
    ORDER BY t.scheduled_start;
$$;
REVOKE ALL ON FUNCTION public.staff_elsewhere(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_elsewhere(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- --------------------------------------------------------------------------
-- 2. Leave clears her tasks in every house.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unassign_tasks_for_leave(
    p_helper_id UUID,
    p_from DATE,
    p_to DATE
)
RETURNS TABLE (household_id UUID, household_name TEXT, moved INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_home UUID;
    v_name TEXT;
    v_ids UUID[];
    v_houses UUID[];
    v_when TEXT;
BEGIN
    SELECT hp.household_id, hp.name INTO v_home, v_name
    FROM public.helper_profiles hp WHERE hp.id = p_helper_id;
    IF v_home IS NULL
       OR v_home IS DISTINCT FROM public.current_household_id()
       OR public.current_user_type() NOT IN ('primary_manager', 'co_manager', 'remote_admin') THEN
        RAISE EXCEPTION 'Only her own household''s managers can move her tasks for leave';
    END IF;
    IF p_to < p_from OR NOT EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.helper_id = p_helper_id
          AND lr.status IN ('approved', 'pending')
          AND lr.start_date <= p_from AND lr.end_date >= p_to
    ) THEN
        RAISE EXCEPTION 'Those days aren''t on her leave';
    END IF;

    WITH m AS (
        UPDATE public.tickets t
           SET helper_id = NULL, reschedule_notice = NULL
          FROM public.households h
         WHERE h.id = t.household_id
           AND t.helper_id = p_helper_id
           AND t.status NOT IN ('done', 'cancelled')
           AND t.scheduled_start >= (p_from::TIMESTAMP AT TIME ZONE h.timezone)
           AND t.scheduled_start < ((p_to + 1)::TIMESTAMP AT TIME ZONE h.timezone)
        RETURNING t.id, t.household_id
    )
    SELECT COALESCE(array_agg(m.id), '{}'), COALESCE(array_agg(m.household_id), '{}')
      INTO v_ids, v_houses
      FROM m;

    -- Why it's suddenly unassigned, for the other houses' managers. Authored
    -- by whoever approved the leave (ticket_comments_stamp_author).
    IF to_regclass('public.ticket_comments') IS NOT NULL THEN
        v_when := to_char(p_from, 'Mon FMDD')
            || CASE WHEN p_to > p_from THEN ' – ' || to_char(p_to, 'Mon FMDD') ELSE '' END;
        INSERT INTO public.ticket_comments (ticket_id, body)
        SELECT u.id, format('Moved to Unassigned: %s is on leave %s.', v_name, v_when)
        FROM unnest(v_ids, v_houses) AS u(id, house)
        WHERE u.house <> v_home;
    END IF;

    RETURN QUERY
    SELECT u.house, h.name, count(*)::INT
    FROM unnest(v_ids, v_houses) AS u(id, house)
    JOIN public.households h ON h.id = u.house
    GROUP BY u.house, h.name;
END;
$$;
REVOKE ALL ON FUNCTION public.unassign_tasks_for_leave(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unassign_tasks_for_leave(UUID, DATE, DATE) TO authenticated;
