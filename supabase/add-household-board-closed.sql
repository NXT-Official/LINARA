-- Closes KNOWN_GAPS.md gap #11: the Pass board's open/closed-for-the-night
-- flag (`boardClosed` in src/features/tasks/hooks/use-task-board.ts) was
-- plain useState(false), resetting on every refresh/device/re-login even
-- though the `queued` flag it drives is real (see Closed Gap C12). Same
-- shape as Closed Gap C13's households.petty_cash_budget: one
-- household-level flag, manager-writable from LINARA, read on load.
ALTER TABLE public.households
    ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT FALSE;

-- No new RLS policy needed: households_update_budget (added by
-- add-household-petty-cash-budget.sql) is a plain household-scoped UPDATE
-- policy with no column list, so it already covers this column too -- its
-- name predates board_closed but its USING/WITH CHECK (id =
-- current_household_id()) apply to the whole row regardless of which
-- columns a given UPDATE sets. The manager-only restriction is enforced in
-- application code (getBoardClosedFn/setBoardClosedFn in
-- src/features/tasks/task.actions.ts), matching every other role check in
-- this app.
