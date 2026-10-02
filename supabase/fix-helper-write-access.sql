-- KNOWN_GAPS C72 (was O22): a helper's own session could write rows only a manager
-- should. Apply by hand in the Supabase SQL editor, after every other
-- migration (it replaces policies they created). Idempotent and safe to
-- re-run. Tested in PGlite: supabase/tests/write-access.test.mjs.
--
-- Before this, user_profiles, helper_profiles, vales, ledger_entries,
-- payslips and rest_off_requests each had one FOR ALL policy scoped only by
-- household, and households had a household-scoped UPDATE policy. Supabase
-- grants `authenticated` insert/update/delete on public tables, so a helper's
-- login used straight against the REST API (not through either app) could:
-- make herself a manager (user_profiles.user_type), raise her own rate,
-- approve her own vale or rest off, change ledger minutes or a payslip, or
-- close the board. Only the apps' code stood in the way.
--
-- After this, for those tables:
--   * Anyone in the household still READS what they read before. The
--     own-history read policies from add-employment-end.sql and
--     add-pay-periods.sql are untouched.
--   * Writes are for primary and co-managers only (is_household_manager()).
--     Remote admins write none of these, matching plan.md's permission matrix.
--   * A helper keeps exactly the two direct writes her app makes: asking for
--     a vale (a new, pending, unsettled row for herself), and setting her own
--     availability (helper_profiles.manual_status / manual_available_until,
--     enforced column by column by a trigger, since RLS can't see columns).
--   * Everything else she does already goes through SECURITY DEFINER
--     functions (claiming, notice, rest off, leave, acknowledging a payment),
--     which run as their owner and so aren't affected. A scan of every
--     function that writes these tables found none running as the caller.
--
-- Not covered here (see KNOWN_GAPS C72's residual): tickets, quick_utos,
-- appointments and the pantry tables stay household-wide, because helpers
-- write tickets and the pantry legitimately and those need per-column rules.

-- --------------------------------------------------------------------------
-- 1. Who's a manager. SECURITY DEFINER for the same reason as
--    current_household_id(): it reads user_profiles from inside policies.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_household_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND user_type IN ('primary_manager', 'co_manager')
    );
$$;
GRANT EXECUTE ON FUNCTION public.is_household_manager() TO authenticated;

-- --------------------------------------------------------------------------
-- 2. user_profiles: read-only. Nothing in either app writes it directly; the
--    bootstrap, claim and account-deletion functions do.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS user_profiles_isolation ON public.user_profiles;
CREATE POLICY user_profiles_isolation ON public.user_profiles
    FOR SELECT USING (household_id = public.current_household_id());

-- --------------------------------------------------------------------------
-- 3. households: the budget, board-closed and board-date updates are a
--    manager's.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS households_update_budget ON public.households;
CREATE POLICY households_update_budget ON public.households
    FOR UPDATE
    USING (id = public.current_household_id() AND public.is_household_manager())
    WITH CHECK (id = public.current_household_id() AND public.is_household_manager());

-- --------------------------------------------------------------------------
-- 4. helper_profiles: managers write; she may update her own row, and the
--    trigger below limits that to her availability.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS helper_profiles_isolation ON public.helper_profiles;
CREATE POLICY helper_profiles_isolation ON public.helper_profiles
    FOR SELECT USING (household_id = public.current_household_id());

DROP POLICY IF EXISTS helper_profiles_manager_insert ON public.helper_profiles;
CREATE POLICY helper_profiles_manager_insert ON public.helper_profiles
    FOR INSERT
    WITH CHECK (household_id = public.current_household_id() AND public.is_household_manager());

DROP POLICY IF EXISTS helper_profiles_manager_delete ON public.helper_profiles;
CREATE POLICY helper_profiles_manager_delete ON public.helper_profiles
    FOR DELETE
    USING (household_id = public.current_household_id() AND public.is_household_manager());

DROP POLICY IF EXISTS helper_profiles_update ON public.helper_profiles;
CREATE POLICY helper_profiles_update ON public.helper_profiles
    FOR UPDATE
    USING (
        household_id = public.current_household_id()
        AND (public.is_household_manager() OR user_id = auth.uid())
    )
    WITH CHECK (
        household_id = public.current_household_id()
        AND (public.is_household_manager() OR user_id = auth.uid())
    );

-- Her own row, her availability only. Skipped for managers, and whenever
-- the caller isn't the API's `authenticated` role -- inside a SECURITY
-- DEFINER function current_user is the function's owner, so claiming,
-- notice and ending employment are unaffected. Named to sort after
-- helper_profiles_clear_notice_on_end, so it sees the final row.
CREATE OR REPLACE FUNCTION public.helper_profiles_guard_own_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_allowed TEXT[] := ARRAY['manual_status', 'manual_available_until', 'effective_resolution'];
BEGIN
    IF current_user <> 'authenticated' OR public.is_household_manager() THEN
        RETURN NEW;
    END IF;
    IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
        RAISE EXCEPTION 'Only your availability can be changed from your app';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS helper_profiles_zz_guard_own_update ON public.helper_profiles;
CREATE TRIGGER helper_profiles_zz_guard_own_update
    BEFORE UPDATE ON public.helper_profiles
    FOR EACH ROW EXECUTE FUNCTION public.helper_profiles_guard_own_update();

-- --------------------------------------------------------------------------
-- 5. vales: managers decide; she may only ask (a new pending, unsettled,
--    undecided row for herself).
-- --------------------------------------------------------------------------
ALTER TABLE public.vales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vales_isolation ON public.vales;
CREATE POLICY vales_isolation ON public.vales
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = vales.helper_id AND hp.household_id = public.current_household_id()
        )
    );

