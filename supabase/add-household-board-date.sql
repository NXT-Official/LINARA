-- Closes KNOWN_GAPS.md gap C31: nothing caught a manager who closed the
-- board one night and never manually clicked "Start new day" before the
-- next real session -- board_closed stayed stuck true and today's routines
-- never spawned, since the client's `simDate`
-- (src/features/tasks/hooks/use-task-board.ts) is local useState(() => new
-- Date()) and self-corrects to "today" on every fresh page load, so it can
-- never look stale on its own. Persisting the day the board was last rolled
-- to lets a fresh load detect true staleness (a real day was skipped
-- entirely) instead of just trusting the reset-on-mount default. Same shape
-- as add-household-board-closed.sql: one household-level column,
-- manager-writable from LINARA, read on load.
ALTER TABLE public.households
    ADD COLUMN board_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- No new RLS policy needed -- households_update_budget (see
-- add-household-petty-cash-budget.sql) is a plain household-scoped UPDATE
-- policy with no column list, so it already covers this column too. The
-- manager-only restriction is enforced in application code
-- (getBoardClosedFn/setBoardDateFn in src/features/tasks/task.actions.ts),
-- matching board_closed and every other role check in this app.
--
-- board_date is never read as a source of truth for "today" on its own --
-- application code always writes it as an explicit YYYY-MM-DD string
-- computed client-side (toISODate()), the same "don't trust the DB's own
-- clock" posture already used for ledger_entries.doneTsIso (Closed Gap C10).
-- The CURRENT_DATE default only matters for a brand-new household's very
-- first read, before startNewDay() has ever set it explicitly.
