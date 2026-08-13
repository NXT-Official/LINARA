# Known Gaps

Shared, cross-repo log of mismatches between the docs/roadmap and what the
code and schema actually support. This file lives in `LINARA` because it is
the schema-owning repo, but it covers gaps found from **either** workspace —
`LINARA` (web) or [`LINARA_MOBILE`](../LINARA_MOBILE/README.md).

**Read this before starting a story that touches a gap listed below.**
**Add to this file the moment you find a new gap** — a roadmap step that
assumes a column, table, or behavior that doesn't actually exist, a piece of
UI copy that promises something the schema can't back, etc. Don't silently
work around it and let the next session rediscover it. Use the template at
the bottom.

---

## Open Gaps

### 1. `house_sops` has no `steps` / `toolsRequired` / `safetyProtocol` columns

- **Found:** 2026-08-13, while building `LINARA_MOBILE` Story 7 (Today tab SOP carousel).
- **What's missing:** The AI SOP Creator edge function (`generate-sop`, web
  Story 10) returns a structured `HouseStandardSOP` — `title`, `description`,
  `station`, `steps: string[]`, `toolsRequired: string[]`, `safetyProtocol` —
  see `LINARA/src/features/tasks/task.actions.ts`. Nothing in either
  codebase ever inserts that result into `house_sops`, and the table itself
  only has `title` / `description` / `standard_image_url` (see
  `LINARA/architecture.md`, comment above the `house_sops` `CREATE TABLE`).
  There is also no manager-facing UI anywhere that persists a generated SOP.
- **Blocks:** `LINARA_MOBILE` Story 9 (SOP Taglish Simplifier) explicitly
  needs real `steps` input to translate into Taglish cards — flagged in
  `LINARA_MOBILE/roadmap/Story_9_VoiceToTaskPromoterAndSOPTranslator.md`'s
  "Known Gap to Resolve Before Step 5" section.
- **Current workaround:** `LINARA_MOBILE/lib/sop.ts` splits `description` on
  newlines to fake discrete carousel slides. Not a substitute for real
  structured steps.
- **To close:** On the `LINARA` (schema-owning) side — (1) a migration
  adding `steps` (TEXT[] or JSONB), `tools_required` (TEXT[]), and
  `safety_protocol` (TEXT) to `house_sops`; (2) a manager-facing flow that
  actually inserts `generate-sop`'s result somewhere, which doesn't exist
  yet either. Update both repos together per `AGENTS.md`'s schema-owner rule.

### 2. `grocery_items` has no receipt/photo column, and no table carries an allocated petty-cash budget

- **Found:** 2026-08-13, while building `LINARA_MOBILE` Story 8 (Pantry & Palengke checklist).
- **What's missing:**
  1. `plan.md` 3.2 describes attaching "a picture of the paper receipt" to a
     Palengke Run, but `grocery_items` has no photo/receipt column (see
     `LINARA/architecture.md`, comment above the `grocery_items`
     `CREATE TABLE`). A receipt also naturally covers many `grocery_items`
     rows at once, so a column on this table would be the wrong shape even
     if added.
  2. `plan.md` 3.2 describes displaying "the allocated petty-cash budget,"
     but no column anywhere holds a manager-set allocation. Both
     `LINARA/src/features/groceries/hooks/use-grocery-list.ts` (web) and
     `LINARA_MOBILE/hooks/use-palengke-budget.ts` (mobile) keep this in
     local component/device state only, defaulting to ₱1500.
- **Blocks:** Nothing yet — both workarounds below are functionally
  complete for what's been built so far.
- **Current workaround:**
  1. `LINARA_MOBILE` routes the captured receipt to the Palengke Run
     ticket's existing `tickets.photo_evidence_url` instead (see
     `LINARA_MOBILE/services/api/tickets.ts`'s `getActivePalengkeTicket`).
  2. Budget stays device-local via `AsyncStorage` on mobile, matching the
     web prototype's own `useState(1500)`-only behavior — not a regression,
     just not yet a real product decision either side has made.
