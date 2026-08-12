-- Fixes infinite recursion (Postgres error 42P17) in the household_id
-- isolation policies, and adds isolation policies for four tables that had
-- Row-Level Security enabled but no policy defined — meaning default-deny
-- for every role, including legitimate managers and claimed helpers.
--
-- Root cause: user_profiles_isolation queries public.user_profiles from
-- inside a policy applied ON public.user_profiles:
--
--   CREATE POLICY user_profiles_isolation ON public.user_profiles
--       FOR ALL USING (household_id = (SELECT household_id FROM public.user_profiles WHERE id = auth.uid()));
--
-- Evaluating that subquery re-applies the same policy to itself, forever.
-- Every other policy that resolved "my household_id" the same way (a raw
-- subquery against user_profiles) inherited the same failure — confirmed
-- live against tickets and helper_profiles, and against the LINARA_MOBILE
-- storage bucket policy in ../LINARA_MOBILE/supabase/storage-policies.sql.
--
-- Fix: a SECURITY DEFINER function resolves household_id with RLS bypassed
-- for its own internal lookup, so nothing re-triggers the calling policy.
-- Apply via the Supabase SQL editor, same as the rest of the schema. Safe
-- to run more than once (every statement drops-then-creates or upserts).

-- 1. The recursion-safe household lookup. SECURITY DEFINER runs with the
--    function owner's privileges, so the SELECT inside it does not itself
--    go through RLS. search_path is pinned per Postgres's standard guidance
--    for SECURITY DEFINER functions (stops a caller from redefining
--    public.* to change what this function resolves to).
create or replace function public.current_household_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select household_id from public.user_profiles where id = auth.uid();
$$;

grant execute on function public.current_household_id() to authenticated, anon;

-- 2. Re-point every existing household_id isolation policy at the function
--    instead of the self-referencing subquery.
drop policy if exists user_profiles_isolation on public.user_profiles;
create policy user_profiles_isolation on public.user_profiles
  for all using (household_id = public.current_household_id());

drop policy if exists helper_profiles_isolation on public.helper_profiles;
create policy helper_profiles_isolation on public.helper_profiles
  for all using (household_id = public.current_household_id());

drop policy if exists house_sops_isolation on public.house_sops;
create policy house_sops_isolation on public.house_sops
  for all using (household_id = public.current_household_id());

drop policy if exists tickets_isolation on public.tickets;
create policy tickets_isolation on public.tickets
  for all using (household_id = public.current_household_id());

drop policy if exists appointments_isolation on public.appointments;
create policy appointments_isolation on public.appointments
  for all using (household_id = public.current_household_id());

drop policy if exists pantry_items_isolation on public.pantry_items;
create policy pantry_items_isolation on public.pantry_items
  for all using (household_id = public.current_household_id());

drop policy if exists grocery_items_isolation on public.grocery_items;
create policy grocery_items_isolation on public.grocery_items
  for all using (household_id = public.current_household_id());

-- 3. These four tables had RLS enabled (see architecture.md Section 8's
--    ALTER TABLE ... ENABLE ROW LEVEL SECURITY block) but no matching
--    policy was ever created — a separate, distinct gap from the recursion
--    bug above. None of the four carry a household_id column directly;
--    each is scoped by joining through helper_profiles, which does.

drop policy if exists quick_utos_isolation on public.quick_utos;
create policy quick_utos_isolation on public.quick_utos
  for all using (
    exists (
      select 1 from public.helper_profiles hp
      where hp.id = quick_utos.recipient_id
        and hp.household_id = public.current_household_id()
    )
  );

drop policy if exists vales_isolation on public.vales;
create policy vales_isolation on public.vales
  for all using (
    exists (
      select 1 from public.helper_profiles hp
      where hp.id = vales.helper_id
        and hp.household_id = public.current_household_id()
    )
  );

drop policy if exists ledger_entries_isolation on public.ledger_entries;
create policy ledger_entries_isolation on public.ledger_entries
  for all using (
    exists (
      select 1 from public.helper_profiles hp
      where hp.id = ledger_entries.helper_id
        and hp.household_id = public.current_household_id()
    )
  );

-- invite_flags is intentionally SELECT-only here. Its documented API
-- (POST /api/helpers/claim/flag — plan.md Section 3.1) is unauthenticated
-- by design: a helper flags a term mismatch before they have claimed an
-- account, so there is no auth.uid() for a household-scoped INSERT policy
-- to check against. Writing that INSERT policy needs a decision this
-- script shouldn't make unilaterally — either a SECURITY DEFINER RPC the
-- unauthenticated claim flow calls instead of a direct table insert, or
-- confirmation that the existing server function already writes through a
-- service-role connection that bypasses RLS for this one case. Until
-- that's decided, inserts to this table only work through whatever already
-- bypasses RLS today.
drop policy if exists invite_flags_isolation_select on public.invite_flags;
create policy invite_flags_isolation_select on public.invite_flags
  for select using (
    exists (
      select 1 from public.helper_profiles hp
      where hp.id = invite_flags.invite_id
        and hp.household_id = public.current_household_id()
    )
  );
