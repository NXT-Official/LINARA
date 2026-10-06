-- KNOWN_GAPS O45: a helper's login could read every coworker's wage,
-- payslips, vales, after-hours ledger, rest-off and leave requests, and
-- payout attempts. Apply by hand in the Supabase SQL editor, AFTER every
-- other migration (it replaces policies from fix-helper-write-access.sql,
-- add-leave.sql and add-payout-attempts.sql). Idempotent and safe to re-run.
-- Tested in PGlite: supabase/tests/coworker-reads.test.mjs.
--
-- Cause: each table's household read policy allowed any row whose helper is
-- in public.current_household_id(). That returns user_profiles.household_id,
-- which is set for helpers as well as managers, so "anyone in the household"
-- included every helper. Found live on 2026-10-07: the e2e helper saw a
-- coworker's payment waiting for confirmation on My Pay.
--
-- After this:
--   * Managers and remote admins read exactly what they read before. Each
--     household branch gains one condition, `current_user_type() IS DISTINCT
--     FROM 'helper'`, the same test quick_utos_shared, household_labels_read
--     and helper_households_read already use.
--   * A helper reads only her own rows, in any household she has worked for
--     (the *_own_read policies). vales and ledger_entries never had one, so
--     they get one here; the others are recreated unchanged so this file
--     doesn't depend on add-employment-end.sql having been applied.
--   * Coworkers' names, stations and shifts still reach her through team_day,
--     my_workplaces and family_households, which are SECURITY DEFINER and so
--     not affected. Neither app reads a coworker's helper_profiles row
--     directly (checked 2026-10-07).
--   * Policies on other tables that look up helper_profiles as the caller
--     (quick_utos_isolation, invite_flags, user_profiles_former_staff_read)
--     now see only her own profile, so a helper sees only the utos sent to
--     her. That is all the mobile app reads.
--
-- No write policy changes. Writes stay as fix-helper-write-access.sql and
-- add-household-managers.sql left them.

-- --------------------------------------------------------------------------
-- 0. Who's asking. Same definition as add-household-managers.sql, repeated
--    so this file stands on its own.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_type()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT user_type FROM public.user_profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.current_user_type() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_type() TO authenticated;

-- --------------------------------------------------------------------------
-- 1. helper_profiles: the household list (with monthly_rate) is for managers.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS helper_profiles_isolation ON public.helper_profiles;
CREATE POLICY helper_profiles_isolation ON public.helper_profiles
    FOR SELECT USING (
        household_id = public.current_household_id()
        AND public.current_user_type() IS DISTINCT FROM 'helper'
    );

DROP POLICY IF EXISTS helper_profiles_own_read ON public.helper_profiles;
CREATE POLICY helper_profiles_own_read ON public.helper_profiles
    FOR SELECT USING (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- 2. payslips
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS payslips_isolation ON public.payslips;
CREATE POLICY payslips_isolation ON public.payslips
    FOR SELECT USING (
        public.current_user_type() IS DISTINCT FROM 'helper'
        AND EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = payslips.helper_id AND hp.household_id = public.current_household_id()
        )
    );

DROP POLICY IF EXISTS payslips_own_read ON public.payslips;
CREATE POLICY payslips_own_read ON public.payslips
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = payslips.helper_id AND hp.user_id = auth.uid()
        )
    );

-- --------------------------------------------------------------------------
-- 3. vales
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS vales_isolation ON public.vales;
CREATE POLICY vales_isolation ON public.vales
    FOR SELECT USING (
        public.current_user_type() IS DISTINCT FROM 'helper'
        AND EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = vales.helper_id AND hp.household_id = public.current_household_id()
        )
    );

DROP POLICY IF EXISTS vales_own_read ON public.vales;
CREATE POLICY vales_own_read ON public.vales
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = vales.helper_id AND hp.user_id = auth.uid()
        )
    );

-- --------------------------------------------------------------------------
-- 4. ledger_entries
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS ledger_entries_isolation ON public.ledger_entries;
CREATE POLICY ledger_entries_isolation ON public.ledger_entries
    FOR SELECT USING (
        public.current_user_type() IS DISTINCT FROM 'helper'
        AND EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = ledger_entries.helper_id
              AND hp.household_id = public.current_household_id()
        )
    );

DROP POLICY IF EXISTS ledger_entries_own_read ON public.ledger_entries;
CREATE POLICY ledger_entries_own_read ON public.ledger_entries
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = ledger_entries.helper_id AND hp.user_id = auth.uid()
        )
    );

-- --------------------------------------------------------------------------
-- 5. rest_off_requests
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS rest_off_requests_isolation ON public.rest_off_requests;
CREATE POLICY rest_off_requests_isolation ON public.rest_off_requests
    FOR SELECT USING (
        public.current_user_type() IS DISTINCT FROM 'helper'
        AND EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = rest_off_requests.helper_id
              AND hp.household_id = public.current_household_id()
        )
    );

DROP POLICY IF EXISTS rest_off_requests_own_read ON public.rest_off_requests;
CREATE POLICY rest_off_requests_own_read ON public.rest_off_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = rest_off_requests.helper_id AND hp.user_id = auth.uid()
        )
    );

-- --------------------------------------------------------------------------
-- 6. leave_requests: one policy with both branches, as add-leave.sql has it.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS leave_requests_read ON public.leave_requests;
CREATE POLICY leave_requests_read ON public.leave_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.helper_profiles hp
            WHERE hp.id = leave_requests.helper_id
              AND (
                  (hp.household_id = public.current_household_id()
                      AND public.current_user_type() IS DISTINCT FROM 'helper')
                  OR hp.user_id = auth.uid()
              )
        )
    );

-- --------------------------------------------------------------------------
-- 7. payout_attempts: managers only; no helper screen reads them. Still FOR
--    ALL, as add-payout-attempts.sql made it, so manager writes are
--    unchanged (the restrictive payout_attempts_manager_* policies from
--    add-household-managers.sql still limit those to primary and co-managers).
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS payout_attempts_isolation ON public.payout_attempts;
CREATE POLICY payout_attempts_isolation ON public.payout_attempts
    FOR ALL USING (
        public.current_user_type() IS DISTINCT FROM 'helper'
        AND EXISTS (
            SELECT 1
            FROM public.payslips p
            JOIN public.helper_profiles hp ON hp.id = p.helper_id
            WHERE p.id = payout_attempts.payslip_id
              AND hp.household_id = public.current_household_id()
        )
    );
