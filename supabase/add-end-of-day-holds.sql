-- "End the day" holds every task that lands on the ended day, and every way
-- the day reopens lets them go (KNOWN_GAPS.md C100).
--
-- Ending the day (households.board_closed) promises: anything added for today
-- waits until the day reopens, and the next day starts open. Before this file
-- only the web's own New task and New routine held a task (tickets.queued,
-- set by the page). Missed:
--   * appointment prep tasks (create_appointment_with_preps and its siblings,
--     SECURITY DEFINER, which never looked at the day);
--   * an existing task edited or dragged onto today;
--   * a suggestion approved for today;
--   * the next morning: the web's rollover (startNewDay) reopened the day
--     without letting the held tasks go, so they stayed off the Pass and off
--     her phone for good. Only "Reopen today" released them;
--   * a day ended at night and never reopened (no manager opened the
--     dashboard): her phone kept showing the day as finished.
--
-- Now:
--   1. tickets_hold_for_ended_day: while the day is ended, a to-do task for
--      that day or earlier is held, from any writer (the web, the appointment
--      functions, spawn_routine_tasks). A held task moved to a later day is let
--      go, so tomorrow's task isn't hidden from her. Her own moves from her
--      phone aren't held: the task would vanish from her hands.
--   2. households_release_held_tasks: whenever board_closed goes from true to
--      false (Reopen today, the web's rollover, step 3), the household's held
--      tasks go to the board, as "Reopen today" already did.
--   3. reopen_ended_days(), hourly via pg_cron: a day ended and still closed
--      after the household's midnight reopens on the new day.
--
-- Run once in the Supabase SQL editor. Safe to re-run. Needs pg_cron (already
-- on for add-repeating-tasks.sql). Tested in PGlite:
-- supabase/tests/end-of-day.test.mjs.

-- --------------------------------------------------------------------------
-- 1. Hold what lands on an ended day.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tickets_hold_for_ended_day()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_closed BOOLEAN;
    v_closed_day DATE;
    v_day DATE;
BEGIN
    -- Her own task moved from her app.
    IF current_user = 'authenticated' AND NOT public.is_household_admin() THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.scheduled_start IS NOT DISTINCT FROM OLD.scheduled_start
       AND NEW.suggested IS NOT DISTINCT FROM OLD.suggested THEN
        RETURN NEW;
    END IF;
    IF NEW.status <> 'todo' OR NEW.suggested OR NEW.scheduled_start IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT board_closed, board_date INTO v_closed, v_closed_day
      FROM public.households WHERE id = NEW.household_id;
    v_day := (NEW.scheduled_start AT TIME ZONE public.household_timezone(NEW.household_id))::date;

    IF v_closed AND v_day <= v_closed_day THEN
        NEW.queued := TRUE;
    ELSIF TG_OP = 'UPDATE' AND NEW.queued AND NOT NEW.queued_for_shift THEN
        NEW.queued := FALSE;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_hold_for_ended_day ON public.tickets;
CREATE TRIGGER tickets_hold_for_ended_day
    BEFORE INSERT OR UPDATE OF scheduled_start, suggested ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.tickets_hold_for_ended_day();

-- --------------------------------------------------------------------------
-- 2. Reopening the day lets them go, however it reopens.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.households_release_held_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.board_closed AND NOT NEW.board_closed THEN
        UPDATE public.tickets SET queued = FALSE
         WHERE household_id = NEW.id AND queued;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.households_release_held_tasks() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS households_release_held_tasks ON public.households;
CREATE TRIGGER households_release_held_tasks
    AFTER UPDATE OF board_closed ON public.households
    FOR EACH ROW EXECUTE FUNCTION public.households_release_held_tasks();

-- --------------------------------------------------------------------------
-- 3. A day still ended after midnight reopens on the new day.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reopen_ended_days()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.households h
       SET board_closed = FALSE,
           board_date = (now() AT TIME ZONE public.household_timezone(h.id))::date
     WHERE h.board_closed
       AND h.board_date < (now() AT TIME ZONE public.household_timezone(h.id))::date;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Only the scheduler (running as postgres) calls this.
REVOKE ALL ON FUNCTION public.reopen_ended_days() FROM PUBLIC, anon, authenticated;

-- @schedule (supabase/tests stop reading here: PGlite has no pg_cron)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'reopen-ended-days';
SELECT cron.schedule('reopen-ended-days', '1 * * * *', 'SELECT public.reopen_ended_days()');

-- Check it's there, and later that it ran:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'reopen-ended-days';
--   SELECT status, return_message, start_time FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'reopen-ended-days')
--    ORDER BY start_time DESC LIMIT 5;