DROP POLICY IF EXISTS vales_insert ON public.vales;
CREATE POLICY vales_insert ON public.vales
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = vales.helper_id
              AND hp.household_id = public.current_household_id()
              AND (
                  public.is_household_manager()
                  OR (
                      hp.user_id = auth.uid()
                      AND vales.status = 'pending'
                      AND vales.settled_in_payslip_id IS NULL
                      AND vales.approved_by IS NULL
                  )
              )
        )
    );

DROP POLICY IF EXISTS vales_manager_update ON public.vales;
CREATE POLICY vales_manager_update ON public.vales
    FOR UPDATE
    USING (
        public.is_household_manager()
        AND EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = vales.helper_id AND hp.household_id = public.current_household_id()
        )
    )
    WITH CHECK (
        public.is_household_manager()
        AND EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = vales.helper_id AND hp.household_id = public.current_household_id()
        )
    );

DROP POLICY IF EXISTS vales_manager_delete ON public.vales;
CREATE POLICY vales_manager_delete ON public.vales
    FOR DELETE USING (
        public.is_household_manager()
        AND EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = vales.helper_id AND hp.household_id = public.current_household_id()
        )
    );

-- --------------------------------------------------------------------------
-- 6. ledger_entries: the web records and adjusts them as a manager; she reads.
-- --------------------------------------------------------------------------
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_entries_isolation ON public.ledger_entries;
CREATE POLICY ledger_entries_isolation ON public.ledger_entries
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = ledger_entries.helper_id
              AND hp.household_id = public.current_household_id()
        )
    );

DROP POLICY IF EXISTS ledger_entries_manager_write ON public.ledger_entries;
CREATE POLICY ledger_entries_manager_write ON public.ledger_entries
    FOR ALL
    USING (
        public.is_household_manager()
        AND EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = ledger_entries.helper_id
              AND hp.household_id = public.current_household_id()
        )
    )
    WITH CHECK (
        public.is_household_manager()
        AND EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = ledger_entries.helper_id
              AND hp.household_id = public.current_household_id()
        )
    );

-- --------------------------------------------------------------------------
-- 7. payslips and rest_off_requests: read-only. Every write is already a
--    function (initiate_payslip and friends, request/decide/cancel rest off)
--    or the payout webhook's service role.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS payslips_isolation ON public.payslips;
CREATE POLICY payslips_isolation ON public.payslips
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = payslips.helper_id AND hp.household_id = public.current_household_id()
        )
    );

DROP POLICY IF EXISTS rest_off_requests_isolation ON public.rest_off_requests;
CREATE POLICY rest_off_requests_isolation ON public.rest_off_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = rest_off_requests.helper_id
              AND hp.household_id = public.current_household_id()
        )
    );
