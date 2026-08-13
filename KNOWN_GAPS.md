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
  starting empty (the old `INITIAL_TASKS`/`INITIAL_ROUTINES` seed data was
  removed 2026-08-13 alongside Closed Gap C8's mock-roster rewrite, since it
  hardcoded helper ids that don't exist in a real household's
  `helper_profiles`).
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
- **Blocks:** Nothing now — Closed Gap C8 (2026-08-13) resolved the identity
  problem this entry originally flagged: `useLedger`/`useVales` now receive a
  real `currentHelperId` (a real `helper_profiles` UUID, the first ACTIVE
  helper) instead of the hardcoded mock string `"rosa"`. What's left is
  purely the insert wiring itself, described below.
- **Current workaround:** None — fully local, resets on page reload.
- **To close:** Wire `record`/`request`/`decide` to real inserts/updates
  against `ledger_entries`/`vales`.

### 6. Quick Utos (`quick_utos`) is never actually written to (listener column-name bug fixed 2026-08-13)

- **Found:** 2026-08-13, auditing `LINARA` Stories 11/13 against the live schema.
- **What's missing:** The AI classifier (`route-utos` edge function /
  `routeUtosFn`) is real and correctly wired — but its classified result
  only ever calls `LINARA/src/features/utos/hooks/use-utos.ts`'s local
  `send()`, never an insert into `quick_utos`.
- **Blocks:** Nothing now — no writer exists yet, but the `currentHelperId`
  identity problem this entry flagged is resolved as of Closed Gap C8
  (2026-08-13): `app-store-provider.tsx`'s `currentHelperId` is now a real
  `helper_profiles` UUID (the first ACTIVE helper), not the hardcoded mock
  string `"rosa"`, so the listener's `recipient_id === currentHelperId`
  comparison can now genuinely match a real `quick_utos` row once something
  inserts one.
- **Current workaround:** `quick-utos-channel`'s broadcast (not
  `postgres_changes`) path handles tab-to-tab sync today.
- **To close:** Wire `use-send-gate.ts`'s post-classification step to a
  real `quick_utos` insert.

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

### 8. `helper_notes.voice` is never populated -- mobile transcribes and discards raw audio instead of persisting it

- **Found:** 2026-08-13, while building `LINARA_MOBILE` Story 9 (Voice-to-Task
  Promoter & SOP Translator).
- **What's missing:** `plan.md` 5.1 and `helper_notes.voice`'s column comment
  ("Local URL path or pre-signed storage reference URL") both imply voice
  memos get a durable storage pointer. But the shared `household-evidence`
  bucket (`LINARA_MOBILE/supabase/storage-policies.sql`) only allows
  `['image/jpeg', 'image/png', 'audio/webm']`, and `expo-audio` (the mobile
  recorder) only ever produces AAC/M4A on both iOS and Android -- no mobile
  OS ships a native WebM encoder. The `audio/webm` assumption came from the
  web app's browser `MediaRecorder`, which mobile can't replicate without an
  extra transcode dependency.
- **Blocks:** Nothing yet -- `helper_notes.text` (the transcript) is the
  actually-consumed data; no feature depends on replaying the original audio.
- **Current workaround:** `LINARA_MOBILE`'s voice-to-task pipeline records
  locally, POSTs the audio to the `transcribe-notes` edge function for
  Whisper transcription, then deletes the local file. `helper_notes.voice`
  stays `NULL` for voice-originated notes; only the transcript is persisted.
- **To close:** Either (a) widen `household-evidence`'s `allowed_mime_types`
  to include the real mobile MIME type (`LINARA`-owned bucket policy change),
  or (b) add a client-side WebM transcode step in `LINARA_MOBILE` (extra
  dependency weight, likely not worth it unless audio playback is a real
  product requirement later).

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
  and that check needs an _existing_ `user_profiles` row to resolve
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

### C4. CI never ran the test suite it claimed to gate on

