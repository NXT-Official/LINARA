-- Closing a run finishes the task that carries it (KNOWN_GAPS.md O55, the
-- user's choice 2026-10-09).
--
-- A run can be linked to a task (grocery_runs.ticket_id, e.g. the driver's
-- trip to the market). The helper closed the run with its receipt, and the
-- task then still stood open on her phone, asking for a receipt photo of its
-- own before it could be finished: the same receipt twice. Now the run's
-- closing (status 'done', from either app) marks its open task done at that
-- moment, so the receipt stays with the run. A cancelled run leaves its task
-- alone; so does a task already done or cancelled. The task's usual triggers
-- run as for any finished task (after-hours time goes to the ledger).
--
-- Apply by hand in the Supabase SQL editor, AFTER add-grocery-runs.sql. Safe
-- to run twice. Tested in supabase/tests/grocery-runs.test.mjs.
CREATE OR REPLACE FUNCTION public.grocery_runs_close_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' AND NEW.ticket_id IS NOT NULL THEN
        UPDATE public.tickets
            SET status = 'done', actual_end = now(), block_reason = NULL
            WHERE id = NEW.ticket_id AND status NOT IN ('done', 'cancelled');
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grocery_runs_close_task() FROM PUBLIC;

DROP TRIGGER IF EXISTS grocery_runs_close_task ON public.grocery_runs;
CREATE TRIGGER grocery_runs_close_task
    AFTER UPDATE OF status ON public.grocery_runs
    FOR EACH ROW EXECUTE FUNCTION public.grocery_runs_close_task();
