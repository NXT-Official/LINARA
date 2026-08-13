-- Closes the budget half of KNOWN_GAPS.md gap #2 (grocery petty-cash budget
-- had no shared column, both apps kept it in local-only state).
--
-- One household-level default rather than a per-Palengke-run amount: neither
-- app models a "run" as a discrete entity anywhere yet (no table to hang a
-- per-run column off of), and both apps already treat it as a single
-- recurring number today (LINARA's useGroceryList's useState(1500),
-- LINARA_MOBILE's use-palengke-budget.ts's AsyncStorage default) -- this
-- just gives that one number a real, shared home. Lives on `households`
-- (not `grocery_items`, which has no household-level singleton row to hold
-- it) so both LINARA (manager-writable) and LINARA_MOBILE (read-only) can
-- read the same value. See src/features/groceries/grocery.actions.ts's
-- getHouseholdBudgetFn/updateHouseholdBudgetFn.
ALTER TABLE public.households
    ADD COLUMN petty_cash_budget NUMERIC(10,2) NOT NULL DEFAULT 1500;

-- `households` deliberately has no INSERT/UPDATE/DELETE policy today --
-- household *creation* only ever happens through bootstrap_manager_household()
-- (a SECURITY DEFINER RPC, needed to solve the same chicken-and-egg
-- current_household_id() deadlock C2/C3 already document). Updating the
-- budget on an *existing* household a caller is already resolvable against
-- has no such deadlock, so a plain RLS policy is enough here -- same
-- household-scoped-only posture as tickets/ledger_entries/vales, with the
-- manager-only role check done in application code (updateHouseholdBudgetFn
-- in src/features/groceries/grocery.actions.ts), matching insertHouseSopFn's
-- and decideValeFn's existing pattern rather than encoding roles into RLS.
CREATE POLICY households_update_budget ON public.households
    FOR UPDATE USING (id = public.current_household_id())
    WITH CHECK (id = public.current_household_id());
