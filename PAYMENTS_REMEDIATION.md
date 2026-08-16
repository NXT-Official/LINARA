# Payments remediation plan (cutoffs, double-pay, rest-owed)

**Status:** in progress. Found 2026-08-16 while investigating an unrelated
Shifts display bug.

- **Session 0 (verify) — COMPLETE.** See "Session 0 — FINDINGS" below; don't
  re-run it.
- **Session A (stop double-pay) — COMPLETE and APPLIED 2026-08-16.**
  `supabase/add-payslip-double-pay-guards.sql` run in the Supabase SQL editor.
  See `KNOWN_GAPS.md` C36, including the deliberate divergence from this doc's
  original partial-index sketch.
- **Session A′ (intent + attempts) — COMPLETE and APPLIED 2026-08-16.**
  `supabase/cleanup-c35-legacy-payslip.sql` then
  `supabase/add-payout-attempts.sql`. Not in the original plan: it was added
  after C36 shipped, because C36 had conflated business idempotency (permanent,
  DB constraint) with transport idempotency (per-attempt, short-lived PSP key),
  which made a *cancelled* payout unrepayable. See `KNOWN_GAPS.md` C37. This
  also absorbed most of what Session D was going to be — the append-only
  `payout_attempts` table supersedes the planned `supersedes_payslip_id`.
- **Session B (Postgres time frame) — COMPLETE and APPLIED 2026-08-17.**
  `supabase/add-household-timezone-and-cutoffs.sql`. See `KNOWN_GAPS.md` C38.
- **Session C (rest-owed) — DECIDED, COMPLETE and APPLIED 2026-08-17.**
  `supabase/add-rest-off-requests.sql`. **Decision: after-hours work is TIME,
  not money** — rest owed accrues in hours/minutes and is redeemed by the
  kasambahay requesting a date + range that a manager approves. **Rest-day
  premium is explicitly NOT paid in cash** (confirmed 2026-08-17): rest-day
  work resolves through the same day-off request as everything else, so there
  is no peso path anywhere in the payout code. See `KNOWN_GAPS.md` C39.
- **Session D (records and reconciliation) — mostly SUPERSEDED** by Session A′'s
  `payout_attempts` table, which already provides the per-attempt audit trail
  the planned `supersedes_payslip_id` was for. What remains of it is folded
  into Session E below.
- **Session E (remaining gaps) — NOT STARTED.** The accumulated residual
  limitations from C35–C39, gathered with a paste-ready prompt at the bottom of
  this document.

A fourth defect surfaced during Session 0 (Xendit payouts sent at 100x value),
recorded as `KNOWN_GAPS.md` C35. Its code fix had already shipped; the one
mis-valued payout it produced was **cancelled at Xendit 2026-08-16** and
re-verified as `CANCELLED`.

**Why this doc exists:** the payout path has three independent problems, two of
which can move money incorrectly. They are separable, so they're split into
sessions below. Each session block is self-contained: scope, the decisions a
human has to make, acceptance criteria, and a paste-ready prompt.

**Environment — corrected 2026-08-16, read this before trusting any urgency
language below.** Earlier revisions of this doc said `payslips`/`vales` were
"LIVE with real payslips and vales." That is **wrong** and it inflated the risk
posture throughout. The reality: there is exactly **one** Supabase project, it
holds **sandbox/test data only**, and the paired Xendit account is **sandbox**.
The payout path is "live" only in the sense that the code executes end to end
and really does call Xendit. No real household, no real money, no real
kasambahay payroll records yet.

What that changes: **data** is disposable (rows can be deleted rather than
migrated around), but **schema** caution is unchanged — it is the only project,
and every migration is still applied by hand. What it does *not* change is the
defect analysis; all four defects were real. Re-read this note the moment a
real household is onboarded: RA 10361's payslip-retention obligation attaches
then, and several trade-offs accepted here (notably in-place mutation of
payslip rows) were only acceptable *because* the data was disposable.

Read [`AGENTS.md`](AGENTS.md) first as usual. This app owns the schema;
`../LINARA_MOBILE` reads `payslips` (read-only, `services/api/payslips.ts`)
and computes its own *amount* estimate, so Sessions B and C touch both repos.
(It does **not** compute its own cutoff *dates* — an earlier draft said it did.
See the scope correction under Session B item 5.)

**Working agreement — migrations are run by hand.** Anything that changes
schema, policies, functions, or data (i.e. anything landing in `supabase/`)
is applied by the maintainer in the Supabase SQL editor. Sessions write
idempotent SQL into `supabase/` and hand it over — never apply it, never
assume it has been applied. This matches how every prior migration in
`KNOWN_GAPS.md` was landed.

Read-only diagnostics are a different matter: a session may run the Session 0
queries itself if it has read access, or hand them over to be run. Either way
the *findings* are what later sessions depend on.

---

## Start here — prompt for the remediation session

Paste this into a fresh session in the `LINARA` workspace. It drives the whole
remediation; the per-session prompts further down are for splitting the work
across separate sessions if this one gets long.