- **Found:** 2026-08-13, auditing why C1 went unnoticed for months.
- **Root cause:** `LINARA/.github/workflows/ci.yml`'s `verify` job ran
  prettier/eslint/`tsc`/build only. `bun run test` (Vitest) and
  `bun run test:e2e` (Playwright) were fully configured
  (`LINARA/roadmap/Story_9_5_TestingFrameworkAndE2ESmokeSetup.md`) but never
  invoked in CI, despite that story's acceptance criteria #3 claiming "a
  pull request fails if any unit or smoke tests are broken."
- **Fixed by:** Added Vitest + Playwright steps to `ci.yml`'s `verify` job
  (with a Playwright browser install step first). Also fixed
  `playwright.config.ts`'s `webServer.command`, which was hardcoded to
  `bun run dev` — CI installs via `npm ci`, not bun, so that command would
  have failed the moment it was actually invoked; changed to `npx vite dev`
  so it works under either package manager. Verified locally: both
  `npm run test` and `npm run test:e2e` pass.

### C5. Realtime board channel filtered on a hardcoded `demo-household-id` literal; quick_utos listener read a nonexistent `helper_id` column

- **Found:** 2026-08-13, auditing `LINARA` Story 13 against the live schema.
- **Root cause:** `household-board-channel`'s `postgres_changes` filter in
  `app-store-provider.tsx` was `household_id=eq.demo-household-id` — a
  literal string, not a real household's UUID, so it could never match a
  real row. Separately, `quick-utos-channel`'s listener checked
  `payload.new.helper_id`, but `quick_utos`'s actual FK column
  (`LINARA/architecture.md`) is `recipient_id`.
- **Fixed by:** The board channel's `postgres_changes` listener now only
  registers (with a real `household_id=eq.${session.householdId}` filter)
  once a manager is signed in; skipped entirely otherwise, since there's no
  real household to filter by yet. The quick_utos listener now reads
  `recipient_id`. Note this doesn't fully close gap #6 — see that entry for
  why the comparison still can't match real data until real helper auth
  exists — and it doesn't touch gap #4/#5/#7's core problem (nothing writes
  to `tickets`/`ledger_entries`/`vales`/`appointments` yet either), only the
  listener-side bugs.

### C6. `helper_profiles` couldn't represent the Shifts UI it was supposed to back

- **Found:** 2026-08-13, auditing `LINARA` Stories 8/9 against the live schema.
- **Root cause:** `helper_profiles` models one fixed shift window
  (`shift_start`/`shift_end`), one `daily_break_duration` (a duration, not a
  window), and exactly one `weekly_rest_day` per helper. The mock
  `useSchedules()`/`WeekSchedule` UI modeled something structurally richer:
  an independent `DaySchedule` per weekday, multiple `segments` per day
  (split shifts), and optional per-day `breakStart`/`breakEnd`. Checked
  `plan.md`: it only ever specifies "Shift Start/End, Weekly Rest Day" per
  helper, matching the schema exactly — the richer per-day/split-shift UI
  was prototype scope creep, not a product requirement.
- **Fixed by:** Simplified the Shifts feature (types, `use-schedules.ts`,
  `shifts-section.tsx`, `my-week-card.tsx`) down to one shift window + one
  rest day per helper, derived from the same `helper_profiles` fetch
  `useInvites` already does for the People roster (no second Supabase
  round-trip) and writable via a new `updateHelperScheduleFn`. One thing
  plan.md _does_ require that the schema didn't support: its After-Hours
  Friction Gating section lists "on a break" as a friction trigger, which
  needs a real break _window_ (not just a duration) to know when during the
  day it happens — `LINARA/supabase/add-shift-break-columns.sql` adds
  `break_start`/`break_end` (one window per helper, same simplification) so
  the Ledger's `rest_break` classification and Availability's on-shift
  check keep working exactly as before, just reshaped. Applied and verified
  live: a real `helper_profiles` UPDATE (shift/rest-day/break) persists and
  survives a fresh, independent read.
