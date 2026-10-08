-- Repeating tasks come back on the days they repeat (KNOWN_GAPS.md O43).
--
-- New task's "Repeat" (and Schedule -> Routines) saved tickets.recurrence,
-- but nothing ever made the next day's task: the web board spawned them from
-- a list held in the browser that nothing filled. Daily chores silently
-- vanished after their first day.
--
-- THE MODEL. A repeating task is a SERIES of ordinary tickets:
--
--   * routine_id (TEXT, as it already was) names the series: it is the id of
--     the series' first task. A new repeating task gets it from the trigger
--     below (the web sets it too); a repeating task made before this file is
--     given its own id here, so it becomes the first of its series.
--   * occurrence_date (new) is the household day a task is FOR. Moving a task
--     to another day keeps it, so a move neither collides with nor brings
--     back that day's task.
--   * The series' newest task (latest occurrence_date) is the pattern for the
--     next: its title, note, time of day, length, trip ends and repeat. The
--     helper is the one on the newest task that HAS one, so a day spawned
--     Unassigned while she was on leave doesn't leave the series Unassigned.
--     Editing today's task therefore changes the days after it too.
--   * Stopping the repeat (Routines -> remove, or Stop repeating on a task)
--     clears recurrence on every task of the series; nothing is made after
--     that. Cancelling one day's task skips that day only.
--   * A remote admin's suggested repeating task starts repeating once an
--     on-site manager approves it.
--   * Only the last five weeks are read: a series with no task since then
--     (old test data) doesn't wake up. One still going has one at least
--     weekly, which the hourly job keeps true.
--
-- What this file adds:
--   1. occurrence_date, and ONE task per series and day (a unique index), so
--      two tabs, a reload, the hourly job and a page load can never make two.
--   2. A trigger that fills routine_id and occurrence_date on a new
--      repeating task, from either app or the API.
--   3. spawn_routine_tasks_for(household, day): makes that day's task for
--      every series due then. It goes to the series' helper, or to no one
--      (Unassigned, on the managers' board) when she has approved leave that
--      day, approved rest off covering its time, or no longer works here --
--      the same rule as the web's routineAssignee().
--   4. spawn_routine_tasks(): the caller's household, today (the household's
--      day, households.timezone). The web calls it whenever the board opens
--      and at the midnight rollover; LINARA_MOBILE may call it too.
--   5. spawn_routine_tasks_everywhere(), hourly via pg_cron: each household's
--      tasks for its new day exist within the hour after its midnight, so her
--      phone has the day's chores before any manager opens the dashboard.
--
-- Before this file the web makes the tasks itself, with an id derived from
-- the series and the day, so two tabs still can't double one (the primary
-- key refuses the second). Those tasks are given their occurrence_date below.
--
-- Apply by hand in the Supabase SQL editor, after
-- add-task-length-and-leave-unassign.sql, add-shared-staff-and-places.sql,
-- add-leave.sql and add-rest-off-requests.sql. Needs pg_cron (already on for
-- add-nightly-utos-purge.sql). Safe to run twice. Tested in PGlite:
-- supabase/tests/repeating-tasks.test.mjs.

-- --------------------------------------------------------------------------
-- 1. The day a task is for, and one per series and day.
-- --------------------------------------------------------------------------
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS occurrence_date DATE;

-- A repeating task from before this file starts its own series.
UPDATE public.tickets
   SET routine_id = id::text
 WHERE routine_id IS NULL
   AND cardinality(recurrence) > 0;

-- Every task already in a series is for the day it's scheduled on. Should a
-- series somehow hold two on one day, only the first gets the day; the other
-- keeps NULL, so the index below can be made.
WITH ranked AS (
    SELECT t.id,
           (t.scheduled_start AT TIME ZONE public.household_timezone(t.household_id))::date AS day,
           row_number() OVER (
               PARTITION BY t.routine_id,
                            (t.scheduled_start AT TIME ZONE public.household_timezone(t.household_id))::date
               ORDER BY t.scheduled_start, t.id
           ) AS n
    FROM public.tickets t
    WHERE t.routine_id IS NOT NULL
      AND t.occurrence_date IS NULL
)
UPDATE public.tickets t
   SET occurrence_date = r.day
  FROM ranked r
 WHERE t.id = r.id
   AND r.n = 1
   AND NOT EXISTS (
       SELECT 1 FROM public.tickets o
       WHERE o.routine_id = t.routine_id AND o.occurrence_date = r.day
   );

CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_per_series_day
    ON public.tickets (routine_id, occurrence_date)
    WHERE routine_id IS NOT NULL AND occurrence_date IS NOT NULL;

-- The spawn reads a household's series.
CREATE INDEX IF NOT EXISTS idx_tickets_household_series
    ON public.tickets (household_id, routine_id)
    WHERE routine_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- 2. A new repeating task names its series and its day.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tickets_series_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF cardinality(NEW.recurrence) > 0 THEN
        NEW.routine_id := COALESCE(NEW.routine_id, NEW.id::text);
    END IF;
    IF NEW.routine_id IS NOT NULL AND NEW.occurrence_date IS NULL THEN
        NEW.occurrence_date :=
            (NEW.scheduled_start AT TIME ZONE public.household_timezone(NEW.household_id))::date;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_series_defaults ON public.tickets;
CREATE TRIGGER tickets_series_defaults
    BEFORE INSERT ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.tickets_series_defaults();

-- --------------------------------------------------------------------------
-- 3. Making a day's tasks.
-- --------------------------------------------------------------------------

