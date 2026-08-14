-- Closes the remaining half of KNOWN_GAPS.md gap #5: ledger_entries had no
-- column to hold what the After-Hours Ledger UI actually displays per entry
-- (the task/utos title, and whether it came from a task or a quick utos).
-- associated_ticket_id can't stand in for this yet -- tickets isn't written
-- to at all (gap #4) -- and even once it is, a ledger entry is a historical
-- record: it should keep showing the title as it was at the time worked,
-- not drift if a ticket's title is edited later. So this denormalizes
-- title/kind onto the entry itself rather than joining live.
--
-- adjust_minutes is added alongside duration_minutes (read as the
-- auto-computed base duration) so a manager's manual adjustment survives
-- independently of the auto value, matching the existing client model
-- (LedgerEntry.autoMinutes + .adjustMinutes -- see
-- src/features/ledger/ledger.types.ts).
--
-- station/appointment_title/source_id were considered and dropped: nothing
-- in AfterHoursLedger (src/features/ledger/components/after-hours-ledger.tsx)
-- actually renders them today, so there's nothing to denormalize yet --
-- add them later if a real UI need for them shows up.
--
-- Apply via the Supabase SQL editor. Safe to run more than once.

alter table public.ledger_entries
  add column if not exists title text not null default '',
  add column if not exists kind text not null default 'task' check (kind in ('task', 'utos')),
  add column if not exists adjust_minutes integer not null default 0;
