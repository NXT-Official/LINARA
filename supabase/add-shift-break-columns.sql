-- Closes KNOWN_GAPS.md gap #3 (Shifts). helper_profiles already models one
-- shift window (shift_start/shift_end) and one weekly_rest_day per helper,
-- matching plan.md's invitation flow spec exactly -- the mock Shifts UI's
-- richer per-weekday/split-shift model was prototype scope creep beyond
-- the PRD, so it's being simplified down to match rather than the schema
-- being expanded to match it.
--
-- One exception: plan.md's After-Hours Friction Gating section explicitly
-- lists "on a break" as a friction trigger alongside off-shift-hours and
-- rest-day. The existing daily_break_duration column (a length, not a
-- window) can't answer "is this helper on break right now" -- only a real
-- break_start/break_end window can. Adding one per helper, not per day,
-- staying consistent with the one-shift/one-rest-day simplification.
--
-- Apply via the Supabase SQL editor. Safe to run more than once.

alter table public.helper_profiles
  add column if not exists break_start time,
  add column if not exists break_end time;