-- Adds what the manager side of the invite/claim handshake needs, which
-- didn't exist before: a real households table, and a bootstrap RPC that
-- lets a brand-new authenticated manager create their own household and
-- become its primary_manager. Also adds employment/phone columns to
-- helper_profiles (the invite form already collects both; nothing has ever
-- persisted them) and created_at/created_by, which every other table has
-- but helper_profiles was missing.
--
-- Root cause this solves: a manager's own first user_profiles row hits the
-- identical current_household_id() bootstrap deadlock already documented
-- and solved for helpers in fix-claim-flow-rls-gaps.sql's
-- claim_helper_invite() -- inserting your own first user_profiles row is
-- checked against household_id = current_household_id(), which needs an
-- existing row to resolve, which doesn't exist yet. Same fix, same
-- technique: a SECURITY DEFINER function that pins auth.uid() internally.
--
-- Apply via the Supabase SQL editor, same as the other fix/add scripts in
-- this directory. Safe to run more than once.

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Household',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.households enable row level security;

drop policy if exists households_isolation on public.households;
create policy households_isolation on public.households
  for select using (id = public.current_household_id());
-- No INSERT/UPDATE/DELETE policy: the only writer is
-- bootstrap_manager_household() below, which is SECURITY DEFINER and
-- bypasses RLS for its own insert.

alter table public.helper_profiles
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists created_by uuid references public.user_profiles(id),
  add column if not exists employment text check (employment in ('live-in', 'live-out')),
  add column if not exists phone text;

create or replace function public.bootstrap_manager_household(
  p_full_name text,
  p_household_name text default null
)
returns table (user_id uuid, household_id uuid, full_name text, user_type text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.user_profiles%rowtype;
  v_household_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Idempotent: a page refresh mid-flow, or the confirm-email-then-log-in
  -- flow calling this a second time at first-login, returns the
  -- already-bootstrapped profile instead of erroring on a duplicate insert.
  select * into v_existing from public.user_profiles where id = v_uid;
  if v_existing.id is not null then
    return query select v_existing.id, v_existing.household_id, v_existing.full_name, v_existing.user_type;
    return;
  end if;

  insert into public.households (name)
  values (coalesce(nullif(trim(p_household_name), ''), 'My Household'))
  returning id into v_household_id;

  insert into public.user_profiles (id, household_id, full_name, user_type)
  values (v_uid, v_household_id, p_full_name, 'primary_manager');

  return query select v_uid, v_household_id, p_full_name, 'primary_manager'::text;
end;
$$;

grant execute on function public.bootstrap_manager_household(text, text) to authenticated;
-- Not granted to anon (unlike lookup_pending_invite/flag_invite in
-- fix-claim-flow-rls-gaps.sql): this must only ever run for a caller who
-- has already completed auth.signUp/signIn, exactly mirroring
-- claim_helper_invite's pattern.
