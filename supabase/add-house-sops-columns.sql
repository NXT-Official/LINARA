-- Closes the schema half of KNOWN_GAPS.md gap #1: house_sops has no
-- persisted `steps`/`tools_required`/`safety_protocol`, despite the
-- generate-sop edge function already returning a structured
-- HouseStandardSOP (title, description, station, steps, toolsRequired,
-- safetyProtocol -- see src/features/tasks/task.actions.ts).
--
-- This is additive-only: it does not add the manager-facing SOP creation
-- flow that would actually write to these columns (that half of gap #1
-- is still open, tracked separately). Safe to run ahead of that -- gives
-- LINARA_MOBILE a real column to read once something writes to it,
-- without waiting on the UI work.
--
-- Apply via the Supabase SQL editor. Safe to run more than once.

alter table public.house_sops
  add column if not exists steps text[] not null default '{}',
  add column if not exists tools_required text[] not null default '{}',
  add column if not exists safety_protocol text;
