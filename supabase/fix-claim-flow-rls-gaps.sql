-- Fixes three related RLS gaps in the invite/claim handshake (Story 5),
-- found while auditing the household_id recursion fix in
-- fix-household-rls-recursion.sql. All three are live today, independent
-- of that recursion bug:
--
-- 1. Anonymous claimants can never look up a pending invite by invite_code.
--    helper_profiles_isolation is `FOR ALL USING (household_id =
--    current_household_id())`. For an unauthenticated caller, auth.uid()
--    is NULL, so current_household_id() returns NULL and the check never
--    passes -- claimInviteFn's and flagInviteFn's `.from("helper_profiles")
--    .select(...).eq("invite_code", ...)` calls always return zero rows.
--    Every real claim attempt fails with "Invitation code not found."
--
-- 2. invite_flags has no INSERT policy at all (see
--    fix-household-rls-recursion.sql's note on this), so both insert call
--    sites in people.actions.ts fail: flagInviteFn's anonymous insert
--    throws visibly, and inviteHelperFn's wage-compliance-warning insert
--    fails silently (its error was never checked).
--
-- 3. Even with (1) and (2) fixed, claimInviteFn's own `user_profiles`
--    INSERT is a chicken-and-egg case: a brand-new helper, just
--    authenticated as themselves, inserts their *first* user_profiles
--    row. Postgres uses a FOR ALL policy's USING clause as its WITH CHECK
--    when no separate WITH CHECK is given, so the insert is checked
--    against `household_id = current_household_id()` -- but
--    current_household_id() looks up the caller's *existing*
--    user_profiles row, which doesn't exist yet. The lookup returns NULL,
--    the check never passes, and the insert is rejected every time.
--
-- Fix: three SECURITY DEFINER functions replace the direct table access
-- these three steps used. Each validates the invite_code (or the
-- caller's own auth.uid()) internally before touching a row, so no
-- blanket anon-facing table policy needs to exist. Apply via the
-- Supabase SQL editor, same as fix-household-rls-recursion.sql. Safe to
-- run more than once.
--
-- A fourth call site has the identical problem to (1): verifyClaimFn
-- ("Verify Code Endpoint," the terms-preview screen shown before a
-- claimant decides to claim or flag) does the same unauthenticated
-- `.from("helper_profiles").select(...).eq("invite_code", ...)` and
-- fails the same way. lookup_pending_invite() below returns everything
-- both call sites need so one function covers both.

-- 1. Anonymous/pre-claim lookup by invite_code. Returns nothing for a
--    code that doesn't exist or isn't PENDING_CLAIM anymore, same as the
--    RLS-filtered query it replaces -- but based on the invite_code the
--    caller supplied, not a blanket table grant.
create or replace function public.lookup_pending_invite(p_invite_code text)
returns table (
  id uuid,
  household_id uuid,
  name text,
  station text,
  monthly_rate numeric,
  shift_start time,
  shift_end time,
  weekly_rest_day integer
)
language sql
security definer
set search_path = public
stable
as $$
  select id, household_id, name, station, monthly_rate, shift_start, shift_end, weekly_rest_day
  from public.helper_profiles
  where invite_code = p_invite_code
    and status = 'PENDING_CLAIM';
$$;

grant execute on function public.lookup_pending_invite(text) to anon, authenticated;

-- 2. Anonymous flag insert. Re-validates the invite_code server-side
--    rather than trusting a client-supplied invite_id, so a caller can't
--    flag an arbitrary invite_id they don't actually hold the code for.
create or replace function public.flag_invite(p_invite_code text, p_field text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_id uuid;
  v_flag_id uuid;
begin
  select id into v_invite_id
  from public.helper_profiles
  where invite_code = p_invite_code
    and status = 'PENDING_CLAIM';

  if v_invite_id is null then
    raise exception 'Invitation code not found';
  end if;

  insert into public.invite_flags (invite_id, field, note)
  values (v_invite_id, p_field, p_note)
  returning id into v_flag_id;

  return v_flag_id;
end;
$$;

grant execute on function public.flag_invite(text, text, text) to anon, authenticated;

-- 3. Atomic claim finalize: creates the new helper's user_profiles row
--    and activates their helper_profiles row in one SECURITY DEFINER
--    call, sidestepping the current_household_id() bootstrap problem
--    described above. auth.uid() reflects the calling JWT regardless of
--    SECURITY DEFINER, so this only ever acts on the authenticated
--    caller's own uid -- it cannot be used to claim on someone else's
--    behalf.
create or replace function public.claim_helper_invite(p_invite_code text)
returns table (helper_id uuid, household_id uuid, full_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_helper public.helper_profiles%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_helper
  from public.helper_profiles
  where invite_code = p_invite_code
    and status = 'PENDING_CLAIM';

  if v_helper.id is null then
    raise exception 'Invitation code not found or already claimed';
  end if;

  insert into public.user_profiles (id, household_id, full_name, user_type)
  values (v_uid, v_helper.household_id, v_helper.name, 'helper');

  update public.helper_profiles
  set user_id = v_uid, status = 'ACTIVE'
  where id = v_helper.id;

  return query select v_helper.id, v_helper.household_id, v_helper.name;
end;
$$;

grant execute on function public.claim_helper_invite(text) to authenticated;

-- 4. invite_flags gets a real FOR ALL policy for authenticated, in-household
--    callers (covers the manager-side wage-compliance-warning insert in
--    inviteHelperFn, and lets managers read flags for their own
--    household's invites). The anonymous flag_invite() path above bypasses
--    this policy entirely via SECURITY DEFINER, so it's unaffected by it.
drop policy if exists invite_flags_isolation_select on public.invite_flags;
drop policy if exists invite_flags_isolation on public.invite_flags;
create policy invite_flags_isolation on public.invite_flags
  for all using (
    exists (
      select 1 from public.helper_profiles hp
      where hp.id = invite_flags.invite_id
        and hp.household_id = public.current_household_id()
    )
  );