- **Known residual limitation, not closed by this fix:** Both `use-ledger.ts`
  and `use-availability.ts` are still hardcoded to look up the schedule for
  `"rosa"` (the mock first-class-device persona) rather than a real signed-in
  helper's id, so `schedules.scheduleFor("rosa")` resolves to `undefined`
  against real data until real helper auth exists. Both hooks and
  `MyWeekCard` handle that `undefined` case gracefully (no crash, no
  incorrect classification), but this is real, separate, larger scope.

### C7. `house_sops` had columns for structured SOPs but no manager-facing flow that wrote to them

- **Found:** 2026-08-13, while building `LINARA_MOBILE` Story 7 (Today tab
  SOP carousel). Schema half (columns) closed same day by
  `LINARA/supabase/add-house-sops-columns.sql`.
- **Root cause:** The AI SOP Creator edge function (`generate-sop`, web
  Story 10) already returned a structured `HouseStandardSOP` — `title`,
  `description`, `station`, `steps: string[]`, `toolsRequired: string[]`,
  `safetyProtocol` — see `LINARA/src/features/tasks/task.actions.ts`'s
  `generateSopFn`. `NewRoutineModal`'s "Generate SOP with AI" button called
  it, but only flattened the result into a local `note` string for the
  (still-local-only) Routine mock — nothing ever inserted the structured
  result into `house_sops`.
- **Fixed by:** `insertHouseSopFn` in `task.actions.ts` — an authed insert
  following the same pattern as `people.actions.ts`'s `inviteHelperFn`
  (verify token → look up caller's `user_profiles` row for `household_id` +
  manager role → insert). `NewRoutineModal` now keeps the generated
  `HouseStandardSOP` object in state (not just the flattened note string)
  and shows a "Save to Library" action once a manager is signed in; editing
  the title or note afterward invalidates the preview so a manager can't
  save stale data that no longer matches what's on screen.
  `RoutinesView`/`ManagerSchedulePage` thread `session.token` down to power
  it. Note this does not add a dedicated "House Standards Library" list/browse
  page — `plan.md` doesn't describe one, and the manager-facing surface it
  does describe (the SOP generator inside routine creation) is what this
  wires up.
- **Verification:** `tsc --noEmit`, `eslint` on touched files, and the
  existing Vitest suite all pass. Not yet verified against a live signed-in
  manager session end-to-end (no test harness for that flow exists yet) —
  the RLS insert path mirrors `inviteHelperFn`'s already-verified pattern.
- **Known residual limitation, not closed by this fix:** `house_sops` rows
  aren't linked back to anything — `Routine`/`Task` have no `sopId` field
  and nothing writes to `tickets` yet either (gap #4), so a saved SOP
  doesn't yet show up anywhere in this app's own UI after saving; it exists
  purely so `LINARA_MOBILE` (gap consumer) can read real structured data.
  `LINARA_MOBILE`'s `lib/sop.ts` workaround (splitting `description` on
  newlines) hasn't been updated to prefer the new `steps` column — that's a
  separate `LINARA_MOBILE`-side change, not made this session.

### C8. The entire web app read helper identity from a hardcoded 3-person mock roster, disconnected from real `helper_profiles`

