-- Closes KNOWN_GAPS.md Open Gap O2: auto-rollover (Closed Gap C31) trusted
-- the device's own clock with no server-side cross-check -- a device clock
-- set wrong (or a misconfigured timezone) could fire a real, irreversible
-- Quick Utos delete + routine respawn on a false premise. NTP/GPS/carrier
-- time were considered and rejected (NITZ is OS-only, not queryable by any
-- app; NTP is UDP-based, unreachable from a browser) -- neither is worth the
-- complexity for what's only ever a calendar-day comparison. Postgres's own
-- clock is infrastructure-managed (NTP-synced, not user-controllable) and
-- it's the same system households.board_date is already stored in, so it's
-- reused as the trustworthy source instead.
--
-- Plain `select now()`, no table access -- no SECURITY DEFINER needed (unlike
-- current_household_id() in fix-household-rls-recursion.sql, which bypasses
-- RLS to read user_profiles). Granted to authenticated, anon to match that
-- same function's grant shape, even though every real caller today
-- (getServerNowFn in src/features/tasks/task.actions.ts) is authenticated.
create or replace function public.server_now()
returns timestamptz
language sql
stable
as $$ select now(); $$;

grant execute on function public.server_now() to authenticated, anon;
