-- Closes the last open item in KNOWN_GAPS.md O2 / MULTI_HELPER_HANDLING.md
-- (Availability). A helper's "Available for N hours" opt-in was real and
-- working on LINARA_MOBILE's Today tab, but only ever written to that
-- device's own AsyncStorage -- never Supabase -- so the web dashboard could
-- never see it. helper_profiles_isolation (architecture.md) is already a
-- plain household-scoped policy with no row-ownership restriction, and a
-- claimed helper's own session already satisfies it directly (see
-- LINARA_MOBILE/services/api/helper-profile.ts's getMyHelperProfile), so no
-- new RLS policy or SECURITY DEFINER function is needed here -- just the
-- columns. NULL/NULL means "off" (no override), same default both apps'
-- local-only versions already used.
--
-- Apply via the Supabase SQL editor. Safe to run more than once.

alter table public.helper_profiles
  add column if not exists manual_status text check (manual_status in ('available', 'off')),
  add column if not exists manual_available_until timestamp with time zone;