- **Found:** 2026-08-13, while scoping gap #5 (Ledger/Vales real inserts).
  `ledger_entries.helper_id`/`vales.helper_id` are `NOT NULL` foreign keys
  into `helper_profiles`, but `useLedger`/`useVales`/`useUtos` all keyed off
  `currentHelperId = "rosa"` (`app-store-provider.tsx`) and a hardcoded
  `HELPERS: Helper[]` constant (`people.constants.ts`, ids `"rosa"`/
  `"manuel"`/`"lita"`) — not a real UUID, so a literal insert would have
  failed the FK constraint outright. Tracing every usage (18 files) showed
  the mock roster was load-bearing well beyond Ledger/Vales: Pass board's
  "Line" view lanes (`manager-pass-tab.tsx`), Routines/Tasks/Appointments
  assignment dropdowns, every board card's helper lookup, and seed demo data
  (`task.constants.ts`'s `INITIAL_TASKS`/`INITIAL_ROUTINES`,
  `appointment.constants.ts`'s `SEED_PREP`/`INITIAL_PREP_TASKS`) all
  hardcoded against the same three fake ids.
- **Root cause:** The mock roster predates any real `helper_profiles` data
  existing at all (this whole app was a local-only prototype originally).
  Once People/Shifts started reading real `helper_profiles` rows (via
  `useInvites`), nothing else in the app was ever migrated off the parallel
  mock — the two data sources coexisted, with most of the UI still on the
  fake one.
- **Fixed by:** `people.utils.ts` gained `toHelper(row: HelperProfileRow):
  Helper` (mapping a real row to the display-shaped `Helper` type) and
  `findHelper(id, helpers)` (an id → `Helper` lookup with an "Unknown
  helper" fallback instead of the old lookup's non-null assertion, since a
  miss is now a real possibility — e.g. a deleted profile — not just a
  programmer error). `HELPERS`/`helperById` are deleted. `AppStores` gained
  `helpers: Helper[]` (every real row, any status, for lookups) and
  `activeHelpers: Helper[]` (`status === "ACTIVE"` only, for assignment
  dropdowns and lane rendering); `helper: Helper` became `helper: Helper |
  null` — the first ACTIVE helper stands in for "the one with a first-class
  device" (still no real per-helper auth session — that's separate, larger
  scope, same as this file's older "gap #3" note). `currentHelperId`
  (`app-store-provider.tsx`) is now that helper's real UUID, or `null`.
  `useLedger`/`useAvailability`/`useUtos`/`useTaskBoard`/`useAppointments`
  all take real data as parameters instead of importing the mock. Every
  consuming component (~18 files: Pass board lanes, Routines/Tasks/
  Appointments modals and dropdowns, board/suggestion/vale cards, the
  helper's own Worker's Station shell) was updated to source helper data
  from real `helper_profiles` via props threaded from whichever ancestor
  already calls `useAppStores()`, matching the prop-driven pattern already
  used elsewhere in this codebase (no new context dependencies added to leaf
  components). Pages that render a `Helper`-typed value with no sensible
  empty-state fallback (`PayRecordPage`, `HelperShell`, `HelperTodayPage`)
  gate on `helper` being non-null and show a placeholder instead; everywhere
  else a null `helper` degrades to a fallback display string ("your
  helper"). Appointment templates (`EVENT_TEMPLATES`) now key prep rows by
  `station` instead of a specific helper id, resolved to a real active
  helper when a template is applied — station-based templates are portable
  across households, unlike ones hardcoded to specific named people. The
  seed demo data that couldn't be reshaped this way (`INITIAL_TASKS`/
  `INITIAL_ROUTINES`/`INITIAL_PREP_TASKS`/the one seeded `INITIAL_APPOINTMENTS`
  row) was deleted outright rather than left dangling — a fresh household's
  board/routines/appointments now start empty, same as People/Shifts already
  did with no seed data of their own.
- **Verification:** `tsc --noEmit`, `eslint` (project-wide — only
  pre-existing warnings unrelated to this change remain), the Vitest suite,
  and a full `vite build` (SSR + client) all pass clean.
- **Known residual limitation, not closed by this fix:** This closes the
  *identity* half of gaps #5 and #6 (a real helper id now exists to write),
  not the *insert* half — `ledger_entries`/`vales`/`quick_utos` still have no
  writer; see those entries. There is still no real per-helper auth session
  (the "first ACTIVE helper" stand-in is a simplification, same posture as
  the residual limitation already noted on C6) — until that exists, a
  household with more than one ACTIVE helper will have every helper-scoped
  feature (Ledger, Availability, Quick Utos, the Worker's Station) act on
  whichever helper happens to be first, not a specific signed-in one.

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