```
You're picking up a payments remediation in the LINARA repo. Read AGENTS.md,
then PAYMENTS_REMEDIATION.md in full before doing anything — it has the
evidence, the plan, and the diagnostic queries.

Context: LINARA is a Filipino household-staff management app. The payout path
(Supabase + Xendit) runs end to end and really calls Xendit, but the single
Supabase project holds sandbox/test data only and the Xendit account is
sandbox -- no real money, no real payroll records yet. A 2026-08-16 audit
found three defects, none fixed:

  1. Double-pay is reachable two ways — a retry after an ambiguous failure
     re-sends with a fresh Idempotency-key, and the EXISTS-then-INSERT guard
     in initiate_payslip has no unique constraint behind it, so it races.
  2. Cutoff dates are timezone-broken. currentCutoffRange formats a
     local-component Date with toISOString(), and it runs on BOTH the server
     (which writes cutoff_start/cutoff_end) and the browser (which looks up
     the current cutoff), so they disagree and the Pay button never becomes a
     status badge — which is what invites the double click.
  3. Rest-owed hours show in the manager's Pay Dial as pesos but are never
     paid; initiate_payslip never reads ledger_entries at all.

Working agreement, important:
- I run all migrations myself in the Supabase SQL editor. Write idempotent
  SQL into supabase/ and hand it to me. Never try to apply it, and never
  assume it has been applied.
- Read-only diagnostic queries are fine for you to run if you have access;
  otherwise give them to me and I'll paste back results.
- LINARA owns the schema. ../LINARA_MOBILE reads payslips and computes its own
  cutoff estimate, so check it in the same pass — we already shipped one
  cross-repo miss this way (KNOWN_GAPS.md C33).

Order of work — do not reorder without telling me why:
  Session 0 (verify) -> A (stop double-pay) -> B (Postgres time frame) -> C.

Start with Session 0. Run Q3 first: if it returns rows, a helper has already
been double-paid and we stop and reconcile against Xendit before touching
anything else. Report the findings and your read of them, then wait for my go
before starting Session A.

Do NOT start Session C. It needs a product decision from me first — whether
after-hours work is paid in cash or is time-off-in-lieu — and I haven't made
it yet.

Two design points I've already decided, so don't re-litigate them unless you
find something that breaks them:
- Cutoffs and civil dates get derived in Postgres via
  (now() at time zone <household tz>)::date, on the same frame as the
  existing server_now() used by the board rollover. Not in JS.
- Prefer a households.timezone column defaulting to 'Asia/Manila' over a
  hardcoded constant.

Add KNOWN_GAPS.md entries as you close things, matching the existing format.
```

---

## What's confirmed

Evidence gathered 2026-08-16 by reading the code; **no live DB was queried**,
so anything about production *data* is marked as needing verification.

### 1. Double-pay is reachable two ways — highest severity

**Vector A — retry after an ambiguous failure.** `initiate_payslip`'s guard
([`supabase/add-payslips-table.sql:158-166`](supabase/add-payslips-table.sql))
blocks a repeat payslip for the same cutoff *except* when the prior row is
`payout_status = 'failed'`. But
[`src/features/pay/pay.actions.ts`](src/features/pay/pay.actions.ts)'s catch
block marks `failed` on **any** throw after the Xendit `fetch` — including a
JSON-parse error, a timeout, or a dropped connection *after* Xendit already
accepted the payout. It also unsettles the vales. The manager then sees
"Failed", clicks Pay again, and a second real payout goes out.

The `Idempotency-key` does not save us: `referenceId` is a fresh
`crypto.randomUUID()` generated per attempt (`pay.actions.ts:96`), so each
retry is a *different* request as far as Xendit is concerned. Xendit's
idempotency only collapses retries carrying the **same** key.

**Vector B — TOCTOU race.** The RPC does `IF EXISTS (...) RAISE EXCEPTION`
then `INSERT`, with **no unique constraint** backing it. Under Postgres
READ COMMITTED, two concurrent transactions both pass the `EXISTS` check and
both insert. The table's only `UNIQUE` is on `payout_reference_id`, which is a
fresh UUID per call and therefore never collides. The UI's `paying` state
([`payslip-history.tsx:52`](src/features/pay/components/payslip-history.tsx))
guards a single component instance only — two managers (primary + co), or one
manager in two tabs, defeats it.

### 2. Cutoff dates are timezone-broken, and client and server disagree

[`src/features/pay/pay.utils.ts`](src/features/pay/pay.utils.ts)'s `isoDate`
calls `toISOString()` (UTC) on a `Date` built from **local** components.
Verified by running the function under different `TZ` values:

| `TZ` | `Aug 10 04:00Z, semi_monthly` | `Aug 16 04:00Z, semi_monthly` |
| --- | --- | --- |
| `UTC` | `2026-08-01 → 2026-08-15` ✅ | `2026-08-16 → 2026-08-31` ✅ |
| `Asia/Manila` | `2026-07-31 → 2026-08-14` ❌ shifted back a day | `2026-08-15 → 2026-08-30` ❌ |
| `America/Los_Angeles` | `2026-08-01 → 2026-08-15` ✅ | `2026-08-01 → 2026-08-15` ❌ wrong cutoff |

