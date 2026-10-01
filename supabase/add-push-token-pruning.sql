-- Follow-up to add-push-tokens.sql (KNOWN_GAPS.md C58 residual): forget
-- phones that can't receive pushes any more (app uninstalled, token
-- rotated), instead of sending to them forever.
--
-- Expo reports a dead token as DeviceNotRegistered, either straight away in
-- the send response ("ticket") or later in a "receipt", which is ready some
-- minutes after the send and kept for 24 hours. There's no scheduler to come
-- back for receipts, so the web sender checks the previous send's receipts at
-- the start of the next send to the same helper. For that each token row
-- remembers its last ticket id.
--
-- The manager sending isn't the token's owner, and RLS keeps push_tokens
-- private to its owner, so the lookup and the clean-up both go through
-- manager-only SECURITY DEFINER functions scoped to one helper in the
-- caller's household.
--
-- Run after add-push-tokens.sql. Safe to run twice.

alter table public.push_tokens
    add column if not exists last_ticket_id text,
    add column if not exists last_sent_at timestamptz;

-- The return type changes (token -> token + last ticket), which CREATE OR
-- REPLACE can't do.
drop function if exists public.helper_push_tokens(uuid);

create function public.helper_push_tokens(p_helper_id uuid)
returns table (token text, last_ticket_id text, last_sent_at timestamptz)
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
        select pt.token, pt.last_ticket_id, pt.last_sent_at
        from public.helper_profiles hp
        join public.push_tokens pt on pt.user_id = hp.user_id
        where hp.id = p_helper_id
          and hp.status = 'ACTIVE'
          and hp.household_id = public.current_household_id();
end;
$$;

-- p_dead: tokens Expo called DeviceNotRegistered -- deleted.
-- p_sent: [{"token": "...", "ticketId": "..."}] for this send -- remembered so
--         the next send can read their receipts.
-- Only rows belonging to this helper, in the caller's household, are touched.
create or replace function public.settle_helper_push_tokens(
    p_helper_id uuid,
    p_dead text[],
    p_sent jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_type text;
    v_helper_user uuid;
begin
    select user_type into v_user_type from public.user_profiles where id = auth.uid();
    if v_user_type is null or v_user_type not in ('primary_manager', 'co_manager') then
        raise exception 'Forbidden: only managers can notify a helper';
    end if;

    select hp.user_id into v_helper_user
    from public.helper_profiles hp
    where hp.id = p_helper_id
      and hp.household_id = public.current_household_id();
    if v_helper_user is null then
        return;
    end if;

    delete from public.push_tokens
    where user_id = v_helper_user
      and token = any(coalesce(p_dead, '{}'));

    update public.push_tokens pt
    set last_ticket_id = s."ticketId",
        last_sent_at = now()
    from jsonb_to_recordset(coalesce(p_sent, '[]'::jsonb)) as s(token text, "ticketId" text)
    where pt.user_id = v_helper_user
      and pt.token = s.token;
end;
$$;

revoke all on function public.helper_push_tokens(uuid) from public, anon;
revoke all on function public.settle_helper_push_tokens(uuid, text[], jsonb) from public, anon;
grant execute on function public.helper_push_tokens(uuid) to authenticated;
grant execute on function public.settle_helper_push_tokens(uuid, text[], jsonb) to authenticated;
