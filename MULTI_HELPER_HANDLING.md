# Multi-Helper Handling

How this app decides *which helper* a given manager-facing action is about,
where that still breaks down for a household with more than one active
helper, and what's already fixed vs. still open. Read this before touching
Quick Utos, the Ledger, Availability/the friction wall, or the Pay Dial.

---

## 1. The mechanism

Most of this app's helper-scoped state ultimately traces back to one value:
`currentHelperId`, computed in `app-store-provider.tsx`:

```ts
const helper = activeHelpers[0] ?? null;
const currentHelperId = helper?.id ?? null;
```

`activeHelpers` comes from `listHelperProfilesFn` (`people.actions.ts`),
ordered `created_at DESC` — so `currentHelperId` is **the most recently
invited active helper**, not a stable "primary" helper and not something a
manager ever explicitly chooses. It exists because this app has no real
per-helper auth session of its own (`LINARA_MOBILE` does — see
`AGENTS.md`'s Privacy Wall / `helper_notes` RLS); `currentHelperId` was
originally a stand-in for "the one helper with a first-class device."

The instability is the actual bug: invite a second helper, and the moment
they claim their account, `currentHelperId` silently retargets to them —
every feature below follows along with no visible change in the UI.

---

## 2. Per-area status

### Quick Utos — fixed

Previously: zero recipient concept. `useUtos` was instantiated once with
`toHelperId: currentHelperId`; `QuickUtosLauncher` had no picker; every
Quick Utos, regardless of content, went to whichever helper happened to be
"current." The AI Router's `suggestedStation` (Yaya/Cook/Laundry/Driver/
House — see `aiagent.md` Agent 3) was computed correctly but only ever fed a
toast message, never a recipient decision.

Now:
- `app-store-provider.tsx` holds an explicit `pickedUtosHelperId` (defaults
  to `null`, meaning "follow `currentHelperId`"), exposed via
  `AppStores.utosRecipientId` / `.setUtosRecipientId`.
- `QuickUtosLauncher` renders a real `<select>` recipient picker whenever
  `activeHelpers.length > 1` (a single-helper household keeps the old plain
  "Send a small ask to {name}" text — no picker needed).
- `insertUtoFn` writes to the picked recipient's real id, not
  `currentHelperId`.
- The AI's `suggestedStation` is **surfaced, not auto-applied**: if exactly
  one active helper staffs the suggested station and it differs from who's
  currently selected, a toast says so and names them, so the manager can
  switch the picker next time. It never silently reroutes an in-flight send
  — an AI guess about who a message is "usually" for isn't grounds to
  redirect a manager's actual choice. See `use-send-gate.ts`'s `sendUtos`.

### Ledger — fixed (for Quick Utos completions)

Previously: `onDone` (the callback that fires when a helper marks a Quick
Utos "done" after-hours) credited the 5-minute after-hours entry to
`currentHelperId`, regardless of who the utos was actually sent to. A picked
recipient ≠ `currentHelperId` would have her ledger entry silently attributed
to someone else.

Now: `QuickUtos` carries a real `toHelperId` (set from `quick_utos.recipient_id`
on read), and `onDone`'s `ledger.record({ helperId: u.toHelperId })` uses
that instead of the ambient `currentHelperId`.

**Not audited by this pass:** other ledger-affecting flows (e.g. whatever
computes task-completion after-hours time, if anything does yet) — worth a
separate check before assuming the whole Ledger feature is multi-helper-safe.

### Availability / friction wall — fully fixed, including the manual opt-in

**The friction wall bug wasn't Quick-Utos-specific — it already existed for
Tasks, live, before this pass.** `use-send-gate.ts`'s `addTask` compared
`t.helperId === currentHelperId` before deciding whether to show the
off-shift warning. Assigning a task to *any other* helper — even one
genuinely on her rest day — skipped the friction wall entirely, silently.

Fixed (2026-08-14) by extracting the schedule-derived half of
`useAvailability`'s status computation into a pure function,
`statusFor(helperId, schedules, nowTs, manual?)` (`availability.utils.ts`).
`useSendGate` calls this for whichever helper an action actually targets —
the Quick Utos recipient, or a task's own `helperId` — instead of comparing
against one fixed id. This fixed both the newly-exposed Quick Utos case and
the pre-existing Task one, by construction (same code path).

**The manual opt-in itself was fixed next (2026-08-15), not left open.**
Investigation found it was real and *actively used* on `LINARA_MOBILE`'s
Today tab (`DignityHeader`/`RosaAvailControl`, not dead code) but only ever
written to that device's own local storage — `AsyncStorage` on mobile,
`localStorage` on web — never Supabase, so neither app could see the
other's copy. The web app's copy was additionally already unreachable
(`RosaAvailControl`, its only control, was deleted with the vestigial
`/helper` surface in Closed Gap C26).