**Corrected 2026-08-16 (Session 0).** An earlier draft of this table claimed
`America/Los_Angeles` also shifted back a day. It does not — re-running the
real function shows the bug is **one-directional**: only positive UTC offsets
shift, because local midnight renders to the *previous* day in UTC. Negative
offsets are correct by accident. This doesn't weaken the case, it sharpens it:
`Asia/Manila` (UTC+8) is precisely the broken case, and it's the only zone
that matters in production.

Two consequences the original writeup missed, both visible above:

- **Month-end is silently truncated.** In Manila, `16 → EOM` on 31-day August
  yields `2026-08-15 → 2026-08-30`. **August 31 falls into no cutoff at all.**
  `monthly` is worse: `2026-07-31 → 2026-08-30`.
- **Near a boundary the cutoff *bucket* flips, not just the formatting** — the
  LA column picks the first-half cutoff on Aug 16 because local date is still
  Aug 15. So this cannot be fixed by correcting `isoDate` alone; the day-of-month
  comparison driving the branch is tz-dependent too.

`currentCutoffRange` is called from **both** sides:

- **Server** — `pay.actions.ts:95`, inside `initiatePayoutFn`. This value is
  what gets **written** to `payslips.cutoff_start`/`cutoff_end`.
- **Client** — `payslip-history.tsx:57`, in the manager's browser (Philippines
  → `Asia/Manila`). This value is only used to *find* the current cutoff's
  payslip.