- **To close:** If a manager-set allocation that syncs across devices is
  ever wanted, add a real column (e.g. per-run or per-household) on the
  `LINARA` side and update both repos together.

### 3. `helper_profiles` can't represent the Shifts UI it's supposed to back

- **Found:** 2026-08-13, auditing `LINARA` Stories 8/9 against the live schema.
- **What's missing:** `helper_profiles` (`LINARA/architecture.md`) models one
  fixed shift window (`shift_start`, `shift_end`) applying every working day,
  one `daily_break_duration` (a duration, not start/end times), and exactly
  one `weekly_rest_day` (a single integer 0-6). `LINARA/src/features/shifts/hooks/use-schedules.ts`'s
  `WeekSchedule` type models something structurally richer: an independent
  `DaySchedule` per weekday, each with its own `rest: boolean`, multiple
  `segments` (split shifts), and optional per-day `breakStart`/`breakEnd`.
  `LINARA/src/features/shifts/components/shifts-section.tsx` even has a
  same-day-rest-coverage warning feature that assumes rest days can vary
  per helper, which the schema already supports (each helper has their own
  `weekly_rest_day`) but per-day breaks and split shifts do not fit at all.
- **Blocks:** Any real migration of the Shifts feature off local mock state.
  Also blocks `ledger_entries` persistence (`LINARA/src/features/ledger/hooks/use-ledger.ts`
  reads `schedules.weekFor(helperId)` to classify off-shift work), so this
  has to be resolved before that migration too.
- **Current workaround:** `useSchedules()` is pure local `useState`, never
  reads or writes `helper_profiles`. Fully local, no cross-device sync.
- **To close:** A product decision, not just a code change — either (a)
  collapse the Shifts UI down to what `helper_profiles` can represent
  (one shift + one rest day, no per-day overrides, no split shifts — a real
  feature regression), or (b) add a new table (e.g.
  `helper_weekly_overrides`) that can hold the richer per-day shape. Needs
  the user's call before either repo starts on it.

### 4. Pass board (`tickets`) is never actually written to

- **Found:** 2026-08-13, auditing `LINARA` Stories 8/13/14 against the live schema.
- **What's missing:** `LINARA/src/features/tasks/hooks/use-task-board.ts` is
  pure local `useState`; `LINARA/src/lib/offline-queue.ts`'s IndexedDB queue
  only replays queued actions into that same local state
  (`app-store-provider.tsx`'s `syncOfflineQueue`); the
  `household-board-channel` Realtime subscription only relays broadcast
  actions between browser tabs and logs (but never applies) incoming
  `postgres_changes` on `tickets`. No code path anywhere inserts, updates,
  or reads a real `tickets` row. Separately, the client `Task` type
  (`LINARA/src/features/tasks/task.types.ts`) and the `tickets` table
  (`LINARA/architecture.md`) have diverged: `tickets` has `sop_id`,
  `actual_start`, `actual_end` with no client-side equivalent at all, while
  `Task` has `queued`, `suggested`, `pendingSync`, `recurrence`/`routineId`,
  and the appointment-prep bookkeeping fields (`appointmentId`,
  `leadMinutes`, `rescheduleNotice`, ...) with no matching column.
- **Blocks:** Nothing yet (nothing downstream expects live board data), but
  this is the core of what Stories 8/13/14's "completed" status doesn't
  actually cover.
- **Current workaround:** None — it's a fully local simulation today,
  seeded from `INITIAL_TASKS`/`INITIAL_ROUTINES`.
- **To close:** Real migration work: wire `useTaskBoard`'s mutations to
  `tickets` inserts/updates, fix the Realtime listener to apply incoming
  changes instead of only logging them, and reconcile the field mismatches
  above (routines/recurrence have no table at all yet either).

### 5. Ledger (`ledger_entries`) and Vales (`vales`) are never actually written to

- **Found:** 2026-08-13, auditing `LINARA` Story 15 against the live schema.
- **What's missing:** `LINARA/src/features/ledger/hooks/use-ledger.ts` and
  `use-vales.ts` are both pure local `useState`; nothing ever inserts into
  `ledger_entries` or `vales` despite both tables having RLS policies
  defined for exactly this purpose (`ledger_entries_isolation`,
  `vales_isolation` in `LINARA/architecture.md`).
- **Blocks:** Depends on gap #3 (Shifts) being resolved first — `useLedger`
  classifies entries using `schedules.weekFor(...)`, so migrating the
  ledger before shifts would mean building against a schema that's about
  to change again.
- **Current workaround:** None — fully local, resets on page reload.
- **To close:** After gap #3 is resolved: wire `record`/`request`/`decide`
  to real inserts/updates against `ledger_entries`/`vales`.

### 6. Quick Utos (`quick_utos`) is never actually written to, and the existing Realtime listener has a column-name bug

- **Found:** 2026-08-13, auditing `LINARA` Stories 11/13 against the live schema.
- **What's missing:** The AI classifier (`route-utos` edge function /
  `routeUtosFn`) is real and correctly wired — but its classified result
  only ever calls `LINARA/src/features/utos/hooks/use-utos.ts`'s local
  `send()`, never an insert into `quick_utos`. Separately, and independent
  of that gap: `LINARA/src/features/dashboard/components/app-store-provider.tsx`'s
  `quick-utos-channel` subscription reads `payload.new.helper_id` on
  `postgres_changes` INSERT, but the actual column (`LINARA/architecture.md`)
  is `recipient_id` — this listener will never fire correctly even after
  something starts writing real rows.