-- Whether a series' task on this day, at this time, can go to her: she still
-- works here and has no approved leave that day or rest off covering the time.
-- Internal: it reads any helper's time off, so nobody calls it directly.
CREATE OR REPLACE FUNCTION public.routine_helper_free(
    p_helper_id UUID,
    p_household_id UUID,
    p_day DATE,
    p_at TIME
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_helper_id IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM public.helper_profiles hp
           WHERE hp.id = p_helper_id AND hp.status = 'ACTIVE'
       )
       AND public.helper_works_in(p_helper_id, p_household_id)
       AND NOT EXISTS (
           SELECT 1 FROM public.leave_requests lr
           WHERE lr.helper_id = p_helper_id
             AND lr.status = 'approved'
             AND p_day BETWEEN lr.start_date AND lr.end_date
       )
       AND NOT EXISTS (
           SELECT 1 FROM public.rest_off_requests r
           WHERE r.helper_id = p_helper_id
             AND r.status = 'approved'
             AND r.rest_date = p_day
             AND p_at >= r.start_time
             AND p_at < r.end_time
       );
$$;

REVOKE ALL ON FUNCTION public.routine_helper_free(UUID, UUID, DATE, TIME) FROM PUBLIC, anon, authenticated;

-- One household, one day. Returns how many tasks it made.
CREATE OR REPLACE FUNCTION public.spawn_routine_tasks_for(p_household_id UUID, p_day DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tz TEXT := public.household_timezone(p_household_id);
    v_count INTEGER;
BEGIN
    WITH series AS (
        SELECT t.*,
               COALESCE(t.occurrence_date, (t.scheduled_start AT TIME ZONE v_tz)::date) AS day
        FROM public.tickets t
        WHERE t.household_id = p_household_id
          AND t.routine_id IS NOT NULL
          -- The last five weeks, as the web reads them (ROUTINE_LOOKBACK_DAYS).
          -- A series still going has a task at least weekly; one with none
          -- since then (old test data, a household that left) stays asleep.
          AND t.scheduled_start >= ((p_day - 35)::timestamp AT TIME ZONE v_tz)
    ),
    newest AS (
        SELECT DISTINCT ON (s.routine_id) s.*
        FROM series s
        ORDER BY s.routine_id, s.day DESC, s.scheduled_start DESC
    ),
    due AS (
        SELECT n.*,
               (n.scheduled_start AT TIME ZONE v_tz)::time AS at_time,
               (SELECT s.helper_id FROM series s
                 WHERE s.routine_id = n.routine_id AND s.helper_id IS NOT NULL
                 ORDER BY s.day DESC, s.scheduled_start DESC
                 LIMIT 1) AS usual_helper
        FROM newest n
        WHERE cardinality(n.recurrence) > 0
          AND NOT n.suggested
          AND n.day < p_day
          AND ('daily' = ANY (n.recurrence) OR to_char(p_day, 'Dy') = ANY (n.recurrence))
    )
    INSERT INTO public.tickets (
        household_id, title, notes, helper_id, status, scheduled_start,
        duration_minutes, from_household_id, from_place_id, to_household_id, to_place_id,
        recurrence, routine_id, occurrence_date, created_by
    )
    SELECT p_household_id, d.title, d.notes,
           CASE WHEN public.routine_helper_free(d.usual_helper, p_household_id, p_day, d.at_time)
                THEN d.usual_helper END,
           'todo', (p_day + d.at_time) AT TIME ZONE v_tz,
           d.duration_minutes, d.from_household_id, d.from_place_id,
           d.to_household_id, d.to_place_id,
           d.recurrence, d.routine_id, p_day, d.created_by
    FROM due d
    -- Already made (another tab, the hourly job): one per series and day.
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.spawn_routine_tasks_for(UUID, DATE) FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 4. The caller's household, today. Anyone in the household may ask: it only
--    makes what the managers already set to repeat, the same whoever asks.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.spawn_routine_tasks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household UUID := public.current_household_id();
BEGIN
    IF v_household IS NULL THEN
        RETURN 0;
    END IF;
    RETURN public.spawn_routine_tasks_for(
        v_household,
        (now() AT TIME ZONE public.household_timezone(v_household))::date
    );
END;
$$;

REVOKE ALL ON FUNCTION public.spawn_routine_tasks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spawn_routine_tasks() TO authenticated;

-- --------------------------------------------------------------------------
-- 5. Every household with a repeating task, each on its own day.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.spawn_routine_tasks_everywhere()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_household UUID;
    v_total INTEGER := 0;
BEGIN
    FOR v_household IN
        SELECT DISTINCT t.household_id FROM public.tickets t
        WHERE t.routine_id IS NOT NULL AND cardinality(t.recurrence) > 0
    LOOP
        v_total := v_total + public.spawn_routine_tasks_for(
            v_household,
            (now() AT TIME ZONE public.household_timezone(v_household))::date
        );
    END LOOP;
    RETURN v_total;
END;
$$;

-- Only the scheduler (running as postgres) calls this.
REVOKE ALL ON FUNCTION public.spawn_routine_tasks_everywhere() FROM PUBLIC, anon, authenticated;

-- @schedule (supabase/tests stop reading here: PGlite has no pg_cron)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'spawn-routine-tasks';
SELECT cron.schedule('spawn-routine-tasks', '2 * * * *', 'SELECT public.spawn_routine_tasks_everywhere()');

-- Check it's there, and later that it ran:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'spawn-routine-tasks';
--   SELECT status, return_message, start_time FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'spawn-routine-tasks')
--    ORDER BY start_time DESC LIMIT 5;
