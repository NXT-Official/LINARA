-- Closes KNOWN_GAPS.md Open Gap O7: push notifications to the helper's phone.
--
-- One table and three functions:
--
--   push_tokens                -- one row per phone (Expo push token), owned by
--                                 whoever signed in on it last. RLS lets a user
--                                 see only her own rows; nobody else reads them
--                                 directly.
--   register_push_token()      -- the mobile app calls this after sign-in. A
--                                 SECURITY DEFINER upsert, because a shared
--                                 phone's token may already belong to the
--                                 previous account, and plain RLS would refuse
--                                 to re-own that row.
--   unregister_push_token()    -- the mobile app calls this on sign-out, so the
--                                 next person on the phone doesn't get her
--                                 pushes.
--   helper_push_tokens()       -- the web server reads a helper's tokens just
--                                 before sending. Managers only, and only for a
--                                 helper in their own household.
--
-- When pushes go out is decided in the web app, not here, and follows the
-- concept doc's "no pings after hours" rule: only a manager's explicit
-- override/emergency send, and an appointment move while she is reachable.
-- See src/features/notifications/push.server.ts.

create table if not exists public.push_tokens (
    token text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    platform text check (platform in ('ios', 'android')),
    updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;
    if p_token is null or p_token !~ '^Expo(nent)?PushToken\[.+\]$' then
        raise exception 'Not an Expo push token';
    end if;

    insert into public.push_tokens (token, user_id, platform, updated_at)
    values (p_token, auth.uid(), p_platform, now())
    on conflict (token) do update
        set user_id = excluded.user_id,
            platform = excluded.platform,
            updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security invoker
set search_path = public
as $$
    delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

create or replace function public.helper_push_tokens(p_helper_id uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_user_type text;
begin
    select user_type into v_user_type from public.user_profiles where id = auth.uid();
    if v_user_type is null or v_user_type not in ('primary_manager', 'co_manager') then
        raise exception 'Forbidden: only managers can notify a helper';
    end if;

    return query
        select pt.token
        from public.helper_profiles hp
        join public.push_tokens pt on pt.user_id = hp.user_id
        where hp.id = p_helper_id
          and hp.status = 'ACTIVE'
          and hp.household_id = public.current_household_id();
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
revoke all on function public.helper_push_tokens(uuid) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.helper_push_tokens(uuid) to authenticated;