Closed by making it real, synced data instead of rebuilding a local mock or
removing a working mobile feature:
- `supabase/add-helper-manual-availability.sql` adds
  `helper_profiles.manual_status`/`.manual_available_until` — no RLS change
  needed, `helper_profiles_isolation` is already a plain household-scoped
  policy a claimed helper's own session already satisfies directly.
- `statusFor()` gained a 4th param, `manual: ManualAvailability | null`, and
  a `manualFromRow()` helper to build it from a fetched `helper_profiles`
  row — usable for *any* helper now, not just `currentHelperId`.
- `useAvailability` simplified to read-only (dropped its `localStorage`
  state and the already-unreachable `setAvailable`/`setOff`); `useSendGate`
  dropped its `currentHelperId`/`currentHelperStatus` special-case in favor
  of a uniform `helperProfiles`-driven lookup for every helper.
- `LINARA_MOBILE`: `getMyHelperProfile` fetches the two new columns; new
  `services/api/availability.ts` writes them (helper's own session, her own
  row); `use-rosa-availability.ts` became a pure derivation hook (shift +
  manual status in, `RosaAvailabilityStatus` out) instead of owning
  `AsyncStorage` state itself — the mutation + profile-refetch now live in
  `app/(app)/today.tsx`, matching this app's existing pattern of mutations
  living in screens, not hooks. `DignityHeader`/`RosaAvailControl` needed no
  changes — same UI, real data underneath now.

**Status as of this write-up: code complete on both repos, migration not
yet applied live** (confirmed via the same unauthenticated-PostgREST
`42703` "column does not exist" check used throughout this project) — the
usual "session has no service-role key" posture. Apply
`supabase/add-helper-manual-availability.sql` before relying on this.

### Pay Dial / payslips — fixed

Previously: `SpendAndPayday` and `PayslipHistory` both only ever read
`currentHelperId`'s numbers, pulled straight from `useAppStores()`. A
household with 3 active helpers only ever saw one person's wage/payslip data
on the web Money tab.

**A second, sharper bug found while fixing this:** `LedgerEntry` (the
client-side type in `ledger.types.ts`) had no `helperId` field at all, even
though the underlying `ledger_entries` table's `helper_id` column was
already being fetched (`LedgerEntryRow.helper_id`, `ledger.actions.ts`) —
`use-ledger.ts`'s `toLedgerEntry()` just never mapped it through. This meant
`SpendAndPayday`'s Pay Dial (`totalMin`/`premiumMin`, the rest-owed-minutes
math) summed **every active helper's ledger entries into one dial**,
regardless of whose numbers it claimed to show — not a display gap, a wrong
number, and one that would have stayed wrong even after adding a helper
switcher, since there was nothing to filter *by*.

Fixed by:
- Adding `helperId: string` to `LedgerEntry` and setting it from
  `row.helper_id` in `toLedgerEntry()`.
- `ManagerMoneyPage` gained a local helper switcher (shown when
  `activeHelpers.length > 1`, same `<select>` pattern as Quick Utos) —
  local to that page, not `AppStores`, since nothing else depends on "whose
  pay is being viewed."
- `SpendAndPayday` gained an *optional* `helper` override prop — omitted
  (the Pass board's glance card, `manager-pass-tab.tsx`, which was never
  meant to be helper-switchable), it still reads `useAppStores().helper`
  exactly as before. The Money page passes its switcher's selection.
  Its ledger math now filters `ledger.entries` by the resolved helper's id.
- `PayslipHistory` needed no changes — it already took `helper` as a prop
  and already filtered/targeted correctly by whichever one it was given;
  the gap was entirely in what `ManagerMoneyPage` chose to hand it.

---

## 3. What already worked correctly (untouched, not victims of this pattern)

- The People roster (`PeopleSection`), per-helper wage editing
  (`updateHelperWageFn`), and per-helper Shifts editing
  (`updateHelperScheduleFn`) all operate on a specific selected `Helper` row,
  never through `currentHelperId`.
- Task/Routine/Appointment assignment dropdowns use `activeHelpers` (the
  full list) with a real per-item picker (`new-task-modal.tsx`,
  `new-routine-modal.tsx`, appointment templates) — a manager could always
  assign any of these to any active helper correctly.

---

## 4. If you're extending this

`statusFor(helperId, schedules, nowTs, manual?)` (`src/features/availability/availability.utils.ts`)
is the reusable building block for "is this specific helper reachable right
now" — use it instead of reaching for `currentHelperId` or `availability.status`
whenever the helper in question might not be the ambient "current" one.
`manualFromRow()` (same file) builds its `manual` argument from a fetched
`helper_profiles` row; pass `undefined`/`null` when you don't have one.