So if the server runs UTC (Vercel's default — **not confirmed**, see Session 0)
the stored dates are correct by accident, but the browser looks for
`2026-07-31` and the row says `2026-08-01`. `currentCutoffPayslip` is then
always `undefined`, meaning **the "Pay via GCash/Maya" buttons keep showing
after a successful payout and no status badge ever appears for the current
cutoff.** That is precisely the state that invites the repeat click Vector A/B
then acts on — so #2 is the trigger and #1 is the loaded gun.

If the server does *not* run UTC, stored dates are wrong too and existing rows
need a backfill. Session 0 settles which world we're in.

### 3. Rest-owed hours are displayed as pay but never paid

[`spend-and-payday.tsx:70-73`](src/features/dashboard/components/spend-and-payday.tsx)
computes `netPay = base - statutory - vales + restOwedEarnings`, at a
hardcoded `restOwedRate = 120`/hour. `initiate_payslip` computes
`base - statutory - vales` and **never reads `ledger_entries` at all**. The
manager's Pay Dial therefore overstates what will actually be sent.

There is also no settlement concept: `ValeRequest` has `settledInPayslipId`,
but `LedgerEntry`
([`src/features/ledger/ledger.types.ts`](src/features/ledger/ledger.types.ts))
has no equivalent, so rest-owed minutes accrue forever and would be
double-counted by any future payout that did include them.

Note `../LINARA_MOBILE`'s `DigitalPayslip` **omits** rest-owed
(`digital-payslip.tsx:31`), matching the real payout formula. So today the
helper sees the accurate number and the manager sees an inflated one.

### 4. Transaction records — adequate, with gaps

`payslips` snapshots `base_pay`/`statutory_employee_share`/`vale_deductions`/
`net_pay` at payout time (deliberate, so a later wage change doesn't rewrite
history — same reasoning as C10's `ledger_entries.title`), plus channel,
unique `payout_reference_id`, Xendit's `payout_external_id`, status,
`failure_reason`, `requested_by`, `requested_at`, `confirmed_at`. The webhook
([`supabase/functions/xendit-payout-webhook/index.ts`](supabase/functions/xendit-payout-webhook/index.ts))
is idempotent on terminal states. Vales get real per-cutoff settlement.

Gaps: nothing links a retry to the failed attempt it superseded; `pending_send`
has no staleness detection (already noted in C21); rest-owed has no records at
all; and there's no reconciliation report against Xendit's own ledger.

---

---

## The time frame this should all be built on

There is already a server-authoritative clock in this app, added for the board
rollover: `public.server_now()`
([`supabase/add-server-now-function.sql`](supabase/add-server-now-function.sql),
C32), read via `getServerNowFn`. Its rationale is exactly the one payroll
needs — Postgres's clock is infra-managed and NTP-synced, and a device clock or
a misconfigured timezone must not be able to move a real, irreversible action.
Cutoffs should sit on that same frame rather than inventing a second one.

**Adopt one rule: a calendar day that gets persisted or compared is computed in
Postgres, in an explicit household timezone — never from a client `Date`.**

Concretely, `(now() AT TIME ZONE 'Asia/Manila')::date`. Postgres `now()` is
`timestamptz` (an instant); `AT TIME ZONE` renders it in a named civil zone;
`::date` takes the calendar day *in that zone*. That is immune to both the
browser's timezone and the Node/Vercel process timezone, which is why it also
makes Session 0's "what TZ does Vercel run in?" question **moot** — worth
answering for completeness, but nothing should depend on the answer once this
lands.

This replaces the "pin to `Asia/Manila` in JS" suggestion originally written
into Session B below. Doing it in JS would work, but it would be a *second*
source of truth for "what day is it" sitting next to `server_now()`, and the
next drift bug would come from the two disagreeing.

**One caveat this exposes in the existing C32 code, worth fixing in the same
pass:** `app-store-provider.tsx` does
`toISODate(new Date(res.serverNowIso))` — it takes the trustworthy server
*instant* and then renders it to a calendar day in the **browser's** timezone.
So a device with a wrong timezone (as opposed to a wrong clock) still derives
the wrong day from a correct server answer. The cross-check is only partly
server-authoritative today. If `server_now()` gains a companion that returns
the household's civil date directly, that hole closes too and the board and
payroll end up on genuinely the same frame.

**Suggested shape** (exact SQL to be written in Session B, this is the idea):
one RPC returning the household's current civil date *and* the cutoff bounds
derived from it, so web, mobile, and the payout RPC all read the same answer
instead of each computing it. `initiate_payslip` should then derive its own
cutoff internally rather than trusting a client-supplied
`p_cutoff_start`/`p_cutoff_end` — today those are passed in from
`pay.actions.ts`, which means the guard against double-paying a cutoff is only
as trustworthy as the caller's arithmetic.

---

## Ordering

**Session 0 → A → B → C**, with D optional. A is first because it's the only
one that stops money moving incorrectly. B is second because it's what makes a
manager click twice in the first place. C is last because it needs a product
decision, not just a fix.

Do **not** fold A and B into one session: A is schema + RPC + idempotency
semantics, B is date arithmetic across two repos. They fail differently and
want separate verification.

---

## Session 0 — Verify before touching anything (short, no code changes)

Cheap, and it decides the shape of A and B. All read-only — nothing here
writes. Run them yourself in the SQL editor, or let the session run them if it
has read access; what matters is that the findings are recorded before Session
A starts.

### Q1 — Postgres's own clock and timezone

```sql
select
  now()                                    as now_raw,
  current_setting('TimeZone')              as pg_session_tz,
  current_date                             as pg_current_date,
  (now() at time zone 'Asia/Manila')::date as manila_today,
  (now() at time zone 'UTC')::date         as utc_today;
```

Tells us the frame everything should be built on, and whether Manila and UTC
currently disagree about the date (they do for 8 hours out of every 24 — if
you run this in the PH morning they'll match, in the PH evening they won't).

### Q2 — Are stored cutoffs correct, and has anyone been double-paid?

```sql
select
  helper_id,
  cutoff_start,
  cutoff_end,
  payout_status,
  count(*)                        as rows_for_this_cutoff,
  min(requested_at)               as first_attempt,
  max(requested_at)               as last_attempt
from public.payslips
group by helper_id, cutoff_start, cutoff_end, payout_status
order by helper_id, cutoff_start;
```

Two things to read off it: do the date pairs look like `01→15` / `16→EOM`
(server was UTC, dates fine) or `31→14` / `15→30` (server was PH-local, dates
shifted)? And is `rows_for_this_cutoff > 1` for any non-`failed` status?

### Q3 — The duplicate check on its own, stated plainly

```sql
select helper_id, cutoff_start, cutoff_end, count(*) as non_failed_rows
from public.payslips
where payout_status <> 'failed'
group by helper_id, cutoff_start, cutoff_end
having count(*) > 1;
```

**Any row returned here means a helper was already double-paid** and needs
reconciling against Xendit before Session A adds the unique index (the index
creation will fail while duplicates exist, which is a useful forcing
function). An empty result is the expected, good outcome.

### Q4 — Payout states in flight

```sql
select payout_status, count(*), min(requested_at), max(requested_at)
from public.payslips
group by payout_status
order by payout_status;
```

A pile of `processing` that never became `succeeded` means the webhook isn't
landing (see Q6). A `pending_send` older than a few minutes is the stuck state
C21 predicted.

### Q5 — Vale settlement sanity

```sql
select
  count(*) filter (where status = 'approved' and settled_in_payslip_id is null) as approved_unsettled,
  count(*) filter (where status = 'approved' and settled_in_payslip_id is not null) as approved_settled,
  count(*) filter (where settled_in_payslip_id is not null
                     and settled_in_payslip_id not in (select id from public.payslips)) as orphaned
from public.vales;
```

`orphaned` should be 0 (the FK guarantees it — this is a cheap sanity check
that the FK is actually there).

### Q6 — Two dashboard checks, not SQL

- **Xendit:** is the `xendit-payout-webhook` function deployed, is
  `XENDIT_WEBHOOK_VERIFICATION_TOKEN` set, and is Xendit subscribed to
  `payout.succeeded` / `payout.failed` / `payout.reversed`? C21 says this was
  never done. If it isn't live, nothing ever reaches `succeeded`.
- **Xendit docs:** how long is an `Idempotency-key` honored on
  `POST /v2/payouts`, and what comes back on a replayed key? Session A's
  primary defence depends on this.

> **Prompt for Session 0** — only needed if you'd rather an agent drive this
> than run the SQL yourself. If you run it, skip straight to Session A.
>
> ```
> Read AGENTS.md and PAYMENTS_REMEDIATION.md in the LINARA repo. Run the
> Session 0 verification queries in that doc — I'll paste results back, or
> tell me exactly what access you'd need to run them yourself. Do not change
> any code, and do not run anything that writes.
> ```

---

## Session 0 — FINDINGS (completed 2026-08-16)

Raw query output is in `Payments_remidiation_answers.md`. **Session 0 is done;
do not re-run it.** Paste this section into the Session A/B prompts where they
say `<PASTE SESSION 0 FINDINGS HERE>`.

**Q3 — no double-pay has occurred.** Empty result. Session A's partial unique
index will build cleanly; there is exactly one non-`failed` row in the table.

**Q2 — the server ran UTC; stored cutoffs are correct; no backfill needed.**
The single row stores `2026-08-01 → 2026-08-15` with `requested_at
2026-08-14 12:59:41+00`. Under `Asia/Manila` that same instant (20:59 local)
would have produced `2026-07-31 → 2026-08-14`. It didn't, so the server frame
was UTC. Deployment is **Vercel** (per Open Gap O1), whose Node runtime
defaults to UTC — not Cloudflare, despite the `.wrangler/` directory and the
CI job's "Cloudflare Pages" echo line, both of which are stale.

This **removes the A↔B ordering hazard** the Session B acceptance criteria
worried about: there are no mis-dated rows to backfill, so no backfill can
create duplicates for Session A's index to reject.

It also confirms the badge bug was live at the moment of the real payout: the
manager's Manila browser computed `07-31 → 08-14` while the row said
`08-01 → 08-15`, so the "Pay via GCash/Maya" buttons stayed on screen
immediately after a successful send. Q3 being empty is manager discipline, not
a system guarantee. The same mismatch recurs on every payout until Session B
lands.

**Q1 — `pg_session_tz = UTC`**, and `(now() at time zone 'Asia/Manila')::date`
behaves as the design assumes. Manila and UTC agreed on the date at the moment
of the query (07:21Z), so Q1 doesn't discriminate between them on its own —
Q2 is what settles the frame.

**Q4 — one row, stuck in `processing` since 2026-08-14, and it is not a
webhook bug.** See Closed Gap C35: that row was sent to Xendit at 100x its
value by a currency-unit bug fixed 8 minutes after it was created, and the
payout has been pending on Xendit's side ever since. Sandbox money, so nothing
real is exposed.

**No payslip row has ever reached a terminal state.** The webhook subscription
*is* correctly configured (correcting C21's "never done"), and a 10k test
disbursement did succeed — but that was a direct Xendit API call with no
`payslips` row, so `xendit-payout-webhook` writing back into `payslips` is
still unverified end to end. Cancelling the stuck payout would exercise that
path for the first time.

**Q5 — clean.** 0 orphaned, 1 settled (the vale attached to the stuck row; it
returns to the pool if that payout is cancelled), 0 approved-unsettled.

**Q6, Xendit idempotency semantics — partially answered, and it changes
Session A.** A replayed `Idempotency-key` returns a **`DUPLICATE_ERROR`, not
the original payout object**. So Session A's "reuse the reference id" fix must
explicitly treat `DUPLICATE_ERROR` as *"already sent — mark `processing`"*,
or the retry will surface as a fresh failure and invent a new wrong state.
**The retention window is not publicly documented** on either the payouts
integration page or the API reference; it needs a Xendit support answer or an
empirical test before idempotency is leaned on as the primary defence.

**Decisions taken (user-confirmed 2026-08-16):** ambiguous failures get a new
`needs_review` status; a genuine retry **reuses** the same reference id.

**Still unanswered, needed by Session B not A:** what columns
`public.households` actually has, and confirmation that no unique index on
`(helper_id, cutoff_start, cutoff_end)` exists (confirmed from source, not yet
from `pg_indexes`). Neither blocks Session A.

---

## Session A — Make double-pay structurally impossible

**Scope:** `supabase/` (new migration), `src/features/pay/pay.actions.ts`.

**The fix, in order of how much it buys:**

1. **Deterministic `payout_reference_id` per (helper, cutoff).** Instead of a
   fresh UUID per attempt, derive/persist one reference per cutoff so a retry
   sends Xendit the **same** `Idempotency-key`. Xendit then collapses the
   duplicate instead of creating a second payout. This single change kills
   Vector A at the source. Depends on Session 0 item 3 — if Xendit's
   idempotency window is shorter than a realistic retry gap, fall back to
   option 3 below as the primary defence.
2. **Partial unique index** on `(helper_id, cutoff_start, cutoff_end)
   WHERE payout_status <> 'failed'`, so the `EXISTS` guard is actually
   enforced by the DB rather than racing. Then handle `23505` in
   `initiate_payslip` and surface it as the existing friendly "already exists
   for this cutoff" error rather than a raw constraint violation.
3. **Stop treating every post-`fetch` throw as `failed`.** Distinguish
   "Xendit never received this" (safe to retry, keep current behaviour) from
   "we don't know whether Xendit received this" (must not silently re-send).
   Suggest a new `needs_review` status for the ambiguous case, which does
   **not** unsettle vales and does **not** allow a one-click retry — it asks
   the manager to reconcile against Xendit first.

**Decisions needed from a human:**

- Is a `needs_review` state acceptable UX, or should ambiguous failures just
  hard-block and require support intervention?
- On a genuine `failed`, should the retry reuse the same reference id (Xendit
  dedupes, safest) or mint a new one (guaranteed fresh attempt, riskier)?

**Acceptance criteria:**

- Two concurrent `initiate_payslip` calls for the same helper+cutoff produce
  exactly one payslip; the loser gets the friendly error. Prove it with two
  overlapping transactions, not just two sequential clicks.
- A simulated throw *after* a successful Xendit call does not leave the cutoff
  freely re-payable.
- Existing non-`failed` rows don't violate the new index (Session 0 item 2
  confirms this in advance).
- Migration is idempotent and safe to re-run, matching the house style in
  `supabase/*.sql`.

> **Prompt for Session A**
>
> ```
> Read AGENTS.md and PAYMENTS_REMEDIATION.md in the LINARA repo, then do
> Session A: make double-pay structurally impossible. Session 0's findings
> are: <PASTE SESSION 0 FINDINGS HERE>.
>
> The payslips/vales tables are LIVE, so treat this as a production change.
> I run migrations myself in the Supabase SQL editor — write the SQL into
> supabase/ and hand it to me to run, do not try to apply it. It must be
> idempotent and must not break existing rows.
>
> Implement the three fixes described under "Session A" in
> PAYMENTS_REMEDIATION.md. Before you write code, walk me through the two
> decisions that section flags (needs_review UX, and reference-id reuse on
> retry) and recommend one option for each.
>
> For acceptance, actually demonstrate the race is closed — two overlapping
> transactions, not two sequential clicks. Add a KNOWN_GAPS.md entry when
> done.
> ```

---

## Session B — Correct and unify cutoff computation

**Scope:** `src/features/pay/pay.utils.ts`, `payslip-history.tsx`,
`pay.actions.ts`; mirror in `../LINARA_MOBILE` (`digital-payslip.tsx` derives
its own cutoff labelling).

**The fix — build it on the Postgres frame described above, not in JS:**

1. **Add a cutoff RPC in Postgres**, deriving the household's civil date via
   `(now() at time zone <household tz>)::date` and returning both the current
   date and the cutoff bounds for a given `payday_interval`. One source of
   truth, read by web, mobile, and the payout path alike.
2. **Have `initiate_payslip` derive its own cutoff internally** instead of
   accepting `p_cutoff_start`/`p_cutoff_end` from the caller. Right now the
   double-pay guard is only as trustworthy as `pay.actions.ts`'s arithmetic;
   moving the derivation inside the function makes the guard self-contained.
   Coordinate with Session A, which also changes this function.
3. **Delete the client-side `currentCutoffRange`** (or reduce it to pure
   display formatting fed by the RPC), so `payslip-history.tsx` stops deriving
   a date the server never agreed to. This is what makes the status badge
   appear correctly after a payout.
4. **Close the C32 hole in the same pass:** `app-store-provider.tsx` renders
   the trustworthy server instant into a calendar day using the *browser's*
   timezone (`toISODate(new Date(serverNowIso))`). Have it read the household
   civil date from the same RPC instead.
5. Mirror in `../LINARA_MOBILE`. **Scope correction (Session 0, 2026-08-16):**
   this is smaller than the rest of this doc assumes. Mobile has **no**
   cutoff-*date* logic to fix — `lib/cutoff.ts` contains only
   `formatCutoffRange` (display), `digital-payslip.tsx` computes a peso
   estimate and labels it `"This cutoff (half-month)"` with no dates at all,
   and `services/api/payslips.ts` treats `cutoff_start`/`cutoff_end` as opaque
   strings. There is no third copy of the arithmetic to drift. The work here
   is therefore: have `DigitalPayslip` *consume* the new RPC so it can show
   real dates, and make sure no copy gets introduced. Both repos'
   `formatCutoffRange` parse `${iso}T00:00:00` as local and format as local,
   which round-trips correctly — leave them alone.

**Decisions needed:** where the household timezone lives — a real
`households.timezone` column (correct if LINARA ever ships outside PH, and
cheap to add now while there's one household) versus a hardcoded
`'Asia/Manila'` in the RPC (simpler). Recommend the **column**, defaulting to
`'Asia/Manila'`: it costs almost nothing today and avoids a second migration
against live payroll data later.

**Acceptance criteria:**

- The cutoff for a given instant is identical whether asked from the server,
  the browser, or mobile — and does not change when the client's `TZ` changes.
  Test the client-side pieces under `TZ=UTC`, `TZ=Asia/Manila`, and
  `TZ=America/Los_Angeles`; `src/lib/time.test.ts` is the precedent.
- Month-end, month-length, and leap-February boundaries are covered
  (`16 → EOM` on a 28/29/30/31-day month).
- After a successful payout, the manager's Money tab shows the status badge
  and **not** the Pay buttons.
- If Session 0's Q2 found mis-dated stored rows, a backfill migration is
  included and its interaction with Session A's unique index is worked
  through (backfilling dates can *create* duplicates that the index then
  rejects — check before, not after).

> **Prompt for Session B**
>
> ```
> Read AGENTS.md and PAYMENTS_REMEDIATION.md in the LINARA repo, then do
> Session B: put cutoff computation on the Postgres time frame. Session 0's
> findings are: <PASTE SESSION 0 FINDINGS HERE>. Session A is already merged.
>
> Today currentCutoffRange (src/features/pay/pay.utils.ts) builds a Date from
> local components then formats with toISOString() (UTC), so cutoffs shift a
> day in Asia/Manila — and it runs on BOTH the server (which writes
> cutoff_start/cutoff_end) and the browser (which looks up the current
> cutoff), so they disagree and the Pay button never becomes a status badge.
>
> Implement the "Session B" section: derive the household's civil date in
> Postgres via (now() at time zone <tz>)::date, expose cutoff bounds through
> one RPC, have initiate_payslip derive its own cutoff internally, and stop
> the client deriving its own. Add households.timezone defaulting to
> 'Asia/Manila' unless you can argue me out of it. Also fix the C32 hole in
> app-store-provider.tsx, which renders the server instant into a day using
> the browser's timezone. Mirror in ../LINARA_MOBILE.
>
> I run migrations myself in the Supabase SQL editor — give me the SQL to run
> rather than trying to apply it, and make it idempotent.
> ```

---

## Session C — Decide and implement rest-owed treatment

**This is a product decision first, a code change second.** Do not start it
until someone answers: **is after-hours / rest-owed work paid out in cash, or
is it time-off-in-lieu?** `plan.md`'s after-hours ledger describes accrual and
a `rest`/`premium` resolution but (per this investigation) never says the
`premium` path reaches a payout.

- **If it is paid:** add a settlement column to `ledger_entries` mirroring
  `vales.settled_in_payslip_id`, include the premium total in
  `initiate_payslip`'s `net_pay`, snapshot it as its own payslip column, and
  make the ₱120/hr rate real configuration rather than a literal in
  `spend-and-payday.tsx`. Then mobile's `DigitalPayslip` must add it too, or
  helper and manager go back to disagreeing.
- **If it is not paid:** remove `+ restOwedEarnings` from the Pay Dial so web
  matches mobile and reality, and relabel the rest-owed display as
  time-owed rather than pesos.

**Acceptance criteria:** the manager's Pay Dial, the helper's
`DigitalPayslip`, and the actual `net_pay` written by `initiate_payslip` all
agree for the same helper and cutoff. That's the invariant worth testing,
whichever way the decision goes.

> **Prompt for Session C**
>
> ```
> Read AGENTS.md, PAYMENTS_REMEDIATION.md, and plan.md's after-hours ledger
> section in the LINARA repo. Sessions A and B are merged.
>
> Decision already made: rest-owed / after-hours work IS / IS NOT paid out in
> cash — <FILL THIS IN>.
>
> Today the manager's Pay Dial (spend-and-payday.tsx) adds rest-owed earnings
> at a hardcoded 120/hr, but initiate_payslip never reads ledger_entries, and
> LINARA_MOBILE's DigitalPayslip omits it — so manager, helper, and the real
> payout all disagree. Implement the branch above per the "Session C" section
> of PAYMENTS_REMEDIATION.md.
>
> The invariant I want tested: Pay Dial, DigitalPayslip, and the net_pay
> actually written by initiate_payslip agree for the same helper and cutoff.
> ```

---

## Session D — Records and reconciliation (optional, lowest urgency)

Only worth doing once A–C are settled.

- Staleness detection for `pending_send` (C21 flagged this and accepted it;
  with live money it deserves revisiting).
- Link a retry to the attempt it superseded (`supersedes_payslip_id`), so the
  history explains itself.
- A reconciliation view: our `payslips` vs Xendit's payout ledger, to catch
  exactly the ambiguous-failure case Session A defends against.

---

## Session E — Close the residual gaps (the current backlog)

Everything below is a *known, recorded* limitation from C35–C39, not new
discovery. Nothing here is load-bearing for correctness of the payout path —
A, A′, B and C are applied and the money path is sound. These are the rough
edges those sessions deliberately left, gathered in one place.

Grouped by what they need, because they are not one kind of work:

**E1 — Verify against the real Xendit sandbox (no code until it's observed).**
Three things were built defensively because they could not be confirmed:
- `xendit-payout-webhook` writing back into `payslips` has **never been
  observed end to end** (C35). Config is correct and a direct disbursement
  succeeded, but no payslip row has ever reached a terminal state through it.
- The duplicate-detection match in `pay.actions.ts` (HTTP 409, or a
  duplicate/idempotency hint in the body) is a guess at Xendit's shape (C37).
- The `GET /v2/payouts?reference_id=` response is assumed to be either a bare
  array or `{data:[…]}` (C37). The whole ambiguous-outcome reconciliation path
  depends on parsing it correctly.
- Xendit's idempotency **retention window** is undocumented (C36/Session 0 Q6).
Do a real sandbox payout, let the webhook land, force a duplicate, and read the
actual payloads. Then tighten the parsing to what was observed and delete the
defensive guesses.

**E2 — Per-worker resolution default (the one real gap against the concept).**
`home-management-concept.md` says "keep the resolution type flexible per
worker: a live-out day helper leans back toward an hourly/OT model, while a
live-in accrues rest owed." Not true today: the rest-vs-premium default is
`useState<LedgerResolution>("rest")` in `use-ledger.ts` — **ephemeral client
state, household-wide, reset on reload, not keyed to a helper**.
`helper_profiles.employment` ('live-in'/'live-out') already exists and is
collected at invite time. Closing it means a persisted
`helper_profiles.default_resolution` seeded from `employment`, with
`recordLedgerEntryFn` reading it per helper instead of taking whatever a shared
UI toggle happens to be set to. Note this is *lower* stakes than it looks now
that rest-day premium is not paid in cash — every resolution ends in the same
mechanism — but it is the last thing standing between the concept doc and the
code.

**E3 — Rest-off request UX and validation (C39 residuals).**
- Mobile takes date/time as typed text (`YYYY-MM-DD` / `HH:MM`); native
  pickers would be kinder and remove a whole class of input error.
- `rest_date` is not validated against the household's *today* (C38 gave us
  `household_today()` — use it), so a past date can be requested.
- No cancel path for a pending request. The `cancelled` status exists in the
  CHECK constraint and nothing ever sets it.
- Nothing checks a requested window against the helper's actual shift, or
  against an existing approved window on the same day.

**E4 — The invariant test Session C never wrote.**
The stated acceptance criterion was: the manager's Pay Dial, the helper's
`DigitalPayslip`, and the `net_pay` actually written by `initiate_payslip` all
agree for the same helper and cutoff. They *do* agree now, but by construction
(the peso line was removed) rather than by assertion. A regression test would
stop the next person reintroducing a ledger term into one of the three.

**E5 — Reconciliation and staleness (what's left of Session D).**
- `pending_send` has no staleness detection (C21 accepted it; with a real
  payout path it deserves revisiting).
- No reconciliation view of our `payslips`/`payout_attempts` against Xendit's
  own ledger. C35 is a worked example of exactly the divergence it would catch
  — our row said ₱3,562.50 while Xendit had ₱356,250.
- `households.timezone` has no UI (C38). Fine while every household is in PH.

**E6 — Append-only payslips, if and when real payroll lands.**
A payslip's snapshot is still **mutated in place** on retry, so
`payout_attempts` is the authoritative history and `payslips` is a cache of the
latest attempt (C37). Acceptable while data is disposable. RA 10361's
payslip-retention obligation attaches the moment a real household is onboarded
— revisit before that, not after.

> **Prompt for Session E**
>
> ```
> Read AGENTS.md, then PAYMENTS_REMEDIATION.md and KNOWN_GAPS.md C35-C39 in
> the LINARA repo. Sessions 0, A, A', B and C are done and their migrations
> are applied; the payout path is correct. This session is the backlog of
> residual gaps those sessions deliberately left, written up as "Session E"
> in PAYMENTS_REMEDIATION.md.
>
> Context you need up front:
> - One Supabase project, sandbox/test data only, sandbox Xendit account. No
>   real household, no real payroll records. Data is disposable; schema is
>   not. This reverses the moment a real household is onboarded.
> - After-hours work is TIME, not money. Rest-day premium is NOT paid in
>   cash - rest-day work resolves through the same day-off request flow as
>   everything else. There is no peso path in the payout code and I do not
>   want one added.
> - I run all migrations myself in the Supabase SQL editor. Write idempotent
>   SQL into supabase/ and hand it to me. Never apply it, never assume it has
>   been applied.
> - LINARA owns the schema; ../LINARA_MOBILE must be checked in the same pass
>   (KNOWN_GAPS.md C33 is the cautionary tale).
> - Docker is available and previous sessions verified every migration
>   against a throwaway postgres:15-alpine before handing it over, including
>   concurrent-transaction tests. That caught two real bugs in Session C's
>   first draft. Keep doing that - do not just reason about correctness.
>
> Do E1 FIRST and report back before writing code for it. It is the only item
> that can invalidate the others: it verifies the webhook end to end and
> replaces three defensive guesses in pay.actions.ts with observed Xendit
> behaviour. I can drive the sandbox calls if you tell me exactly what to run.
>
> Then propose an order for E2-E6 with your reasoning and let me pick. Do not
> attempt all of them in one session - E3 alone is a real chunk of UI work
> across both repos.
>
> Add KNOWN_GAPS.md entries as you close things, matching the existing
> format, and keep home-management-concept.md's implementation-status note
> honest - E2 in particular is called out there as the one gap against that
> section.
> ```

---

## Cross-repo checklist

Per [`AGENTS.md`](AGENTS.md), this repo owns the schema. Any session here that
changes `payslips`, `vales`, or `ledger_entries` must check
`../LINARA_MOBILE/services/api/payslips.ts` and
`components/features/pay/` in the same pass — mobile reads `payslips`
directly and computes its own amount estimate (not its own cutoff dates —
see Session B item 5). The break-columns miss logged
as `KNOWN_GAPS.md` C33 (2026-08-16) is exactly this failure mode; don't repeat
it.
