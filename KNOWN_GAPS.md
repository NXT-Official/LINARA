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

### O1. No documented split between Vercel env vars and Supabase Edge Function secrets

- **Found:** 2026-08-14, while helping deploy `LINARA` to Vercel.
- **Gap:** README.md §10.2/§12 and ARCHITECTURE.md §11 only document a single
  local `.env` file. In production there are actually two independent
  secret stores that never see each other's values: (1) **Vercel**, which
  builds the client bundle (`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`USE_MOCK_AI`
  are compiled in via the `define` block in `vite.config.ts`) and runs the
  Nitro server functions (`XENDIT_SECRET_WRITE_KEY`, `XENDIT_API_URL`,
  `REGIONAL_MINIMUM_WAGE` read at runtime via `process.env` in
  `pay.actions.ts`/`people.actions.ts`); and (2) **Supabase Edge
  Functions**, which read their own env via `Deno.env.get()` and need
  secrets set separately with `supabase secrets set` or the Dashboard
  (`OPENAI_API_KEY`, a second independent `USE_MOCK_AI`, optional
  `*_MODEL` overrides, `XENDIT_WEBHOOK_VERIFICATION_TOKEN`). Nothing in the
  docs says this, so it's easy to fill in Vercel's env vars, see the AI
  features silently fail (edge functions 500 with no `OPENAI_API_KEY`), and
  not know where to look.
- **Also noted:** `JWT_SECRET`/`SYSTEM_CRON_SECRET` are listed in
  `.env.example`/README as required but no code currently reads either one
  (`Deno.env.get`/`process.env` grep across `src/` and
  `supabase/functions/` turns up nothing) — likely placeholders for the
  not-yet-built midnight Quick-Utos purge cron from `plan.md` §3.3.
- **Workaround:** none needed to function — just know Vercel and Supabase
  secrets are configured independently. Not yet fixed by writing this down
  in README/ARCHITECTURE.md itself.
- **Current production decision (2026-08-14):** deploying with
  `USE_MOCK_AI=true` on the Supabase Edge Functions — no live LLM provider
  wired up yet, so `OPENAI_API_KEY` is intentionally unset. The
  `Deno.env.get("OPENAI_API_KEY")` calls in `generate-sop`, `parse-scheduler`,
  `route-utos`, `simplify-sop`, and `promote-voice-task` are provider-specific
  (OpenAI chat-completions shape) and will need rewriting, not just a secret
  swap, if/when a real provider is picked — see `linara_ai_provider_decision`
  memory for the live-migration options under consideration (OpenAI vs.
  Claude API) and the constraint that `transcribe-notes` (Whisper) has no
  Claude equivalent and would stay on a separate provider regardless.

### O2. `currentHelperId` (`activeHelpers[0]`) is a single, unstable stand-in for "the helper" across most helper-scoped features -- breaks down for 2+ active helpers

- **Found:** 2026-08-14, user asked what could go wrong with a large number
  of helpers, prompted by that day's `/helper` surface removal (Closed Gap
  C26). Full design writeup, per-area status, and the reusable fix pattern
  now live in [`MULTI_HELPER_HANDLING.md`](MULTI_HELPER_HANDLING.md) --
  this entry is a pointer, not a duplicate, matching how `aiagent.md` holds
  full prompt detail while this file only points at it.
- **Gap:** `currentHelperId` (`app-store-provider.tsx`) is `activeHelpers[0]`,
  ordered `created_at DESC` by `listHelperProfilesFn` -- the most recently
  invited active helper, not a manager's actual choice, and it silently
  changes as new helpers claim their accounts. Quick Utos, the after-hours
  Ledger, the Availability friction wall, and the Pay Dial all keyed off
  this one value.
- **Partially closed, same day:** Quick Utos and the Ledger write it drives
  are fixed -- a real recipient picker, AI `suggestedStation` surfaced
  (never auto-applied) via a toast, `ledger.record` follows the utos's own
  `toHelperId`. The friction wall (`use-send-gate.ts`) is generalized via a
  new `statusFor(helperId, schedules, nowTs)` (`availability.utils.ts`),
  which also fixed a pre-existing bug in `addTask` (assigning a task to any
  helper other than `currentHelperId` silently skipped the off-shift warning
  entirely, live, before this fix -- not new scope, a bug this same
  generalization happened to close).
- **Still open:** the Pay Dial/payslip history (Money tab) still only shows
  `currentHelperId`'s numbers -- no per-helper switcher exists there yet.
  Also surfaced, unresolved: `useAvailability`'s manual "Available for N
  hours" opt-in is `localStorage`-only (never real, cross-app data), and its
  only UI control was deleted along with the vestigial `/helper` surface in
  C26 -- it's now permanently unreachable. Whether `LINARA_MOBILE` has a
  real equivalent is unverified. See `MULTI_HELPER_HANDLING.md` §2 for both.
- **To close:** a Pay Dial helper switcher (same shape as the Quick Utos
  picker -- `activeHelpers`, a selected id); and a `LINARA_MOBILE`-side
  investigation into whether a real per-helper availability toggle already
  exists there before deciding whether to rebuild, remove, or leave the
  web app's `statusFor` schedule-only answer as the permanent source of
  truth for anyone but the browser's own tracked helper.

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
  _identity_ half of gaps #5 and #6 (a real helper id now exists to write),
  not the _insert_ half — `ledger_entries`/`vales`/`quick_utos` still have no
  writer; see those entries. There is still no real per-helper auth session
  (the "first ACTIVE helper" stand-in is a simplification, same posture as
  the residual limitation already noted on C6) — until that exists, a
  household with more than one ACTIVE helper will have every helper-scoped
  feature (Ledger, Availability, Quick Utos, the Worker's Station) act on
  whichever helper happens to be first, not a specific signed-in one.

### C9. Vales (`vales`) was never actually written to (Vales half of former gap #5)

- **Found/Fixed:** 2026-08-13, same session as C8. Unlike `ledger_entries`
  (see C10), `ValeRequest { id, helperId, amount, reason, status }` maps
  onto the `vales` table almost exactly — no mapping decisions needed, so
  this half was safe to close immediately.
- **Fixed by:** New `LINARA/src/features/ledger/ledger.actions.ts` —
  `listValesFn` (authed select, scoped by `vales_isolation`'s join through
  `helper_profiles`, same pattern as `listHelperProfilesFn`), `insertValeFn`
  (authed insert; no extra role check beyond what RLS already enforces,
  since either a manager or a claimed helper's own token may legitimately
  request one), and `decideValeFn` (authed update, gated to
  `primary_manager`/`co_manager` — same guard pattern as `inviteHelperFn`,
  since approving/declining is a manager-only action). `use-vales.ts` now
  fetches on mount/token-change and refetches after every write, matching
  `useSchedules`' "write, then pull the fresh row back" convention. Errors
  are caught and toasted inside the hook itself rather than left to
  callers, since both `ValeRequestModal` and the approve/decline buttons in
  `NeedsYou` call `request`/`decide` as plain fire-and-forget handlers with
  no `await` — matching the UX they already had as pure local state.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. Not yet verified against a live signed-in
  session end-to-end.
- **Known residual limitation, not closed by this fix:** This web app has
  no functioning helper-auth session — `useSession` (`use-session.ts`) is
  manager-only, and `claim-account-flow.tsx` writes a `linara_helper_token`
  to `localStorage` on claim that nothing anywhere reads back (a
  pre-existing dead code path, not introduced by this fix). So
  `vales.request()`, even though it's rendered on the vestigial helper-facing
  `PayRecordPage` (see AGENTS.md — the real Worker's Station lives in
  `LINARA_MOBILE`), always authenticates with whatever session token
  `AppStoreProvider` carries — today, always a manager's. RLS permits this
  (household-scoped, not caller-identity-scoped), but it means a request
  submitted from this web app is never really "the helper's own" the way a
  request from `LINARA_MOBILE` (which owns real helper auth) would be.

### C10. Ledger (`ledger_entries`) was never actually written to (Ledger half of former gap #5)

- **Found:** 2026-08-13, while scoping the Ledger half of gap #5 after C8/C9
  closed the identity problem and Vales respectively. Unlike Vales, the
  client `LedgerEntry` type and the `ledger_entries` table had three real
  mismatches, scoped with the user before writing any code:
  1. `AfterHoursLedger` displays each entry's `title` and a `kind === "utos"`
     badge, but the table had no columns for either — only
     `associated_ticket_id`, useless until gap #4 (`tickets`) is real.
  2. Client `reason` (5 values) vs. table `source_type` (4 values, CHECK
     constraint) — `available`/`override` had no matching value.
  3. Client `resolution` (always set) vs. table `resolved: boolean` +
     nullable `resolution_type` — "resolved" has no defined product meaning
     anywhere in `plan.md`/`architecture.md`.
- **Decisions (user-confirmed):** (1) add the missing columns rather than
  wait on gap #4 or drop the fields — a ledger entry is a historical record,
  so denormalizing `title`/`kind` onto the row is arguably the _correct_
  design regardless of tickets, not just a stopgap: a live join to a
  (someday-editable) ticket title would let history drift, where a snapshot
  won't. `station`/`appointment_title` were **not** added — nothing in
  `AfterHoursLedger` actually renders them today, so there was nothing to
  denormalize yet. (2) `available`/`override` both collapse to
  `source_type = "overtime"`. (3) "resolved" is treated as a no-op:
  every insert sets `resolved = true` immediately, matching the UI's total
  lack of an unresolved state.
- **Fixed by:** `LINARA/supabase/add-ledger-entry-context-columns.sql` adds
  `title`, `kind`, and `adjust_minutes` (duration_minutes is read as the
  auto-computed base; adjust_minutes holds a manager's manual delta on top,
  matching `LedgerEntry.autoMinutes`/`.adjustMinutes`). `ledger.actions.ts`
  gained `listLedgerEntriesFn`/`insertLedgerEntryFn`/`updateLedgerEntryFn`
  plus the reason↔source_type and resolution↔resolution_type mapping
  tables (the reverse `source_type -> reason` mapping is lossy for
  `"overtime"` — both `available` and `override` collapse to it, so a
  reloaded entry can't tell them apart again; `"override"` was picked as
  the reverse value since both already render the same generic "After
  shift" badge via `reasonLabel()`). `doneTsIso` is passed explicitly on
  insert rather than left to the DB's `NOW()` default, since the app clock
  can run on a simulated offset (`use-sim-clock.ts`) that may not match the
  server's real time; `startTs` isn't stored at all — it's reconstructed on
  read as `created_at - duration_minutes` (exact, since duration_minutes is
  literally that difference at insert time). `use-ledger.ts` now fetches on
  mount/token-change and refetches after `record()`/`updateEntry()`, same
  "write then refresh" pattern as C9; errors are caught and toasted inside
  the hook for the same fire-and-forget-caller reason as C9.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. The migration has been applied to the live
  Supabase project (confirmed 2026-08-13). Not yet verified against a live
  signed-in session end-to-end.
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9 — `record()` always writes as whatever session token
  `AppStoreProvider` carries (today, always a manager's), not a genuinely
  separate helper identity. And per the decision above, a reloaded entry's
  `reason` can no longer distinguish "available" from "override" — both
  read back as `override`.

### C11. Quick Utos (`quick_utos`) was never actually written to (former gap #6)

- **Found:** 2026-08-13, auditing `LINARA` Stories 11/13 against the live
  schema. The AI classifier (`route-utos` edge function / `routeUtosFn`) was
  real and correctly wired, but its classified result only ever called
  `use-utos.ts`'s local `send()`, never an insert into `quick_utos`. The
  `currentHelperId` identity blocker this entry originally flagged was
  resolved by C8; `QuickUtos { id, content, from, to, timestamp, ackState,
afterHours, emergency, waiting }` turned out to map onto the table almost
  exactly (same as Vales, not like Ledger) — no mapping decisions needed.
- **Also found while closing this:** `use-send-gate.ts` — the layer between
  the send UI and `useUtos.send()` — had two more hardcoded `"rosa"`
  literals (`routeUtosFn`'s `helperId` param, and the off-shift task-gating
  check) that C8's file-by-file rewire missed, since that earlier pass
  grepped for `HELPERS`/`helperById` and this file used neither — it just
  hardcoded the literal string inline. Fixed alongside this gap: `useSendGate`
  now takes `currentHelperId: string | null` from its callers
  (`manager-schedule-page.tsx`/`manager-pass-page.tsx`, both already have
  `helper?.id` from C8's context additions).
- **Fixed by:** `utos.actions.ts` gained `listUtosFn`/`insertUtoFn`/
  `ackUtoFn`/`clearUtosForHelperFn`. `clearUtosForHelperFn` is a real
  `DELETE`, not a soft-clear — `utos.types.ts`'s own doc comment already
  said quick utos are "deliberately ephemeral... `clearForNewDay` genuinely
  deletes them," so this matches existing documented intent rather than
  introducing new behavior. `use-utos.ts` now fetches on mount/token-change
  and refetches after every write, same pattern as C9/C10 — **but this one
  also removes** the old broadcast-based `onAction`/`receiveAction`
  plumbing entirely, rather than layering real writes underneath it. Reason:
  once `send()` genuinely inserts a row, the sender's own optimistic local
  copy (a fake `u${Date.now()}` id) and the row Postgres Realtime delivers
  back (the real id) are not recognizable as the same entry — they'd both
  render, showing every sent utos twice on the sending device. Removing the
  broadcast path and relying solely on `write → refetch` (for the sender)
  plus a broadened Realtime listener (for everyone else) avoids this by
  construction. The `quick-utos-channel` listener in
  `app-store-provider.tsx` changed from `event: "INSERT"` (hand-reconstructing
  a `QuickUtos` from the raw payload, and comparing `recipient_id` client-side)
  to `event: "*"` with a server-side `recipient_id=eq.${currentHelperId}`
  filter that just triggers `utos.refresh()` — simpler, and now also catches
  `ack()`/`clearForNewDay()` changes, which the old INSERT-only listener
  never covered regardless of broadcast.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. Not yet verified against a live signed-in
  session end-to-end.
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9/C10 — sends/acks always authenticate as whatever session
  token `AppStoreProvider` carries (today, always a manager's).

### C12. Pass board (`tickets`) was never actually written to (former gap #4)

- **Found:** 2026-08-13, auditing `LINARA` Stories 8/13/14 against the live
  schema. `use-task-board.ts` was pure local `useState`; the offline queue
  only replayed into that same local state; the `household-board-channel`
  Realtime subscription logged incoming `postgres_changes` on `tickets` but
  never applied them. No code path anywhere inserted, updated, or read a
  real `tickets` row.
- **Decisions (user-confirmed before writing code, same as C10's approach):**
  1. **Field mapping** — denormalize every client `Task` field with no table
     equivalent directly onto `tickets` (`block_reason`, `emergency`,
     `suggested`, `queued`, `queued_for_shift`, `recurrence`, `routine_id`,
     `appointment_id`, `appointment_title`, `lead_minutes`,
     `reschedule_notice` — see `supabase/add-ticket-board-columns.sql`),
     same reasoning as C10's `title`/`kind` on `ledger_entries`. `station`
     and `scheduled_date` were deliberately _not_ added: `station` was
     already always derived live from the assigned helper at every call
     site (never independently set, confirmed by tracing every mutator), so
     a column would only reintroduce a staleness bug that behavior never
     actually had; `scheduled_date` is just the date component of the new
     `scheduled_start` timestamp, extracted client-side for
     appointment-linked tickets only.
  2. **Realtime** — `household-board-channel`'s `postgres_changes` listener
     now triggers a plain refetch on any event, mirroring Closed Gap C11's
     `quick-utos-channel` fix exactly. The old broadcast-based
     `board-action` tab-sync channel (`onAction`/`receiveAction` in
     `use-task-board.ts`) is removed entirely, for the same reason C11
     dropped quick utos' broadcast path: once writes are real, keeping both
     an optimistic local copy and a Realtime-delivered copy risks the same
     edit being applied twice.
  3. **Routines** — `Routine` templates stay local-only `useState` (no real
     `routines` table this pass); only the _spawned_ `Task` instances become
     real `tickets` rows, carrying `routine_id` as plain TEXT provenance
     (not a FK, since there's nothing to reference yet).
  4. **Appointments overlap** — also partially resolved gap #7's prep-task
     half: `useAppointments`' `add`/`remove`/`update` now write real
     `tickets` rows for prep tasks (via new `insertPrepTicketsFn`/
     `deleteTicketsByAppointmentFn`/`rescheduleAppointmentTicketsFn`), since
     leaving them as local-only `setTasks` injections would make them vanish
     the next time anything else triggered the board's refetch. The
     `appointments` calendar-event table itself, and an atomic RPC across
     both tables, stay open — see gap #7's narrowed writeup.
- **Fixed by:** `supabase/add-ticket-board-columns.sql` (11 new columns +
  1 index, decisions above). `LINARA/src/features/tasks/task.actions.ts`
  gained `listTicketsFn`/`insertTicketFn`/`updateTicketFn`/`deleteTicketFn`/
  `openQueuedTicketsFn` (bulk-clears `queued` when the board reopens) plus
  three appointment-prep bulk functions. `use-task-board.ts` was rewritten
  end to end: `tasks` is now server-fetched state (`listTicketsFn`, filtered
  to `status != 'done' OR scheduled_start >= <today>` — see below), every
  mutator (`addTask`/`updateStatus`/`blockTask`/`rescheduleTask`/
  `approveSuggestion`/`dismissSuggestion`/`setClosed`) writes through and
  refetches, same "write then refresh" pattern as C9/C10/C11.
  `startNewDay` no longer filters/keeps/drops tasks in local memory — that
  job moved into `listTicketsFn`'s query itself (see below) — it now only
  advances `simDate` and inserts fresh `tickets` rows for routines matching
  the new weekday that don't already have a live instance. The offline queue
  (`lib/offline-queue.ts`) is unchanged; `app-store-provider.tsx`'s
  `syncOfflineQueue` now replays a queued status change by calling the real
  `board.updateStatus()` (which takes the online write-then-refetch path
  once back online) instead of hand-patching local state and manually
  clearing `pendingSync` — the refetch does that for free, since a
  server-fetched `Task` never has a `pendingSync` field to begin with.
  `use-appointments.ts` and `app-store-provider.tsx`'s Realtime/offline
  wiring were updated to match, per decisions 2 and 4 above.
- **Deliberate behavior change (not a regression):** the old local-only
  `startNewDay` silently dropped any unfinished one-off task (no
  `routineId`/`appointmentId`) the moment the simulated day rolled, even if
  it was still `todo` or `blocked`. `listTicketsFn`'s filter no longer does
  this — any not-done ticket stays visible regardless of age; only _done_
  tickets roll off the board once their day passes. Silently losing track of
  unfinished work seemed like the wrong default once the data is real and
  persistent rather than a discardable in-memory array.
- **Verification:** `tsc --noEmit`, `eslint` (project-wide — only
  pre-existing warnings unrelated to this change remain), the Vitest suite,
  and a full `vite build` all pass clean. This session had no service-role
  key or database connection string available (only `SUPABASE_ANON_KEY` in
  `.env`), so `supabase/add-ticket-board-columns.sql` was applied by the user
  directly (e.g. via the Supabase Studio SQL editor) rather than by this
  session — confirmed live 2026-08-13 with an unauthenticated PostgREST
  `select` naming all 11 new columns against the real `tickets` table
  (`GET .../rest/v1/tickets?select=id,block_reason,emergency,...`): a
  `200 []` response, not PostgREST's "column does not exist" 400, which
  confirms column existence independent of RLS row-filtering. Not yet
  verified against a live signed-in session end-to-end, same posture as
  C9–C11.
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9–C11 — writes always authenticate as whatever session token
  `AppStoreProvider` carries (today, always a manager's). `boardClosed` (the
  household's "is the board closed for the night" toggle) stays local-only
  UI state, not persisted anywhere — only the per-ticket `queued` flag it
  drives is real now, so a page refresh resets the toggle's visible state
  (though queued tickets themselves stay correctly queued). Real photo
  upload is still a mock (`next-task-card.tsx`'s `PHOTO_POOL` random-pick
  stand-in) — `photo_evidence_url` now persists whatever string that mock
  produces, but nothing uploads an actual photo file anywhere. Gap #7's
  `appointments` table and atomic-write RPC remain open, narrowed per above.

### C13. Grocery petty-cash budget had no shared column, and `LINARA`'s web-side Palengke checklist duplicated helper-only execution work that belongs to `LINARA_MOBILE` (former gap #2)

- **Found:** 2026-08-13, while building `LINARA_MOBILE` Story 8. **Rescoped:**
  2026-08-13, revisiting after Closed Gap C12 made `tickets` real — auditing
  what `LINARA` actually does with groceries turned up a bigger problem than
  the original gap text: `LINARA`'s `PalengkeInlineList`/`GroceryModal`
  (check off items, enter cost, attach a mock receipt) were reachable from
  this repo's vestigial helper-facing surface (`next-task-card.tsx`), fully
  duplicating shopping-execution actions `LINARA_MOBILE` already performs
  for real — against `AGENTS.md`'s explicit division (helper work lives
  exclusively in `LINARA_MOBILE`). Worse: the _manager_-facing Pantry page
  (`GrocerySection`) had the exact same interactive toggle/cost/receipt UI,
  and the manager Money tab's Spend Dial (`use-grocery-list.ts`) was pure
  local `useState` — meaning a manager's "₱1,120 of ₱1,500 spent" reading
  was never connected to `LINARA_MOBILE`'s real `grocery_items` writes at
  all, even though those real purchases were genuinely happening.
- **Decisions (user-confirmed before writing code):**
  1. Remove the interactive checklist (toggle bought / enter cost / attach
     receipt) from `LINARA` entirely, on both the vestigial helper surface
     and the manager Pantry page — not just leave it inert. Shopping
     execution is `LINARA_MOBILE`'s job; `LINARA` should only curate the
     planned list (add/remove not-yet-bought items) and observe real state.
  2. The manager's Spend Dial should read real `grocery_items` data instead
     of local state, in scope for this pass (not deferred).
  3. Petty-cash budget: one household-level default (not per-run — neither
     app models a "run" as a discrete entity to hang a per-run amount off
     of), manager-writable from `LINARA`, read by both apps.
- **Fixed by:**
  - `supabase/add-household-petty-cash-budget.sql` adds
    `households.petty_cash_budget` (default 1500) plus a household-scoped
    `UPDATE` policy (`households` previously had none at all beyond its
    bootstrap `INSERT`, since only `bootstrap_manager_household()` wrote to
    it before).
  - New `src/features/groceries/grocery.actions.ts`: `listGroceryItemsFn`
    (real read of `grocery_items`), `insertGroceryItemFn`/`deleteGroceryItemFn`
    (list curation only — always `bought: false`, never touches `bought`/
    `actual_cost`), `getHouseholdBudgetFn`/`updateHouseholdBudgetFn` (the
    latter manager-only, same role-check pattern as `insertHouseSopFn`/
    `decideValeFn` — `households`' RLS is household-scoped only, not
    role-aware, matching how every other role restriction in this app is
    enforced in the server function rather than in the policy).
  - `use-grocery-list.ts` rewritten to fetch on mount/token-change and
    refetch after every write, same "write then refresh" pattern as
    C9–C12. `receiptPhoto` is **not** fetched by this hook at all — it's
    threaded in from `app-store-provider.tsx` as
    `board.tasks.find(isPalengke)?.photo`, since a receipt lives on
    `tickets.photo_evidence_url` (already real via C12), not on any
    `grocery_items` row.
  - `toggleBought`/`setCost`/`attachReceipt`/`clearReceipt`/`openModal`
    removed from `GroceryContextValue` entirely. Deleted:
    `grocery-modal.tsx`, `palengke-inline-list.tsx` (the vestigial
    execution UI), `todays-spend-dial.tsx` and `grocery.constants.ts`
    (both already-dead code, confirmed zero importers before deleting).
    `grocery-row.tsx`/`receipt-slot.tsx` simplified to read-only display.
    `grocery-section.tsx` keeps only the add-item form and budget input as
    real writes. `palengke-chip.tsx` now `Link`s to `/manager/pantry` (or
    `/helper/pantry`, via a new `to` prop) instead of opening the removed
    modal.
  - Small related fix: `board-task-card.tsx` (the manager board's actual
    "Done" card) never rendered `task.photo` at all — only `task-card.tsx`
    (used solely for the "queued for tomorrow" list) did. Added a
    toggleable photo view to `board-task-card.tsx` too, since plan.md 3.2
    explicitly describes the manager viewing the receipt "directly on the
    Done card."
- **Verification:** `tsc --noEmit`, `eslint` (project-wide — only the same
  pre-existing warning noted in C12 remains), the Vitest suite, and a full
  `vite build` all pass clean. `supabase/add-household-petty-cash-budget.sql`
  was applied by the user directly (same no-service-role-key posture as
  C12) — confirmed live 2026-08-13 with an unauthenticated PostgREST
  `select id,petty_cash_budget` against the real `households` table: a
  `200 []` response, not a "column does not exist" 400. Not yet verified
  against a live signed-in session end-to-end.
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9–C12 applies to `insertGroceryItemFn`/`deleteGroceryItemFn`/
  `updateHouseholdBudgetFn`.
- **`LINARA_MOBILE` half closed:** 2026-08-14 — `use-palengke-budget.ts` now
  reads `households.petty_cash_budget` directly (real, read-only; its old
  AsyncStorage-backed value could silently disagree with the manager's real
  allocation). `services/api/household.ts` added; `BudgetBar`'s tap-to-edit
  affordance is now conditional on an `onChangeBudget` prop, which mobile's
  Pantry screen no longer passes — the budget stays manager-only, set from
  the web dashboard, matching the migration's own "LINARA (manager-writable)
  and LINARA_MOBILE (read-only)" comment.

### C14. Appointments (`appointments`) was never actually written to (former gap #7)

- **Found:** 2026-08-13, auditing `LINARA` Story 8/13 against the live
  schema. **Narrowed:** 2026-08-13, closing gap #4 (Closed Gap C12), which
  made prep tickets real but left `appointments` itself local-only and the
  two writes non-atomic.
- **Decisions (user-confirmed before writing code):**
  1. Atomic treatment for all three operations (create/reschedule/remove),
     not just create — an inconsistent reschedule or delete is just as
     broken as an inconsistent create.
  2. Record which `EVENT_TEMPLATES` recipe an appointment was created from
     (`appointments.recipe_type`, a column that already existed but nothing
     wrote to) — `NULL` for a manually-built or AI-scheduled one.
- **Fixed by:** `supabase/add-appointment-atomic-writes.sql`:
  1. Upgrades `tickets.appointment_id` from the plain TEXT provenance column
     C12 added (back when `appointments` had no rows to reference at all) to
     a real `UUID REFERENCES public.appointments(id) ON DELETE CASCADE`.
  2. Three `SECURITY DEFINER` RPCs, manager-only (same role-check pattern as
     `insertHouseSopFn`/`decideValeFn`/`updateHouseholdBudgetFn` — enforced
     in the function body, not RLS, matching every other role restriction in
     this app): `create_appointment_with_preps` (inserts the appointment +
     every prep ticket in one transaction), `reschedule_appointment_with_preps`
     (updates the appointment + every prep ticket's `scheduled_start`/
     `appointment_title`/`reschedule_notice` in one transaction), and
     `delete_appointment_with_preps` (deletes the appointment; `ON DELETE
CASCADE` handles its prep tickets, no separate ticket-delete needed).
  3. `reschedule_appointment_with_preps` takes pre-computed per-ticket
     updates from its caller rather than formatting dates in SQL — the old
     `oldTime`/`oldDate` `reschedule_notice` fields still go through
     `isoToDisplayTime`/`isoToISODate` in TypeScript (`appointment.actions.ts`),
     which the RPC just writes verbatim. A ticket whose time didn't move
     omits the `reschedule_notice` key entirely (not `null`) so the RPC's
     `COALESCE(v_update->'reschedule_notice', reschedule_notice)` preserves
     whatever notice was already there — matches the old
     `useAppointments.update()`'s "only set a notice when the time moved"
     behavior exactly.
  - New `src/features/appointments/appointment.actions.ts`:
    `listAppointmentsFn` (plain authed select — `appointments_isolation` is
    a household-scoped `FOR ALL` policy, no RPC needed for reads),
    `createAppointmentFn`/`rescheduleAppointmentFn`/`deleteAppointmentFn`
    (each a thin wrapper calling the matching RPC via `.rpc(...)`). The
    `insertPrepTicketsFn`/`deleteTicketsByAppointmentFn`/
    `rescheduleAppointmentTicketsFn` functions C12 added to
    `task.actions.ts` are removed — fully superseded, since the atomic RPCs
    now own the whole appointment+prep-ticket flow even though they touch
    `tickets` too.
  - `use-appointments.ts` rewritten: `appointments` is now server-fetched
    state (fetch on mount/token-change, refetch after every write, same
    "write then refresh" pattern as C9–C13), and `add`/`remove`/`update`
    each call one RPC wrapper then refetch both `appointments` and the
    board's `tasks` (`refreshTasks`, threaded in from `app-store-provider.tsx`
    as `board.refresh`).
  - `new-appointment-modal.tsx` now threads its local `templateId` through
    `onAdd` as `recipeType` (previously computed but silently dropped).
  - `app-store-provider.tsx`'s `household-board-channel` gained a second
    `postgres_changes` listener (same channel, same household_id filter) for
    the `appointments` table, refetching `appointments` on any change —
    same "refetch on any change" treatment as `tickets`/`quick_utos`.
- **Verification:** `tsc --noEmit`, `eslint` (project-wide — same
  pre-existing warnings/CRLF noise noted in C12/C13, unrelated to this
  change), the Vitest suite, and a full `vite build` all pass clean.
  `supabase/add-appointment-atomic-writes.sql` was applied by the user
  directly (same no-service-role-key posture as C12/C13) — confirmed live
  2026-08-13: an unauthenticated PostgREST embed
  (`tickets?select=id,appointment_id,appointments(title)`) returned `200
[]` rather than a "could not find a relationship" error, confirming
  `tickets.appointment_id` is a real FK to `appointments`; all three RPCs
  (`create_appointment_with_preps`/`reschedule_appointment_with_preps`/
  `delete_appointment_with_preps`) responded with the expected `"Not
authenticated"` exception (not a 404), confirming they exist live. Not
  yet verified against a live signed-in session end-to-end.
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9–C13 (writes always authenticate as whatever session token
  `AppStoreProvider` carries, today always a manager's) — though here it's
  moot in practice, since the RPCs' own manager-only check would reject a
  genuine helper session anyway. The three RPCs' manager-only checks are
  enforced in the function body, not RLS — same accepted-risk posture
  already documented for `house_sops`/`tickets`/`vales`/`households` in this
  app (a caller bypassing the `createServerFn` HTTP layer to call
  `.from("appointments").insert(...)` directly would still be subject to
  `appointments_isolation`'s household scoping, just not the role check),
  not a new gap introduced here.

### C15. `helper_notes.voice` never being populated is accepted as-is, not a bug (former gap #8)

- **Found:** 2026-08-13, while building `LINARA_MOBILE` Story 9 (Voice-to-Task
  Promoter & SOP Translator). **Closed as accepted/no-action:** 2026-08-13,
  after re-reading the actual pipeline end to end (`transcribe-notes` and
  `promote-voice-task`, both in `LINARA/supabase/functions/`, added in the
  "voice-to-task and SOP simplifier edge functions" commit): neither edge
  function ever writes the audio anywhere -- `transcribe-notes` takes the
  base64 audio, runs it through Whisper, and returns only the transcript
  text; `promote-voice-task` takes that transcript and structures it into a
  task. The raw recording is deleted client-side immediately after. This
  isn't an incomplete implementation of a durable-audio feature -- it's a
  complete implementation of a transcript-only one. User-confirmed: there is
  no product need to keep the recording; the transcript is only useful as
  the resulting `helper_notes`/ticket content, not as something to play back.
- **Original finding, kept for context:** `plan.md` 5.1 and
  `helper_notes.voice`'s column comment ("Local URL path or pre-signed
  storage reference URL") both imply voice memos get a durable storage
  pointer, and the shared `household-evidence` bucket's
  `allowed_mime_types` (`['image/jpeg', 'image/png', 'audio/webm']`) doesn't
  even include the MIME type mobile's recorder actually produces
  (`audio/m4a` -- no mobile OS ships a native WebM encoder, so the
  `audio/webm` assumption only ever fit the web app's browser
  `MediaRecorder`). That mismatch is real, but moot: nothing tries to upload
  audio to that bucket in the first place, so it was never actually blocking
  anything.
- **Current/final state:** `helper_notes.voice` stays `NULL` for every
  voice-originated note, permanently, by design. Only the transcript is
  persisted (`helper_notes.text`). No further schema or code change is
  planned unless a real product requirement to replay original audio shows
  up later, at which point this would need to be reopened as a real feature
  request, not a bug fix.

### C16. `tickets.photo_evidence_url` stored an expiring signed URL, not a durable reference (former gap #13)

- **Found:** 2026-08-14, while answering a question about whether photos
  get cached client-side to avoid re-pulling from the storage bucket.
  **Fixed:** 2026-08-14, same session, after the user confirmed the
  re-signing approach below before any code was written.
- **Root cause:** `LINARA_MOBILE/services/media-upload.ts`'s
  `uploadEvidenceImage()` creates a signed URL with a 15-minute expiry and
  returns both that URL and the durable storage `path`, but the only call
  site (`app/(app)/pantry.tsx`'s `captureReceipt`) persists the expiring
  `signedUrl` (not the `path`) all the way into `tickets.photo_evidence_url`
  via `completeTicket()`. Nothing ever re-signed it, so every receipt or
  Done-card photo went dead ~15 minutes after upload.
- **Fixed by:** `src/features/tasks/task.actions.ts`'s `listTicketsFn` now
  re-signs `photo_evidence_url` on every read rather than requiring a
  `LINARA_MOBILE` change. A Supabase signed URL embeds its own storage path
  (only the trailing `?token=...` expires), so
  `extractHouseholdEvidencePath()` recovers the path with a regex against
  the `/storage/v1/object/sign/household-evidence/` segment, and
  `resignPhotoEvidenceUrl()` calls `storage.createSignedUrl()` fresh against
  it using the same authed client (a manager's) already used for the
  ticket query -- `storage-policies.sql`'s `household_evidence_isolation`
  policy is household-scoped via `current_household_id()`, the same as
  every other table's RLS, so that client already has standing to re-sign
  any object under its own household's path. A URL that doesn't match the
  pattern (e.g. a leftover pre-C18 `PHOTO_POOL` mock string, a plain
  Unsplash URL) or a resign that errors both fall back to the stored value
  unchanged rather than failing the whole board fetch over one bad photo.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. No migration was needed for this one (the
  fix reads the existing bucket/policy set up for C1/C12), so there's
  nothing new to confirm live via PostgREST. Not yet verified against a
  live signed-in session with a real (non-mock) uploaded photo older than
  15 minutes.
- **Known residual limitation, not closed by this fix:** The more correct
  long-term fix -- `LINARA_MOBILE` storing the durable `path` instead of the
  expiring `signedUrl`, so `LINARA` never has to parse a URL to recover it
  -- is still open on the mobile side, but no longer blocking: this fix
  works against the already-expired URLs mobile writes today, so the two
  repos don't need to land in lockstep.

### C17. `boardClosed` (the Pass board's open/closed-for-the-night flag) was not persisted anywhere (former gap #11)

- **Found:** 2026-08-14, while explaining Closed Gap C12's residual
  limitations in more depth. **Fixed:** 2026-08-14, same session.
- **Root cause:** `use-task-board.ts`'s `boardClosed` was plain
  `useState(false)` -- no table or column backed it, unlike the `queued`
  flag it drives (real, per C12) -- so it reset on every refresh, new tab,
  new device, or re-login even though the manager's mental model treats
  "closed for the night" as a standing state.
- **Fixed by:** `supabase/add-household-board-closed.sql` adds
  `households.board_closed BOOLEAN NOT NULL DEFAULT FALSE`. No new RLS
  policy was needed -- C13's `households_update_budget` UPDATE policy has
  no column list, so its existing `USING`/`WITH CHECK` (household-scoped)
  already covers this column too. `task.actions.ts` gained
  `getBoardClosedFn`/`setBoardClosedFn` (the latter manager-only, same
  role-check pattern as `updateHouseholdBudgetFn`). `use-task-board.ts`
  fetches the real value once on mount/token-change (alongside the existing
  `refresh()`), and `setClosed()` now writes through
  (`setBoardClosedFn`) in addition to updating local state, same
  optimistic-then-persist shape as every other write-then-refresh hook in
  this app. `startNewDay()`'s existing local `setBoardClosed(false)` reset
  now also persists via `setBoardClosedFn({ closed: false })` -- without
  this, a fresh simulated day would locally show the board reopened while
  the database still held `board_closed = true` from the night before,
  reintroducing the exact staleness this gap was about.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. This session had no service-role key (same
  posture as every prior migration), so
  `supabase/add-household-board-closed.sql` needs to be applied by hand --
  confirmed **not yet live** 2026-08-14 via an unauthenticated PostgREST
  `select id,board_closed` against `households`: a `42703` "column
  households.board_closed does not exist" 400, not the `200 []` a landed
  migration would return. Flagging here so the next session doesn't assume
  it's already applied the way C12–C14's migrations were.
- **Known residual limitation, not closed by this fix:** Per the gap's own
  scoped fix shape ("read it as an initial fetched value"), `board_closed`
  is fetched once on load, not kept in sync via Realtime the way
  `tickets`/`quick_utos`/`appointments` are (see C11/C12/C14's
  `postgres_changes` listeners) -- two managers with the board open on
  different devices won't see each other's open/close toggle until a fresh
  page load. Extending this to a live listener, if wanted, would follow the
  exact same pattern already used for those three tables.

### C18. General task photo evidence mock removed from `LINARA`'s vestigial helper surface (`LINARA` half of former gap #12)

- **Found:** 2026-08-14, investigating whether `LINARA`'s task-completion
  photo mock (`next-task-card.tsx`'s `PHOTO_POOL` random-pick) should be
  wired to something real. **Decided/fixed:** 2026-08-14, same session --
  there's nothing real to wire it to yet on either app (see original
  finding below), and per `AGENTS.md`'s helper-work-belongs-on-mobile
  boundary, a working-looking "Done · add photo" button that fakes an
  Unsplash stock photo on every tap doesn't belong on this repo's vestigial
  helper-facing surface regardless -- same reasoning as C13's removal of
  the vestigial grocery checklist.
- **Original finding, kept for context:** `LINARA_MOBILE/services/api/
tickets.ts`'s `completeTicket(ticketId, photoEvidenceUrl?)` is already
  generic (Palengke is just its documented example, not the whole scope),
  and the upload plumbing (`uploadEvidenceImage`/`household-evidence`
  bucket) already exists. But the general "Today" focus-task completion
  flow (`app/(app)/today.tsx`) only ever calls `completeTicket(ticketId)`
  with no photo -- no camera-capture UI exists there. Only
  `app/(app)/pantry.tsx`'s Palengke-specific flow actually captures one.
- **Fixed by:** `next-task-card.tsx`'s `done()` now calls
  `onUpdate(task.id, "done")` directly, with no photo argument, no
  `addingPhoto` fake-upload delay state, and no `Camera`/"Attaching
  photo…" UI -- the button just reads "Done". `task.constants.ts` (whose
  only export was `PHOTO_POOL`) is deleted outright rather than left with a
  dead constant, matching C13's "delete confirmed-zero-importer files"
  precedent.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. Nothing to verify live -- this fix only
  removes client-side mock behavior, no schema or write path changed.
- **Known residual limitation, not closed by this fix:** The
  `LINARA_MOBILE` half -- real camera-capture photo evidence for the
  general Today completion flow, reusing `pantry.tsx`'s
  `uploadEvidenceImage`/`completeTicket(ticketId, photoUrl)` pattern -- is
  unchanged and out of scope for this repo, per `AGENTS.md`.

### C19. `LINARA`'s Pay Dial (`SpendAndPayday`) computed net pay from hardcoded numbers instead of the real `helper_profiles.monthly_rate` (former gap #10)

- **Found:** 2026-08-14, cross-checking `execution_plan.md`'s "all 17
  stories complete" claim against live behavior while closing gaps
  #2/#4/#7. **Decisions (user-confirmed before writing code):** port the
  real per-cutoff Batas Kasambahay statutory-deduction math from
  `LINARA_MOBILE`'s `DigitalPayslip`, not just wire the wage in isolation
  and leave the flat ₱240 deduction as-is.
- **Root cause:** `spend-and-payday.tsx` hardcoded `baseSalary = 8000` and
  `governmentDeductions = 240`, neither derived from any real column. This
  wasn't just a missed wiring: `Helper`
  (`src/features/people/people.types.ts`) had no `monthlyRate`/
  `paydayInterval` field at all, even though `helper_profiles.monthly_rate`/
  `.payday_interval` were already real columns (`.payday_interval` already
  live before this session, confirmed below) -- so there was nowhere for a
  component like this to even get the real number without `toHelper()`
  being extended. The flat ₱240 also disagreed with the real formula's
  ₱375 for the same wage.
- **Fixed by:** `use-invites.ts`'s `HelperProfileRow` gained
  `payday_interval` (typing only -- `listHelperProfilesFn`'s `select("*")`
  already returned it). `Helper`/`toHelper()`
  (`people.types.ts`/`people.utils.ts`) gained `monthlyRate`/
  `paydayInterval`; `UNKNOWN_HELPER` gained matching placeholder values.
  `people.utils.ts` gained `computeStatutorySplit()` -- extracted from
  `legal-contribution-split-card.tsx`'s previously-inline copy of the exact
  same Batas Kasambahay formula (that card now calls the shared function
  instead of duplicating it, so the invite-preview card and the Pay Dial
  can no longer drift the way the flat ₱240 hardcode once did against this
  same formula) -- and `cutoffsPerMonth()` (2 for `semi_monthly`, 1 for
  `monthly`). `spend-and-payday.tsx` now computes `basePay =
monthlyRate / cutoffsPerMonth` and `governmentDeductions =
totalEmployee / cutoffsPerMonth`, exactly mirroring
  `LINARA_MOBILE`'s `digital-payslip.tsx`; the "half-month"/"monthly" label
  under the dial now reflects the helper's real `paydayInterval` instead of
  being hardcoded text. `restOwedRate` (₱120/hr) was left as-is -- not
  flagged as wrong by this gap, out of scope for this pass.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. `helper_profiles.payday_interval` was
  confirmed **already live** (no migration needed for this gap) via an
  unauthenticated PostgREST `select id,monthly_rate,payday_interval`
  against `helper_profiles`: a `200 []` response, not a "column does not
  exist" 400. Not yet verified against a live signed-in session with a real
  ACTIVE helper carrying a nonzero `monthly_rate` (needed to see anything
  other than ₱0 in the dial).
- **Known residual limitation, not closed by this fix:** Same "first ACTIVE
  helper stands in for a real per-helper session" caveat as C8 -- a
  multi-helper household's Pay Dial reflects whichever helper happens to be
  first, not a manager-chosen one.

### C20. `helper_profiles.monthly_rate` was write-once -- no admin path existed to change a helper's wage after invite

- **Found:** 2026-08-14, while answering a user question about where base
  salary gets adjusted in the admin, immediately after closing C19. Tracing
  every write to `helper_profiles.monthly_rate` turned up exactly one:
  `inviteHelperFn`, at invite creation. `updateHelperScheduleFn` (the only
  other post-invite mutator on this table, powering the Shifts editor) only
  ever touches `shift_start`/`shift_end`/`weekly_rest_day`/`break_start`/
  `break_end` -- wage isn't in its payload. `people-section.tsx`'s helper
  card shows the wage read-only (`Wage: ₱{inv.wagePHP}`) with a "View
  contributions split" toggle, but no edit affordance. So a manager giving
  a raise, or fixing a typo'd wage at invite time, had nowhere in the UI to
  do it -- not a Phase-3 gap or a mapping problem like #9/#10, just a
  missing mutator no story had asked for yet.
- **Fixed by:** `updateHelperWageFn` in `people.actions.ts` -- unlike
  `updateHelperScheduleFn`, explicitly manager-gated in the function body
  (same role-check pattern as `updateHouseholdBudgetFn`/`decideValeFn`),
  since wage is more sensitive than a shift window and shouldn't rely on
  household-scoped RLS alone. `use-invites.ts` gained `updateWage(id,
monthlyRate)` -- write-then-refresh (same pattern as
  `useGroceryList.setBudget`), since the new wage feeds several other real
  reads at once (Pay Dial, `LegalContributionSplitCard`, the minimum-wage
  compliance banner) that all need the fresh value. New
  `edit-wage-modal.tsx` (modeled on `invite-helper-modal.tsx`'s existing
  wage field, same compliance-warning and contribution-split preview)
  wired into `people-section.tsx` via a new "Edit wage" action next to
  "View contributions split", manager-gated by the same `canInvite` prop
  that already gates "Invite a helper". `payday_interval` was left
  immutable post-invite -- out of scope for this pass; only the wage amount
  itself was asked about and rarely does the interval change independent
  of a raise.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean. No schema change was needed (`monthly_rate`
  already existed and was already writable by `inviteHelperFn`), so nothing
  new to confirm live via PostgREST. Not yet verified against a live
  signed-in manager session end-to-end.
- **Known residual limitation, not closed by this fix:** No audit trail for
  wage changes -- unlike `inviteHelperFn`'s below-minimum-wage check (which
  writes an `invite_flags` row for manager transparency), `updateHelperWageFn`
  doesn't flag a new wage that drops below `REGIONAL_MINIMUM_WAGE` the same
  way; the compliance banner on the People tab still catches it on next
  render (it's derived live from `wagePHP`, not from a stored flag), just
  without the audit-log entry a first-time low-wage invite gets.

### C21. No real archive backed "wage histories" or payment transfers for the digital payslip (former gap #9)

- **Found:** 2026-08-13, while building `LINARA_MOBILE` Story 11 (Pay Ledger
  Statutory Breakdowns & EAS Builds) -- `roadmap/Story_11_...md` step 1
  asked for a payslip "mapping wage histories, HitPay transfers, and
  statutory split columns," but no table backed the first two, and
  `architecture.md` Section 5.3 marked the whole feature "Future Phase 3."
  **Closed:** 2026-08-14.
- **Vendor decision, made before any schema was written:** this gap's own
  text, `architecture.md`'s Section 5.3 sketch, and its sample JSON payload
  disagreed with each other on the vendor (HitPay per this gap, GCash/Maya
  per the section header, Brankas/PayMongo per the sample payload) -- none
  of which had been checked against a real API. HitPay was tried first:
  its Payout/Transfers API (`POST /v1/beneficiaries`, `POST /v1/transfers`)
  is real and documented for Philippines InstaPay/PESONet rails, but a live
  sandbox call (`POST /v1/beneficiaries/schema`) returned
  `{"message": "Feature access denied"}` with no self-serve dashboard
  toggle or documented enablement path -- dropped rather than built around.
  **Xendit was verified live instead**: `POST https://api.xendit.co/v2/payouts`
  (Basic Auth, secret key as username) with `channel_code: "PH_GCASH"` and
  separately `"PH_PAYMAYA"` both returned real `status: "ACCEPTED"`
  responses against the sandbox key, with no special account approval
  needed (unlike HitPay). Two wrong turns worth recording so a future
  session doesn't re-try them: `POST /payouts` (no `/v2`) rejects both
  `channel_code` and `bank_code` outright for this account -- a different,
  incompatible product from the same vendor; `POST /v3/payouts` demands an
  `api-version` header and a heavier `recipient.type`/`purpose_code`/
  `source_of_fund` compliance schema built for cross-border remittance, the
  wrong fit for a domestic PHP payroll payout.
- **Decisions (user-confirmed before writing code):**
  1. One table (`payslips`), not a `payslips` + `payment_confirmations`
     split -- a payslip here always implies an intended payout, so there's
     no state a second table would capture that `payslips.payout_*`
     doesn't already.
  2. Real per-cutoff vale settlement (`vales.settled_in_payslip_id`), not
     the simpler "snapshot the running approved-vale total" alternative --
     without it, a vale approved between two "Pay Now" clicks would be
     double-counted, since nothing previously marked a vale as "already
     paid out."
  3. Both a manager "Pay Now" action (calls Xendit directly) and a webhook
     confirm flow (Xendit calling back), not just one -- the "Pay Now"
     click gets an immediate `ACCEPTED`/error from Xendit's synchronous
     response, but only the webhook (`payout.succeeded`/`.failed`/
     `.reversed`) tells us the payout's true terminal outcome.
  4. The fake `WebhookPreviewModal` + "Transfer via GCash/Maya" buttons
     already sitting on the vestigial helper-facing `PayRecord`
     (`src/features/ledger/components/pay-record.tsx`) were removed
     outright, not left alongside the real feature -- same precedent as
     Closed Gaps C13/C18 (delete vestigial helper-surface mockups rather
     than build them out on a page `AGENTS.md` scopes out of this repo).
     They rendered a JSON payload preview with zero real API call, and fed
     off the exact stale `baseSalary = 8000` hardcode Closed Gap C19 had
     already fixed on the manager-facing `SpendAndPayday`.
- **Fixed by:**
  - `supabase/add-payslips-table.sql`: the `payslips` table (snapshotted
    `base_pay`/`statutory_employee_share`/`vale_deductions`/`net_pay` plus
    `payout_status`/`payout_external_id`/`payout_reference_id` tracking,
    same "denormalize a historical snapshot" reasoning as Closed Gap C10's
    `ledger_entries.title`/`.kind`), `vales.settled_in_payslip_id`,
    `payslips_isolation` RLS (join through `helper_profiles`, same pattern
    as `vales_isolation`), and `initiate_payslip` -- a `SECURITY DEFINER`
    RPC (same pattern as `create_appointment_with_preps`) that atomically
    inserts the payslip row and marks the helper's unsettled approved
    vales as settled in one transaction, since doing those two writes
    non-atomically risks double-counted or silently-dropped vales. Also
    guards against paying the same cutoff twice (a prior `failed` attempt
    doesn't block a retry; anything else does).
  - New `src/features/pay/`: `pay.actions.ts`'s `initiatePayoutFn`
    (manager-gated inside the RPC) computes the cutoff snapshot, calls the
    RPC, then calls Xendit directly and writes the result back with a
    second, non-atomic update (Postgres can't make outbound HTTPS calls,
    so this two-phase split is unavoidable -- see the file's own doc
    comment for the failure-mode tradeoff this accepts) -- on an
    immediate Xendit failure, the payslip is marked `failed` and its
    claimed vales are unsettled so the next "Pay Now" click can reclaim
    them. `pay.utils.ts`'s `currentCutoffRange` derives PH semi-monthly
    (1st-15th / 16th-end) or monthly cutoff boundaries from today's date --
    no cutoff-calendar table, same "pure function of today + interval"
    posture `cutoffsPerMonth` already had. `hooks/use-payslips.ts` and
    `components/payslip-history.tsx` (write-then-refresh, same pattern as
    C9-C20) wire "Pay Now" into `ManagerMoneyPage`, alongside the existing
    `SpendAndPayday`.
  - New `supabase/functions/xendit-payout-webhook/`: verifies Xendit's
    `X-CALLBACK-TOKEN` header (a static per-account token, not HMAC --
    Xendit's own mechanism, checked against
    `XENDIT_WEBHOOK_VERIFICATION_TOKEN`) against the value set via
    `supabase secrets set` (separate store from this repo's `.env`, same
    posture as `OPENAI_API_KEY`), writes with the service-role key
    (bypassing `payslips_isolation` -- no user session on an inbound
    webhook to check RLS against), and is idempotent: a payslip already
    `succeeded`/`failed` is a no-op, since Xendit retries an
    unacknowledged webhook for 24h.
  - `Helper` (`people.types.ts`/`people.utils.ts`) gained `phone` --
    `helper_profiles.phone` was already a real column but never threaded
    through `toHelper()` (only `Invite.phone` was), needed as the
    `account_number` sent to Xendit.
  - Fixed a live double-counting bug this change would otherwise have
    introduced: `SpendAndPayday`'s and mobile `pay.tsx`'s "approved vale
    total" summed every approved vale ever, with nothing marking one as
    already paid out. Both now filter on `!settledInPayslipId`, so a vale
    a past payslip already deducted stops shrinking the _next_ cutoff's
    live estimate forever.
  - `LINARA_MOBILE`: new `services/api/payslips.ts` (`getMyPayslips`, same
    read-only join-through-`helper_profiles` RLS pattern as `getMyVales`)
    and `components/features/pay/payslip-history.tsx`, wired into
    `app/(app)/pay.tsx` below `DigitalPayslip`. Read-only by design --
    "Pay Now" is manager-only and lives on `LINARA`'s web dashboard, per
    `AGENTS.md`'s helper-work-belongs-on-mobile /
    manager-work-belongs-on-web split applied to money-moving actions
    specifically. `digital-payslip.tsx`'s doc comment (which anticipated
    "HitPay payment confirmations and a multi-cutoff payslip history" with
    "no table backs either yet") is updated to point at the new
    `PayslipHistory` component instead of describing a gap.
- **Verification:** `tsc --noEmit`, `eslint`, the Vitest suite, and a full
  `vite build` all pass clean on `LINARA`; `tsc --noEmit` and `eslint` pass
  clean on `LINARA_MOBILE` (no test suite exists there to run). This
  session had no service-role key (same posture as every prior migration),
  so `supabase/add-payslips-table.sql` needs to be applied by hand --
  confirmed **not yet live** 2026-08-14 via an unauthenticated PostgREST
  `select id,cutoff_start,payout_status` against `payslips`: a `PGRST205`
  "Could not find the table" response, and a separate
  `select id,settled_in_payslip_id` against `vales`: a `42703` "column
  does not exist" 400 -- neither the `200 []` a landed migration would
  return. Flagging here so the next session doesn't assume either is
  already applied, same posture as Closed Gap C17. The new
  `xendit-payout-webhook` Edge Function also still needs `supabase
functions deploy xendit-payout-webhook`, a `supabase secrets set
XENDIT_WEBHOOK_VERIFICATION_TOKEN=...`, and that same token entered into
  Xendit's dashboard webhook settings (pointed at the deployed function's
  URL, subscribed to `payout.succeeded`/`payout.failed`/`payout.reversed`)
  before a real payout's confirmation can ever land -- none of that is
  something this session could do without dashboard access.
- **Known residual limitation, not closed by this fix:** Same helper-auth
  caveat as C9-C20 is moot here specifically, since `initiate_payslip`'s
  own manager-only check would reject a genuine helper session regardless.
  `initiatePayoutFn`'s two-phase, not-fully-atomic shape (DB write, then a
  separate Xendit call, then a second DB write) means a process crash
  between the RPC and the Xendit call could leave a payslip stuck at
  `pending_send` forever, indistinguishable from "still in flight" until a
  manager notices no webhook ever arrived -- no auto-retry or staleness
  detection exists for that state, accepted as low-stakes/out of scope for
  this pass (see `pay.actions.ts`'s own doc comment). PESONet (Xendit's
  second PH rail, for amounts routed differently than InstaPay) was never
  tested -- only the two e-wallet `channel_code`s (`PH_GCASH`/
  `PH_PAYMAYA`) this feature actually needs.

### C22. `HelperShell`'s "claim your account" banner was unreachable dead code with real data, and CI's e2e smoke test had never been re-verified against the real `helper_profiles`-backed app C8 shipped

- **Found:** 2026-08-14, chasing a `test:e2e` CI failure on `jamesDev`
  (`tests/claims-smoke.spec.ts` timing out waiting for
  `text=Magandang umaga, Ate Rosa.`).
- **Root cause (two separate bugs, one in the test, one in the app):**
  (1) `helper-shell.tsx`'s `myClaimed` was derived as
  `invites.invites.find(i => i.status === "active")` -- literally "does
  _any_ `helper_profiles` row in the household happen to be `ACTIVE`",
  the exact same field that also determines `helper` (`activeHelpers[0]`
  in `app-store-provider.tsx`). Since both booleans read the same
  underlying rows, `helper` being truthy (needed to render the greeting
  at all) _always_ implied `myClaimed` was also truthy, and when `helper`
  was null the component's early return (`!helper`) skipped the claim
  banner section entirely. Net effect: `text=New here? Claim your
account.` could never render in production, only in the pre-C8 mock
  roster this smoke test was originally written against. A related,
  _not_ fixed here: `ClaimAccountFlow`'s `onClaim(invite.id, ...)` passes
  the invite **code** (`terms.inviteCode` from `verifyClaimFn`) as the id,
  but `useInvites`'s `patch()` matches against `helper_profiles.id`
  (a UUID) -- these never match, so the local optimistic patch after a
  real claim is a silent no-op today. (2) Separately, the smoke test
  itself navigated straight to `/helper/today` with no session at all;
  `useInvites` only fetches `helper_profiles` once a manager `token`
  exists (see its own doc comment), so even with bug (1) fixed the test
  had no path to real data. CI's `SUPABASE_URL` mock literal
  (`https://mock-supabase-url.supabase.co`, `ci.yml`) was never reachable
  either way, so this had silently never worked since C4 wired
  `test:e2e` into CI.
- **Fixed by:** `helper-shell.tsx`'s `myClaimed` now tracks "did _this
  device_ complete its own claim" via a new `linara_helper_claimed_name`
  localStorage key, set by `claim-account-flow.tsx` alongside the
  existing `linara_helper_*` keys right after a successful
  `claimInviteFn` call -- independent of any `helper_profiles.status`
  read, matching the same "no real per-helper session, track locally"
  posture already used for `linara_manager_token` (`use-session.ts`).
  The claim banner is reachable again. For the test: added
  `tests/support/mock-supabase-server.ts`, a small local HTTP stub
  answering the exact endpoints `people.actions.ts`'s server functions
  call (`auth/v1/user`, `rest/v1/user_profiles`, `rest/v1/helper_profiles`)
  with fixture data; `playwright.config.ts` starts it and points
  `webServer.env.SUPABASE_URL` at it (overriding `ci.yml`'s dead literal
  for the e2e run only -- `ci.yml` itself untouched). Mocking at the
  browser network layer (`page.route()`) was tried first and abandoned:
  these are TanStack Start server functions, called via a `_serverFn/
<base64 id>` RPC using `seroval` wire-format serialization, and the
  actual Supabase calls happen server-side inside the spawned `vite dev`
  process -- neither layer is interceptable from the browser context
  Playwright controls, only the real network boundary (Supabase's own
  HTTP endpoints) is. `tests/claims-smoke.spec.ts` seeds
  `linara_manager_token` via `page.addInitScript` and asserts against the
  fixture helper's real name instead of a hardcoded literal.
- **Verification:** `tsc --noEmit`, `eslint` (scoped to touched files --
  the repo-wide run is swamped by pre-existing Windows-checkout CRLF
  noise, see below), the Vitest suite, `vite build`, and `npx playwright
test` all pass locally, including a from-scratch `rm -rf node_modules
&& npm ci` against both npm 10.9.2 (CI's actual bundled version, Node 22) and npm 11.
- **Known residual limitation, not closed by this fix:** The
  `onClaim`/`patch()` id-mismatch bug noted above (code vs. UUID) is
  real but separate -- the claimed helper's row still gets a correct
  status via the next `refresh()` (manager re-opens People, or reloads),
  just not optimistically. Not fixed here to keep this pass scoped to
  what was actually breaking CI. Separately, a full-repo `npx eslint .`
  or `npx prettier --check .` run on this Windows checkout reports
  thousands of false-positive CRLF findings unrelated to any real
  formatting issue -- `core.autocrlf=true` with no `.gitattributes` to
  pin line endings. Not fixed here (out of scope, and CI itself runs on
  Linux where this doesn't occur); flagging so a future session doesn't
  mistake that noise for real lint debt.

### C23. `quick_utos`/`tickets` realtime subscriptions silently never fired -- required an app restart to see changes

- **Found:** 2026-08-14, while manually testing Quick Utos in `LINARA_MOBILE` and
  seeing changes only appear after killing and reopening the app.
- **Root cause:** Both `LINARA_MOBILE/hooks/use-realtime-subscription.ts` and
  `LINARA/app-store-provider.tsx` correctly call
  `supabase.channel(...).on('postgres_changes', ...).subscribe()` against
  `public.quick_utos` and `public.tickets`, matching what `LINARA_MOBILE`'s
  `Story_3_DatabaseRealtimeAndStoragePipes.md` (step 4, AC "Modifying a row
  in the database table triggers an immediate realtime callback on the
  client") and `architecture.md` Section 9.1 describe. But neither table
  had ever been added to the `supabase_realtime` publication -- no
  migration or dashboard step ever did it, in any environment. `.subscribe()`
  succeeds with no error in this state; the channel connects but never
  receives events. A restart masked it because a fresh mount re-fetches via
  TanStack Query (`getPendingQuickUtos`), which made it look like the
  client-side subscription code was the problem when it was actually a
  missing schema-side prerequisite. (Initially suspected as a free-tier
  compute limitation -- it isn't; Postgres Changes works on Supabase's free
  tier, the publication was just empty.)
- **Fixed by:** `supabase/enable-realtime-quick-utos-tickets.sql` (`ALTER
  PUBLICATION supabase_realtime ADD TABLE public.quick_utos, public.tickets`
  + `REPLICA IDENTITY FULL` on both, so UPDATE/DELETE payloads carry full
  old-row data for the `recipient_id`/`helper_id` filters to match against).
  Also documented in `architecture.md` Section 8 (Realtime Publication) so
  it isn't only a standalone `.sql` file a future environment could miss.
- **Also noted:** Any new table that needs live client updates (mirroring
  this pattern) needs the same two-line addition -- it's not implied by
  creating the table or writing a `postgres_changes` listener alone.

### C24. `initiatePayoutFn` sent Xendit payouts 100x the intended amount (centavos-style multiplier against an API that already expects the major unit)

- **Found:** 2026-08-14, user tried a "Pay Now" GCash payout for ₱3,563 and
  Xendit's dashboard showed ₱356,250 for `reference_id
  3b1da7c1-c212-4a29-97f2-f72df887283e` -- a ~100x inflation.
- **Root cause:** `pay.actions.ts`'s `initiatePayoutFn` sent `amount:
  Math.round(netPay * 100)` to `POST /v2/payouts`, following the
  Stripe-style convention of expressing amounts in the smallest currency
  unit (cents/centavos). Xendit's Payouts API doesn't work that way for
  PHP -- `amount` is the literal peso amount (decimals allowed for
  centavos), not centavos-as-an-integer. A `netPay` of `3562.50` became
  `356250`, which Xendit read as ₱356,250.00.
- **Confirmed low-stakes this time:** `.env`'s `XENDIT_SECRET_WRITE_KEY` is
  `xnd_development_...` (sandbox), so no real funds moved on this
  transaction. Would not have been low-stakes against a `xnd_production_...`
  key.
- **Fixed by:** changed to `amount: Math.round(netPay * 100) / 100` (rounds
  to the nearest centavo without the 100x multiplier) in
  `pay.actions.ts`'s `initiatePayoutFn`.
- **Also noted:** No test coverage exercises the actual Xendit request body
  (a real API call, correctly excluded from CI) -- this class of bug can
  only be caught by unit-testing the payload construction in isolation or
  by manual sandbox verification like this one. Worth adding a narrow unit
  test around the request body if this path is touched again.

### C25. Pantry stock levels (`usePantry`) were pure local `useState` seeded from an 11-item hardcoded mock, never connected to the real `pantry_items` table

- **Found:** 2026-08-14, user noticed the manager-facing Pantry page always
  shows the same fake items ("Rice", "Sofia's cereal", "Garlic"...)
  regardless of household.
- **Root cause:** `pantry.constants.ts`'s `INITIAL_PANTRY` seeded
  `usePantry()`'s `useState` directly -- no Supabase read/write anywhere in
  the hook, unlike every other feature store in this app (Vales/Ledger/
  Groceries/Tasks/Appointments/Payslips), all of which were migrated off
  local mocks by earlier gaps (C8-C21). `pantry_items` (`architecture.md`
  §8) already existed live with the exact columns the client `PantryItem`
  type needs (`name`/`qty`/`unit`/`par`/`category`) and a plain
  household-scoped `pantry_items_isolation` RLS policy, matching
  `grocery_items`'s -- confirmed live via an unauthenticated PostgREST
  `select id,name,qty,unit,par,category`: a `200 []` response, not a "does
  not exist" 400. So unlike most prior gaps, no migration was needed at
  all -- the schema had simply never been wired up to any UI.
  `plan.md` §2.5 clarifies stock levels are meant to be manually maintained
  by the Cook (a helper), not AI-generated -- `USE_MOCK_AI` is unrelated,
  it only governs the three edge-function agents in `aiagent.md`.
- **Also found while closing this:** `useGroceryList`'s low-stock ->
  auto-suggested-grocery-item logic (`grocery.actions.ts`/
  `use-grocery-list.ts` lines ~78-91, matching `plan.md` §2.5's
  "Auto-Generated Shopping List" step) was already fully built against
  `pantry.items` -- it was just running on fake data. No changes were
  needed there; it started working for real the moment `usePantry` did.
- **Fixed by:** New `src/features/pantry/pantry.actions.ts`
  (`listPantryItemsFn`/`insertPantryItemFn`/`updatePantryItemQtyFn`/
  `deletePantryItemFn`), following the exact same auth/household-scoping
  pattern as `grocery.actions.ts` -- no manager-only gating, since
  `pantry_items_isolation` is a plain household-scoped policy and plan.md
  has a helper (the Cook) writing to this data too. `use-pantry.ts`
  rewritten to fetch on mount/token-change and refetch after every write,
  same "write then refresh" pattern as C9-C21; `adjust()` now reads the
  current item from already-fetched state and calls the same `setQty`
  writer used by manual edits, rather than a separate delta-mutation
  endpoint. `app-store-provider.tsx`'s `usePantry()` call now threads
  `session.token`/`ready` through, same as `useVales`/`usePayslips`.
  `pantry.constants.ts` (`INITIAL_PANTRY`, zero other importers) deleted
  outright, same "delete confirmed-dead mock" precedent as C8/C13.
- **Verification:** `tsc --noEmit`, `eslint` (touched files clean; the
  pre-existing repo-wide CRLF noise from C22 is unrelated and untouched),
  the Vitest suite, and a full `vite build` all pass clean.
- **Known residual limitation, not closed by this fix:** At the time this was
  written, `PantryPage` was still mounted at both `/manager/pantry` and the
  vestigial `/helper/pantry` (see the `ViewAsSwitcher`/`HelperShell`
  discussion this gap was found during), so a write from either route
  authenticated as whatever session token `AppStoreProvider` carried (always
  a manager's), not a genuinely separate helper identity -- same posture as
  C9-C14. **Superseded by C26**, which removed `/helper/pantry` and the rest
  of the vestigial helper-facing web surface entirely -- `PantryPage` is now
  manager-only.

### C26. Removed the vestigial helper-facing web surface (`/helper` route tree, `ViewAsSwitcher`'s persona toggle, and everything only reachable from either)

- **Found:** 2026-08-14, user asked whether the `ViewAsSwitcher`'s "Helper"
  pill (`TopBar`) really did let a manager preview a helper's mobile-equivalent
  view from inside this web app. It did -- a full parallel `/helper` route
  tree (`today`/`pantry`/`pay`), rendered inside a separate `HelperShell`,
  live on the deployed Vercel app for any signed-in manager. `AGENTS.md`
  already states the helper-facing Worker's Station lives exclusively in
  `LINARA_MOBILE`; C13/C18/C21 had each already stripped *pieces* of this
  surface (the grocery checklist, a fake photo button, fake payout buttons)
  for duplicating real `LINARA_MOBILE` execution work, but the shell around
  it was never removed, just hollowed out piece by piece.
- **Root cause:** Predates the mobile split -- this was originally a
  single app serving both roles. Nothing since the split ever did a full
  sweep to remove the leftover half; each gap closure only touched the one
  feature it was scoped to.
- **Confirmed before deleting anything:** `LINARA_MOBILE` already has its own
  real claim flow (`app/(auth)/claim-account.tsx`, `flag-terms.tsx`,
  `review-terms.tsx`, `welcome.tsx`) and real per-helper Supabase auth
  (`helper_notes` RLS keys off `auth.uid()` -- the Privacy Wall `AGENTS.md`
  describes), so nothing deleted here was the *only* copy of any real
  functionality. `src/features/notes/` (the helper's "My Notes" widget) was
  additionally confirmed to be a pure `localStorage` mock -- never wired to
  the real `helper_notes` table at all, not even partially.
- **Fixed by:**
  - Deleted the whole `/helper` route tree (`src/routes/_app/helper*`) and
    every component/page reachable only from it: `helper-shell.tsx`,
    `helper-today-page.tsx`, `helper-task-lists.tsx`, `end-of-day.tsx`,
    `pay-record-page.tsx`/`pay-record.tsx`, `claim-account-flow.tsx`/
    `claimed-welcome.tsx`, `block-reason-modal.tsx`, `next-task-card.tsx`,
    `quick-utos-feed.tsx`/`utos-chip.tsx`, `my-week-card.tsx`,
    `rosa-avail-control.tsx`, and the entire `src/features/notes/` folder.
    Each was verified to have zero importers outside this surface via
    repo-wide grep before deletion.
  - `view-as-switcher.tsx` rewritten to only switch between co-manager
    `admins` (the real, non-vestigial half of what it did) -- the `helper`
    prop and persona-toggle branch are gone; `top-bar.tsx` stopped
    threading `helper` into it. `nav.constants.ts`'s `HELPER_NAV` removed.
  - `use-invites.ts`'s `findByCode`/`claim`/`flag` removed (local-only
    display patches whose only caller was `helper-shell.tsx`); `resolveFlag`
    kept (real caller: `manager-pass-page.tsx`).
  - `people.actions.ts`'s `verifyClaimFn`/`flagInviteFn`/`claimInviteFn` and
    their dedicated `PendingInviteRow`/`ClaimHelperInviteRow` types removed
    -- `LINARA_MOBILE` calls the underlying `lookup_pending_invite`/
    `flag_invite`/`claim_helper_invite` RPCs directly against Supabase, not
    through these TanStack server functions, so mobile is unaffected.
    `inviteHelperFn`/`cancelInviteFn`/`listHelperProfilesFn`/
    `updateHelperWageFn` untouched.
  - `palengke-chip.tsx`'s `to` prop (`"/manager/pantry" | "/helper/pantry"`)
    removed entirely -- its one remaining caller always used the default.
  - `routes/index.tsx`'s public landing page CTA "May Invite Code ako
    (Helper)" (linking to `/helper/today`) removed -- user-confirmed no
    replacement; no public web-based helper onboarding exists anymore.
  - **Also removed, per user decision:** the e2e test layer. `tests/
claims-smoke.spec.ts` exclusively exercised the now-deleted `/helper/today`
    claim banner; there was no other e2e test in the repo. Deleted alongside
    it: `tests/support/mock-supabase-server.ts`, `playwright.config.ts`, the
    `@playwright/test` devDependency and `test:e2e` script, and the "Install
    Playwright Browser"/"Run e2e" steps in `.github/workflows/ci.yml`
    (originally added by C4, fixed further by C22).
- **Verification:** `tsc --noEmit`, `eslint` (touched files clean; repo-wide
  CRLF noise is the same pre-existing/unrelated issue as C22), the Vitest
  suite, and a full `vite build` all pass clean -- the build's own chunk list
  confirms no `helper-*` SSR chunk is emitted anymore, and `routeTree.gen.ts`
  regenerates with zero `/helper` entries. `npm install` re-run to sync
  `package-lock.json` after the Playwright removal.
- **Known residual limitation, not closed by this fix:** This repo now has
  **zero end-to-end test coverage** -- the only e2e test existed to test the
  surface just deleted. A real manager-facing smoke test (e.g. "manager logs
  in, Pass board loads") is separate future work; `tests/support/
mock-supabase-server.ts`'s stub-Supabase-server approach is reusable for
  that (it already stubs `auth/v1/user`/`user_profiles`/`helper_profiles`;
  it would need `tickets`/`households` stubs added too), but was deleted
  here rather than built out, to keep this pass scoped to deletion.
- **Follow-up, same day:** `inviteHelperFn`'s returned `inviteUrl`
  (`/claim?code=...`) pointed at a `/claim` route that never existed in this
  app and was confirmed to have zero readers (`grep -rn "inviteUrl" src`) --
  `use-invites.ts`'s `create()` only ever consumed `result.helperId`/
  `.inviteCode`. Removed the dead field and its string entirely; `status`
  stays on the return shape (a real, if currently unconsumed, part of the
  contract -- not a dangling reference like `inviteUrl` was).

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