- **Blocks:** Nothing yet (no writer exists to trigger the listener bug),
  but it'll be a silent failure the moment gap is closed unless caught here.
- **Current workaround:** `quick-utos-channel`'s broadcast (not
  `postgres_changes`) path handles tab-to-tab sync today, which is why the
  bug hasn't been noticed — nothing exercises the DB-change path yet.
- **To close:** Wire `use-send-gate.ts`'s post-classification step to a
  real `quick_utos` insert, and fix `helper_id` -> `recipient_id` in the
  same change.

### 7. Appointments (`appointments`) is never actually written to, and prep-task creation has no server-side design yet

- **Found:** 2026-08-13, auditing `LINARA` Story 8/13 against the live schema.
- **What's missing:** `LINARA/src/features/appointments/hooks/use-appointments.ts`
  is local `useState`, taking the task board's `setTasks` as a direct
  dependency — adding an appointment synthesizes prep `Task` rows and
  pushes them straight into local board state. There is no separate
  "prep task" table; prep tasks are meant to become ordinary `tickets` rows
  (see gap #4), so closing this requires deciding how one client action
  becomes an atomic write across two tables (an `appointments` insert plus
  N `tickets` inserts), not just pointing the existing hook at Supabase.
- **Blocks:** Gap #4 (tickets) for the prep-task half specifically.
- **Current workaround:** None — fully local.
- **To close:** Needs the atomic-write design decision above, likely a
  `SECURITY DEFINER` RPC (same pattern as `claim_helper_invite`) that
  inserts the appointment and its prep tickets together.

### 8. Realtime channels relay tab-to-tab broadcasts only — the household filter is a hardcoded placeholder

- **Found:** 2026-08-13, auditing `LINARA` Story 13 against the live schema.
- **What's missing:** `household-board-channel`'s `postgres_changes` filter
  in `app-store-provider.tsx` is `household_id=eq.demo-household-id` — a
  literal string, not a real household's UUID. Since gaps #4-#6 above mean
  nothing writes to the filtered tables yet anyway, this hasn't caused a
  visible bug, but it means the filter itself needs replacing with the
  signed-in manager's real `session.householdId` before any of those gaps
  can be closed, not just the write side.
- **Blocks:** Gaps #4 and #6 once their write paths are built.
- **Current workaround:** N/A — broadcast (not `postgres_changes`) is what
  actually keeps tabs in sync today.
- **To close:** Replace the hardcoded literal with real session state when
  wiring up gap #4/#6.

### 9. CI never runs the test suite it claims to gate on

- **Found:** 2026-08-13, auditing why the RLS recursion bug (see Closed
  Gaps below) went unnoticed.
- **What's missing:** `LINARA/.github/workflows/ci.yml`'s `verify` job runs
  prettier/eslint/`tsc`/build only. `bun run test` (Vitest) and
  `bun run test:e2e` (Playwright) are fully configured
  (`LINARA/roadmap/Story_9_5_TestingFrameworkAndE2ESmokeSetup.md`) but never
  invoked in CI, despite that story's acceptance criteria #3 claiming "a
  pull request fails if any unit or smoke tests are broken."
- **Blocks:** Nothing structurally, but it's why gaps like #1-#8 and the
  Closed Gaps below can ship unnoticed for months.
- **Current workaround:** None — tests only run if someone remembers to run
  them locally.
- **To close:** Add `bun run test` and `bun run test:e2e` steps to the
  `verify` job.

---

## Closed Gaps

Fixed and applied to the live database. Kept here so neither repo
re-investigates something already resolved.

### C1. `user_profiles_isolation` (and every household_id policy copying its pattern) caused infinite recursion (Postgres 42P17)

- **Found:** 2026-08-12, while wiring `LINARA_MOBILE`'s storage RLS policy.
- **Root cause:** Every household_id isolation policy resolved "my
  household_id" via a raw subquery against `user_profiles` from inside a
  policy applied to `user_profiles` itself, re-triggering the same policy
  forever.
- **Fixed by:** `LINARA/supabase/fix-household-rls-recursion.sql` — a
  `SECURITY DEFINER` `current_household_id()` function that bypasses RLS
  for its own internal lookup. Also added missing isolation policies for
  `quick_utos`/`vales`/`ledger_entries`/`invite_flags` (SELECT only), which
  had RLS enabled but no policy at all. Applied and verified live.

### C2. The entire invite/claim handshake was non-functional under RLS

- **Found:** 2026-08-13, auditing why C1 was never caught, and tracing the
  invite/claim flow end to end.
- **Root cause (three separate bugs):** (1) `helper_profiles_isolation`
  gave anonymous callers no way to look up an invite by code — a claimant
  has no `auth.uid()`, so `current_household_id()` always resolves `NULL`
  for them. (2) `invite_flags` had no INSERT policy at all. (3) A brand-new
  helper's own first `user_profiles` INSERT hit a bootstrap deadlock:
  Postgres checks a `FOR ALL` policy's `USING` clause as `WITH CHECK` too,
  and that check needs an *existing* `user_profiles` row to resolve
  `current_household_id()` — which doesn't exist until this very insert
  completes.
- **Fixed by:** `LINARA/supabase/fix-claim-flow-rls-gaps.sql` — three
  `SECURITY DEFINER` RPCs (`lookup_pending_invite`, `flag_invite`,
  `claim_helper_invite`) replacing the direct table calls in
  `people.actions.ts`. Applied and verified live end-to-end.

### C3. No code path created a household's first manager account (the same bootstrap deadlock as C2, for managers)

- **Found:** 2026-08-13, while wiring the manager-side invite UI (which was
  separately found to be fully disconnected from the real backend — see the
  Phase 1 work in `LINARA`'s `people.actions.ts`/`use-session.ts`/
  `use-invites.ts` history for the fix, not a schema bug so no dedicated
  entry here).
- **Fixed by:** `LINARA/supabase/add-manager-bootstrap.sql` — a `households`
  table plus a `bootstrap_manager_household()` `SECURITY DEFINER` RPC
  (same pattern as C2's `claim_helper_invite`). Applied and verified live:
  real signup -> email confirmation -> login -> bootstrap -> invite ->
  real `helper_profiles` row persisted and RLS-scoped correctly.

---

## Template for New Entries

```markdown
### N. Short title of the mismatch

- **Found:** YYYY-MM-DD, while building `<repo>` Story `<N>` (`<what you were doing>`).
- **What's missing:** What the docs/roadmap describe vs. what the schema/code actually has. Cite files.
- **Blocks:** What future story or feature this will hit, if anything. Link the roadmap file if one exists.
- **Current workaround:** What you actually shipped instead, and where.
- **To close:** What a real fix would require, and which repo owns making it (schema changes are `LINARA`'s call per `AGENTS.md`).
```
