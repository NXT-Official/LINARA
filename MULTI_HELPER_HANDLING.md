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
  to `null`, meaning "follow the availability-aware default"), exposed via
  `AppStores.utosRecipientId` / `.setUtosRecipientId`.
- **The default itself is availability-aware** (2026-08-15, KNOWN_GAPS.md
  C29): `defaultUtosRecipientId` walks `activeHelpers` and picks the first
  one whose `statusFor(...)` status isn't `"off"`, falling back to
  `currentHelperId` (most-recently-invited) only when nobody is reachable.
  Previously it was always `currentHelperId`, regardless of whether that
  helper was actually on-shift.
- `QuickUtosLauncher` renders a real `<select>` recipient picker whenever
  `activeHelpers.length > 1` (a single-helper household keeps the old plain
  "Send a small ask to {name}" text — no picker needed). The picker's option
  order is a **local, alphabetical-by-name copy** of `activeHelpers`, not the
  shared array's newest-invited-first order (also C29) — chosen over
  live-availability ordering so options don't reshuffle under the manager
  while the dropdown is open.
- `insertUtoFn` writes to the picked recipient's real id, not
  `currentHelperId`.
- The AI's `suggestedStation` is **surfaced, not auto-applied**: if exactly
  one active helper staffs the suggested station and it differs from who's
  currently selected, a toast says so and names them, so the manager can
  switch the picker next time. It never silently reroutes an in-flight send
  — an AI guess about who a message is "usually" for isn't grounds to
  redirect a manager's actual choice. See `use-send-gate.ts`'s `sendUtos`.
- **"Start new day" now clears every active helper's Quick Utos,
  household-wide** (2026-08-15, KNOWN_GAPS.md C30). Previously
  `clearForNewDay()` only ever deleted the *current recipient's* rows
  (`toHelperId`), silently leaving a second helper's pending utos untouched.
  `app-store-provider.tsx`'s composite `startNewDay`/auto-rollover path now
  calls `clearAllUtosForHelpersFn` directly with every active helper's id,
  not `useUtos`'s (now-removed) single-recipient `clearForNewDay`.

### Ledger — fixed (for Quick Utos completions)

Previously: `onDone` (the callback that fires when a helper marks a Quick
Utos "done" after-hours) credited the 5-minute after-hours entry to
`currentHelperId`, regardless of who the utos was actually sent to. A picked
recipient ≠ `currentHelperId` would have her ledger entry silently attributed
to someone else.

Now: `QuickUtos` carries a real `toHelperId` (set from `quick_utos.recipient_id`
on read), and `onDone`'s `ledger.record({ helperId: u.toHelperId })` uses
that instead of the ambient `currentHelperId`.

**Task completions — fixed (2026-10-02, KNOWN_GAPS.md O25 → C76):** these used
to go through the same `ledger.record`, which drops any completion whose
helper isn't `currentHelperId`, and only when a manager clicked Done on the
web. Now the database records them (`supabase/add-ticket-ledger.sql`'s trigger
on `tickets`), for the task's own `helper_id`, whichever app closed it, and
the web no longer calls `record` for tasks.

**Still open:** `record` keeps its `completion.helperId !== currentHelperId`
early return, so a Quick Utos done by any helper other than the first active
one still records nothing, despite the `toHelperId` fix above.

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

**Status: applied and live.** `add-helper-manual-availability.sql` has been
run: a read of `helper_profiles.manual_status, manual_available_until` as the
test manager returned both columns (2026-10-03). This section used to say
the migration wasn't applied yet; that was true when it was written
(2026-08-15).

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

**Links into Money (fixed 2026-10-06).** The Pass's Needs You box links to
Money for one helper's unpaid pay periods ("Unpaid pay period") and for an
outside-Linara payment she disputed. Both linked to a bare `/manager/money`,
which opens on the default helper, so on a two-helper household "Pay from
Money" under Ate Marites could open Kuya Marito's pay. The Money route now
takes `?helper=<id>` (`src/routes/_app/manager/money.tsx`), `ManagerMoneyPage`
opens on that helper until the manager switches, and when it came from that
link it scrolls to her unpaid periods (`MissedPeriodsCard`, `#owed-pay`). The
unpaid-pay button also now says "Pay by GCash or Maya", which is what Money
offers since direct pay (KNOWN_GAPS O35).

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

**Linking to a page about one helper:** say which helper in the link. Money
takes `search: { helper: id }`. A bare link opens on the default helper, which
is the wrong person whenever the household has more than one.

**Picking or listing helpers in a large household** (KNOWN_GAPS.md O36):
use `HelperPicker` (`src/features/teams/components/helper-picker.tsx`), never
a plain `<select>` of `activeHelpers`. It stays the plain select for a small
household and becomes searchable and grouped by team past `LARGE_STAFF`
(8) or once the household has teams. A view that lists helpers should run
them through `useStaffScope()` (`apply` to filter by name/team/labels,
`group` to group by team) and show `StaffScopeBar`. The Pass's single
`RosaStatusChip` (which reads `currentHelperId`) is now only shown for a
one-helper household; with more, the Pass shows "X of Y on shift" from
`statusFor()` per helper.

**Staff shared from another household** (KNOWN_GAPS.md O39): `activeHelpers`
now includes people employed by another household of the family who also
work here (`Helper.sharedFrom` names it). Anything about pay, leave or
payroll must use `employedHelpers` instead: this household doesn't pay them,
and their pay fields are zero placeholders. `staffProfiles` is the matching
row list for schedules, availability and the send gate.
