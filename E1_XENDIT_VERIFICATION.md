# E1 — Xendit sandbox verification runbook

**Purpose:** replace three defensive guesses in
[`src/features/pay/pay.actions.ts`](src/features/pay/pay.actions.ts) and one
never-observed path with *observed* Xendit behaviour, before any E2–E6 code is
written. See `PAYMENTS_REMEDIATION.md` → Session E → E1.

**Nothing here changes application code.** Steps 1 and 2 are read-only against
our DB; steps 3–4 delete and rewrite sandbox rows (disposable by the
environment note in `AGENTS.md` / `KNOWN_GAPS.md`), and step 3 temporarily
edits one helper's phone number.

**Status:** NOT RUN. Paste raw output into the `Observed` blocks — verbatim,
including HTTP status lines. Redact only the API key.

---

## The four questions this must answer

| # | Question | Where it bites today | Answered by |
| --- | --- | --- | --- |
| Q-A | Does `xendit-payout-webhook` actually write back into `payslips`? | C35 — never observed end to end. Config is right and a direct disbursement succeeded, but no payslip row has ever reached a terminal state. | Step 2 |
| Q-B | What does a replayed `Idempotency-key` really return? | `pay.actions.ts:346` — `response.status === 409 \|\| /duplicate\|idempotency[ -]?key/i` is a guess (C36/C37). | Step 1, probes 1C + 1D |
| Q-C | What shape is `GET /v2/payouts?reference_id=`? | `lookupXenditPayout` (`pay.actions.ts:75-78`) assumes *either* a bare array *or* `{data:[…]}`. The whole ambiguous-outcome recovery path depends on parsing it. | Step 1, probe 1B |
| Q-D | How long is an `Idempotency-key` retained? | Undocumented (Session 0 Q6). Nothing depends on it now that keys are per-attempt (C37) — but the answer decides whether it stays that way. | Step 4 (+ support ticket) |

### What the docs already say (August 2026) — to be *confirmed*, not trusted

Read before running, because two of these contradict what's currently recorded
in our own docs:

1. **Test mode has deterministic outcomes.** Any valid `account_holder_name` +
   `account_number` → the payout reaches **`SUCCEEDED`**. Specific numbers force
   failures: `98018521` → `TRANSFER_ERROR`, `123456` →
   `TEMPORARY_TRANSFER_ERROR`, `999999` → `REJECTED_BY_CHANNEL`, `121212` →
   `INVALID_DESTINATION`. (Sanction-screening pairs also exist: holder
   `Walter Green` + `72019761`, holder `Walter White` + `79018761`.)
   → This is what makes step 2 and step 3 deterministic rather than a wait.
2. **A replayed idempotency key is *not* simply an error.** Current docs:
   *identical* payload → **returns the original payout response**; *different*
   payload → **`DUPLICATE_ERROR`** (the payouts guide also names it
   `DUPLICATE_PAYOUT_ERROR`). **This contradicts `PAYMENTS_REMEDIATION.md`'s
   Session 0 Q6 finding** ("a replayed key returns a DUPLICATE_ERROR, not the
   original payout object"), which was recorded as unconditional. Probes 1C and
   1D exist to settle which is true against the live sandbox, and the answer
   changes `pay.actions.ts`'s duplicate branch either way.
3. **Retention window: still undocumented.** No page states it. Step 4 measures
   it empirically; the support question is drafted at the bottom.
4. Webhooks carry `event` + `data.reference_id` and an `x-callback-token`
   header, and Xendit expects a 200 within **30s** or marks the delivery failed
   and retries. Our function ack-200s unknown references, so that's already
   satisfied — confirm it in the dashboard's delivery log anyway.

Sources: [Payout test scenarios](https://docs.xendit.co/docs/test-scenarios-payouts),
[Testing your integration](https://docs.xendit.co/api-payouts-beta/testing-payouts),
[Payouts integration](https://docs.xendit.co/docs/integration-payouts),
[Payout webhook](https://docs.xendit.co/apidocs/payout-webhook-notification).

---

## Step −1 — Pre-flight — **CONFIRMED 2026-08-17, do not re-check**

Maintainer confirmed all four checks below pass: the Edge Function is deployed
with its verification token set, the Xendit **test-mode** webhook points at it
with the payout events subscribed, and the sandbox has test balance. Recorded
here so no future session re-runs this; re-verify only if the Supabase project
or the Xendit account changes.

Note what this does and does not settle. It confirms **configuration** — the
same thing Session 0 Q6 confirmed. It does **not** confirm **delivery**, which
is C35's actual open sub-item and what steps 1E and 2 exist to observe. Do not
let this checkmark stand in for those.

<details>
<summary>The four checks, kept for the record</summary>

1. **Local env — already verified 2026-08-17.** `.env` has
   `XENDIT_SECRET_WRITE_KEY=xnd_development_…` (sandbox ✅) and
   `XENDIT_SECRET_READ_KEY`. `XENDIT_API_URL` is **not set**, so the code falls
   back to `https://api.xendit.co` — correct: Xendit uses one host for both
   modes and the *key* selects test mode. Nothing to change.
2. **`XENDIT_WEBHOOK_VERIFICATION_TOKEN` is not in `.env` and should not be** —
   it belongs to the Edge Function, set via `supabase secrets set`. Confirm in
   **Supabase → Edge Functions → `xendit-payout-webhook`** that the function is
   deployed and the secret exists. If it's missing, every callback gets a 401
   and steps 1E/2 will look like non-delivery when they're really auth
   failures.
3. **Xendit dashboard, in TEST mode** (the mode toggle matters — webhook
   settings are per-mode): the payout webhook URL must be
   `https://<project-ref>.supabase.co/functions/v1/xendit-payout-webhook`, the
   verification token must match the Supabase secret, and `payout.succeeded` /
   `payout.failed` / `payout.reversed` (plus `payout.cancelled` if offered)
   must be subscribed.
4. **Sandbox balance.** Step 1 sends ₱100; step 2 sends the helper's real
   `net_pay` (thousands). If the test balance is short you'll get an
   insufficient-balance rejection — which is a valid observation of the
   synchronous-rejection branch, but not the one you're looking for. Check the
   test-mode balance first.

</details>

Running the app locally is fine for step 2: the callback goes to the deployed
Supabase function over the public internet, not to `localhost`, so nothing
needs tunnelling.

---

## Step 0 — Baseline (read-only SQL, Supabase SQL editor)

> **Do not call `household_cutoff()` or `household_today()` here.** Both resolve
> the household through `current_household_id()` → `auth.uid()`, and the SQL
> editor runs as `postgres` with **no JWT**, so `auth.uid()` is NULL and the RPC
> raises `Not authenticated` (P0001) — correctly. Pass the household id
> explicitly instead, as 0.1 does. `cutoff_bounds_for` is IMMUTABLE and takes no
> session context, so it is the same arithmetic the RPC runs, just without the
> auth wrapper.

```sql
-- 0.1 The helper we'll pay, and the cutoff initiate_payslip will derive on its
-- own -- computed WITHOUT the session-dependent RPCs (see note above).
select
  hp.id   as helper_id,
  hp.name,
  hp.phone,
  hp.payday_interval,
  hp.monthly_rate,
  h.id    as household_id,
  h.timezone,
  (now() at time zone public.household_timezone(h.id))::date as household_today,
  b.cutoff_start,
  b.cutoff_end
from public.helper_profiles hp
join public.households h on h.id = hp.household_id
cross join lateral public.cutoff_bounds_for(
  (now() at time zone public.household_timezone(h.id))::date,
  hp.payday_interval
) b
order by hp.created_at;

-- 0.2 Everything currently in the payout path.
select p.id, p.helper_id, p.cutoff_start, p.cutoff_end, p.net_pay,
       p.payout_status, p.payout_external_id, p.failure_reason,
       p.requested_at, p.confirmed_at,
       a.attempt_number, a.reference_id, a.status as attempt_status,
       a.psp_payout_id, a.amount_sent, a.failure_reason as attempt_failure,
       a.created_at as attempt_created, a.resolved_at
from public.payslips p
left join public.payout_attempts a on a.payslip_id = p.id
order by p.requested_at desc, a.attempt_number;

-- 0.3 Vale pool state (so we can see settle/release move).
select id, helper_id, amount, status, settled_in_payslip_id from public.vales;
```

> **Observed (step 0) — DONE 2026-08-17.** Raw output in
> [`E1_XENDIT_VERIFIED.md`](E1_XENDIT_VERIFIED.md). What it says:
>
> - **`payslips` is empty** — 0.2 returned no rows. The C35 legacy row is gone
>   (deleted by `cleanup-c35-legacy-payslip.sql` per C37), so **no payslip has
>   ever reached a terminal state and none exists at all**. Clean slate: the
>   current cutoff is free for every helper and `payslips_one_per_cutoff`
>   cannot block anything in step 2.
> - **Cutoff `2026-08-16 → 2026-08-31`**, `household_today = 2026-08-17`,
>   `timezone = Asia/Manila` for both households. This is the second half of
>   C38's proof: the old JS would have produced `08-15 → 08-30` for the same
>   instant. Now confirmed against the real database, not just the Docker
>   harness.
> - **Two households, three helpers** — `6b3b2244…` has *Smoke Test Helper*;
>   `15105f72…` has *Ate Marites* **and** *Kuya Marito*. The second is a real
>   multi-helper household, which is what makes step 3 non-destructive (below).
> - **One approved, unsettled ₱500 vale**, on *Ate Marites*. That makes her the
>   right subject for step 2: her payout exercises the vale **settle** path, and
>   the success case must leave it settled.
>
> Targets chosen from this: **step 2 pays Ate Marites**
> (`e13ecc26-8d47-4bd6-b887-6406e594247d`, ₱9,000/mo semi-monthly, phone
> `09165563207`); **step 3 fails Kuya Marito**
> (`61c73ec7-9512-4805-8733-885d973be916`) — same household, no vale, no
> payslip, so the failure test needs no deletions at all.

### Optional — check the RPC itself, as the app calls it

Worth doing once, because 0.1 deliberately bypasses the auth wrapper and
therefore proves the *arithmetic* but not the *RPC*. Impersonate the manager
inside a transaction and roll it back:

```sql
begin;
-- The subselect runs as postgres, BEFORE the role change below, so
-- user_profiles_isolation doesn't block it. 'true' = transaction-local, so the
-- claim can't leak to another user of the connection pool.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',
    (select id from public.user_profiles
      where user_type = 'primary_manager'
      order by created_at limit 1)
  )::text,
  true
);
set local role authenticated;

select * from public.household_cutoff('semi_monthly');
select public.household_today();

rollback;
```

Expect the same `cutoff_start`/`cutoff_end` as 0.1 and `timezone = Asia/Manila`.
A mismatch between the two is itself a finding — say so before going further.

---

## Step 1 — Raw API probes with a throwaway reference id (no DB involvement)

These answer Q-B and Q-C **without creating a payslip**, so nothing can get
stuck. The reference id deliberately has no `payout_attempts` row, which also
proves out the webhook's unknown-reference branch.

Run in PowerShell 7. Use **`curl.exe`**, not `curl` (which is an alias for
`Invoke-WebRequest` and hides error bodies).

```powershell
cd "C:\Users\nosve_gez28oh\Documents\Programming\Nicole Azachee\LINARA"

# The sandbox key from .env (must start xnd_development_).
$env:XKEY = (Select-String -Path .env -Pattern '^XENDIT_SECRET_WRITE_KEY=(.*)$').Matches.Groups[1].Value
$env:XKEY.Substring(0,18)      # sanity check only -- should print xnd_development_

$ref = "e1-probe-" + [guid]::NewGuid().ToString()
$ref                            # <- record this, every probe below reuses it

# Probe bodies go to TEMP, not the repo -- nothing to clean up out of git later.
$probeA = Join-Path $env:TEMP "e1-probeA.json"
$probeB = Join-Path $env:TEMP "e1-probeB.json"

$body = @{
  reference_id       = $ref
  channel_code       = "PH_GCASH"
  channel_properties = @{ account_holder_name = "Test Kasambahay"; account_number = "09171234567" }
  amount             = 100
  currency           = "PHP"
  description        = "E1 probe"
} | ConvertTo-Json -Depth 5
Set-Content -Path $probeA -Value $body -Encoding utf8
```

### 1A — Create (baseline success shape)

```powershell
curl.exe -i -u "$($env:XKEY):" -X POST https://api.xendit.co/v2/payouts `
  -H "Content-Type: application/json" -H "Idempotency-key: $ref" --data "@$probeA"
```

Capture the **status line and full body**. What matters: the `id` (`disb-…`),
the `status` on creation (expected `ACCEPTED`), and whether `reference_id` is
echoed back.

> **Observed (1A) — 2026-08-17, `ref = e1-probe-20260817-123338`:**
>
> ```
> HTTP/1.1 200 OK
> {"id":"disb-acda3c97-57c1-4523-9d17-56ac6a550485","amount":100,
>  "channel_code":"PH_GCASH","currency":"PHP","description":"E1 probe",
>  "reference_id":"e1-probe-20260817-123338","status":"ACCEPTED",
>  "created":"2026-08-17T04:33:38.428Z","updated":"2026-08-17T04:33:38.428Z",
>  "estimated_arrival_time":"2026-08-17T04:48:38.426Z",
>  "business_id":"6a7e0ac4cfc187c11116173a",
>  "channel_properties":{"account_number":"09171234567",
>                        "account_holder_name":"Test Kasambahay"}}
> ```
>
> **200, not 201.** `status: ACCEPTED`, `reference_id` echoed back, `id` is the
> `disb-…` handle. `estimated_arrival_time` is +15 min but is **not** when it
> actually settles — see 1C.

### 1B — Look it up by reference id → **answers Q-C**

```powershell
curl.exe -i -u "$($env:XKEY):" "https://api.xendit.co/v2/payouts?reference_id=$ref"
```

The single most important paste in this file. Is it a bare `[...]`, an
`{"data":[...]}`, an `{"data":[...],"has_more":false}`, or something else
entirely? Also note whether the status has already moved from `ACCEPTED` to
`SUCCEEDED` by the time you run it — that tells us how fast test mode settles,
which decides whether step 3's cancel path is reachable at all.

Run it **twice**: once immediately after 1A, once ~60s later. Paste both. If
the first shows `ACCEPTED` and the second `SUCCEEDED`, that window is exactly
where the cancel sub-probe in step 2 has to fit.

> **Observed (1B) — ANSWERS Q-C:**
>
> ```
> HTTP/1.1 200 OK
> {"has_more":false,"data":[{"id":"disb-acda3c97-…","amount":100,
>   "channel_code":"PH_GCASH","currency":"PHP","description":"E1 probe",
>   "estimated_arrival_time":"2026-08-17T04:48:38.426Z",
>   "reference_id":"e1-probe-20260817-123338","status":"REQUESTED",
>   "created":"2026-08-17T04:33:38.428Z","updated":"2026-08-17T04:33:38.935Z",
>   "business_id":"6a7e0ac4cfc187c11116173a","channel_properties":{…}}]}
> ```
>
> **It is an object: `{has_more, data:[…]}`. Never a bare array.** The
> bare-array half of `lookupXenditPayout`'s union is dead code and should go.
>
> Also caught in passing: the status was **`REQUESTED`** 69s after creation,
> having been `ACCEPTED` in the 1A response. `attemptStatusFromXendit` already
> maps both to `accepted`, so this is covered — but it confirms `REQUESTED` is
> a real state on this path, not a defensive guess.
>
> `GET /v2/payouts/{id}` returns the **same object unwrapped** (no `data`
> envelope), for reference.

### 1C — Replay: same key, **identical** payload → **answers Q-B, half 1**

```powershell
curl.exe -i -u "$($env:XKEY):" -X POST https://api.xendit.co/v2/payouts `
  -H "Content-Type: application/json" -H "Idempotency-key: $ref" --data "@$probeA"
```

Docs say this returns the original payout object. If it does, our
`isDuplicate` branch is **never reached on a genuine network retry** — the
replay just looks like a normal 2xx, which is the outcome we want. Confirm the
status code (200? 201?) and that the `id` matches 1A's.

> **Observed (1C) — ANSWERS Q-B, half 1:**
>
> ```
> HTTP/1.1 200 OK
> {"id":"disb-acda3c97-57c1-4523-9d17-56ac6a550485",  <- SAME id as 1A
>  "amount":100,"reference_id":"e1-probe-20260817-123338",
>  "status":"SUCCEEDED",                              <- CURRENT status, not the stored one
>  "created":"2026-08-17T04:33:38.428Z","updated":"2026-08-17T04:34:58.816Z"}
> ```
>
> **The docs are right and our Session 0 note was wrong.** An identical-payload
> replay returns **HTTP 200 and the original payout object** — no error at all.
> So a genuine network retry lands in `pay.actions.ts`'s ordinary `response.ok`
> branch and the duplicate branch is never reached; that branch is now purely a
> bug signal, exactly as C37 predicted it would become.
>
> **Two consequences worth acting on:**
> 1. The replayed body carries the payout's **live status** (`SUCCEEDED` here —
>    the payout had settled 80s after creation, long before its advertised
>    `estimated_arrival_time`). `pay.actions.ts` currently ignores `body.status`
>    on a 2xx and unconditionally records `accepted`. Feeding it through
>    `attemptStatusFromXendit` would let a replay resolve straight to
>    `succeeded` instead of waiting on the webhook.
> 2. **Test mode settles in ~80 seconds**, not at `estimated_arrival_time`.
>    That's the window step 2's cancel sub-probe has to fit inside.

### 1D — Replay: same key, **different** payload → **answers Q-B, half 2**

```powershell
# Rewrite the amount via the object model so spacing/format can't bite.
$alt = Get-Content $probeA -Raw | ConvertFrom-Json
$alt.amount = 101
$alt | ConvertTo-Json -Depth 5 | Set-Content -Path $probeB -Encoding utf8
Get-Content $probeB -Raw          # confirm amount is 101 before sending

curl.exe -i -u "$($env:XKEY):" -X POST https://api.xendit.co/v2/payouts `
  -H "Content-Type: application/json" -H "Idempotency-key: $ref" --data "@$probeB"
```

This is the case `pay.actions.ts:346` is guessing at. Record the **HTTP status
code** (is it really 409?) and the exact `error_code` string — `DUPLICATE_ERROR`
vs `DUPLICATE_PAYOUT_ERROR` vs something else. Our regex
`/duplicate|idempotency[ -]?key/i` matches both, but the status-code half of
the condition may be wrong, and the parse target (`body.error_code` vs
`body.errors[0].message`) needs confirming.

> **Observed (1D) — ANSWERS Q-B, half 2:**
>
> ```
> HTTP/1.1 409 Conflict
> {"error_code":"DUPLICATE_ERROR",
>  "message":"A payout with this idempotency key already exists. If you meant
>             to execute a different request, please use another idempotency key."}
> ```
>
> **`pay.actions.ts:346`'s guess was correct on both halves** — it really is
> **409**, and the code really is a `DUPLICATE_ERROR` string that the
> `/duplicate|idempotency[ -]?key/i` regex matches, in `error_code`. No change
> required; it is now confirmed rather than assumed. (The payouts *guide* calls
> it `DUPLICATE_PAYOUT_ERROR`; v2 returns `DUPLICATE_ERROR`. Match on 409 and
> the substring, not on the exact literal.)
>
> Note the trigger: a duplicate is raised only by a **different payload** under
> the same key. Same payload = 200 + original object (1C).

### 1F — Lookup of an unknown reference id *(added mid-run)*

Needed because `lookupXenditPayout` treats "no match" and "call failed"
identically, and step 2/3 depend on which one a miss produces.

```powershell
curl.exe -i -u "$($env:XKEY):" "https://api.xendit.co/v2/payouts?reference_id=does-not-exist"
```

> **Observed (1F):**
>
> ```
> HTTP/1.1 200 OK
> {"has_more":false,"data":[]}
> ```
>
> **200 with an empty `data`, not a 404.** So `res.ok` is true, `rows.length`
> is 0, and `lookupXenditPayout` returns `null` → the attempt lands in
> `ambiguous` → payslip `needs_review`. That is the intended behaviour and the
> `if (!res.ok) return null` guard is not the path taken.

### 1G — Forced failure, to find out *which branch* reports it *(added mid-run)*

Step 3 assumed the simulation account numbers might be rejected synchronously
by `PH_GCASH` validation. They are not.

> **Observed (1G):** `POST` with `account_number: "123456"` →
> **`HTTP 200`, `status: ACCEPTED`**, indistinguishable from a good payout.
> ~3.5 minutes later `GET ?reference_id=` showed:
>
> ```
> {"status":"FAILED","failure_code":"TEMPORARY_TRANSFER_ERROR",
>  "created":"2026-08-17T04:44:37.297Z","updated":"2026-08-17T04:48:12.573Z"}
> ```
>
> **The failure is asynchronous.** It arrives via `payout.failed`, so step 3
> exercises the **webhook** rollup, not `pay.actions.ts`'s synchronous
> rejection branch at line 367. That branch stays unverified by this run — it
> needs a request Xendit rejects outright (bad channel, insufficient balance).
> Worth knowing before reading step 3's result: the app will report
> `processing` and look successful for several minutes first.
>
> Also: `failure_code` sits at the **top level of the payout object** in the
> GET, which is where the webhook's `data.failure_code` is expected to be too.

### 1E — Where did the webhook go?

The probe payout has **no** `payout_attempts` row, so our function should
ack 200 and log a warning rather than write anything.

- **Xendit dashboard → Webhooks (test mode) → delivery log** for `$ref`: copy
  the **raw JSON body Xendit sent** and the HTTP response we returned. This is
  the authoritative answer to "what does a `payout.succeeded` payload actually
  look like", including whether `data.status` and `data.failure_code` are
  present and how `event` is spelled.
- **Supabase dashboard → Edge Functions → `xendit-payout-webhook` → Logs:**
  expect `[xendit-payout-webhook] No attempt found for reference_id e1-probe-…`.
  Its presence proves delivery, URL, and `X-CALLBACK-TOKEN` auth all work
  *before* we bet a payslip on them.

**Two references to look for, both already terminal at Xendit:**

| reference_id | payout id | terminal state | at |
| --- | --- | --- | --- |
| `e1-probe-20260817-123338` | `disb-acda3c97-57c1-4523-9d17-56ac6a550485` | `SUCCEEDED` | 04:34:58Z |
| `e1-probe-fail-20260817-124437` | `disb-8111ec67-91f8-4e92-81ed-69d5a20987d9` | `FAILED` / `TEMPORARY_TRANSFER_ERROR` | 04:48:12Z |

Between them they should have produced one `payout.succeeded` and one
`payout.failed` delivery — both landing on a reference with no
`payout_attempts` row, so both must ack 200 and write nothing.

> **Observed (1E) — payloads captured 2026-08-17, full bodies in
> [`E1_XENDIT_VERIFIED.md`](E1_XENDIT_VERIFIED.md). Both deliveries fired.**
>
> ```jsonc
> // payout.succeeded
> { "created": "2026-08-17T04:34:58.995Z", "business_id": "6a7e0ac4…",
>   "event": "payout.succeeded", "api_version": "v2",
>   "data": { "id": "disb-acda3c97…", "amount": 100, "status": "SUCCEEDED",
>             "reference_id": "e1-probe-20260817-123338",
>             "idempotency_key": "e1-probe-20260817-123338",
>             "channel_code": "PH_GCASH", "channel_category": "EWALLET",
>             "account_number": "09171234567", "connector_reference": "SIMULATED_…" } }
>
> // payout.failed  -- same envelope plus:
> "data": { …, "status": "FAILED", "failure_code": "TEMPORARY_TRANSFER_ERROR" }
> ```
>
> **Every field `xendit-payout-webhook` reads is present and spelled as
> assumed** — `event` (`payout.succeeded` / `payout.failed`, matching the
> `startsWith("payout.")` filter and both equality tests), `data.reference_id`,
> `data.id`, and `data.failure_code` on the failure only. No parser change
> needed. `data.idempotency_key` is echoed back too, which we don't read and
> don't need to, since it equals `reference_id` by construction.
>
> Envelope facts not previously written down anywhere: the event name sits at
> the **top level** (not inside `data`), `api_version: "v2"` is included, and
> the top-level `created` is the *event's* timestamp while `data.created` is
> the *payout's* — 80s apart on the success, 3.5 min on the failure. Nothing
> reads them, but don't confuse the two if a reconciliation view (E5) starts
> using timestamps.
>
> **Still to confirm:** `payout.reversed` / `payout.cancelled` were not
> exercised — neither event fires in this flow — so those two branches remain
> reasoned rather than observed.

---

## Step 2 — End to end through the real app → **answers Q-A**

This is the one that has never been done. Use the app, not curl — the point is
to exercise `initiate_payslip` → `pay.actions.ts` → Xendit → webhook →
`record_payout_attempt_result` → `payslips`.

1. Confirm from step 0.1 that the helper's `phone` is a plausible GCash number
   (`09XXXXXXXXX`) and is **not** one of the failure-simulation numbers.
2. `npm run dev`, sign in as the primary manager, open **Money**.
3. Confirm the pre-condition C38 fixed: the cutoff shown matches step 0.1's
   `cutoff_start`/`cutoff_end`.
4. Click **Pay via GCash**. Expect the UI to report `processing`.
5. Immediately run 0.2 again — expect `attempt_status = 'accepted'`,
   `payout_status = 'processing'`, `psp_payout_id` set.
6. Wait for the webhook (test mode settles on its own), then run 0.2 **again**.

**Pass criteria for Q-A:**

- `payout_attempts.status` = `succeeded`, `resolved_at` set.
- `payslips.payout_status` = `succeeded`, `confirmed_at` set.
- The vale from 0.3 is still `settled_in_payslip_id = <this payslip>` (a
  success must **not** release it).
- The Money tab shows a **status badge, not the Pay buttons**, on reload.
- Supabase function log shows the RPC call, no error.

> **Observed (step 2) — RUN 2026-08-17, and it FAILED, which is the point.**
>
> Paid **Kuya Marito** (₱12,000/mo semi-monthly → ₱6,000 base − ₱187.50
> statutory = **₱5,812.50**, no vale), not Ate Marites — so the vale-settlement
> path is **still unexercised** and step 2 should be re-run against her once
> the fix is deployed.
>
> Xendit settled the payout successfully. The payslip stayed in `processing`.
> The Supabase function log said:
>
> ```
> [xendit-payout-webhook] Lookup failed: column payslips.payout_reference_id does not exist
> ```
>
> **The deployed function was a pre-C37 build** — the migration dropping that
> column was applied on 2026-08-16 and the rewritten function was committed the
> same day, but never deployed. Every callback since had thrown and returned
> 500. Full write-up in `KNOWN_GAPS.md` **C44**, with the category-level gap as
> **C45**.
>
> **This is exactly what step 1E was for.** The two probe deliveries in step 1
> had already hit this error; step 1E (read the function logs) was skipped
> because the pre-flight had confirmed the webhook *configuration*, and the
> configuration was genuinely correct. It was the deployed *build* that was
> wrong. Do not let a green pre-flight stand in for reading the logs.
>
> **RESOLVED after the redeploy — step 2 PASSES and E1 is complete.**
>
> | helper | net_pay | amount_sent | payslip | attempt | confirmed_at |
> | --- | --- | --- | --- | --- | --- |
> | Kuya Marito | 5812.50 | 5812.50 | succeeded | succeeded | 16:43:52Z |
> | Ate Marites | 3812.50 | 3812.50 | succeeded | succeeded | 16:53:01Z |
>
> Ate Marites' ₱500 vale kept its `settled_in_payslip_id` — a success must not
> release it, and does not. Kuya Marito's row confirmed ~2h after its failed
> delivery, which looks like Xendit's own retry landing on the corrected build.
>
> **Not proven by this run, despite the green table:** the Money tab's badge.
> The dashboard did show "paid", but the Pay Dial on both tabs still displays
> the full accrued amount for a cutoff that has been paid — it never reads
> `payslips` at all. That is a separate defect this run exposed, and it could
> not have been seen before, because no payslip had ever reached `succeeded`.

**Opportunistic sub-probe — cancel (only if the payout is still `ACCEPTED`
when you check at 5):** `curl.exe -i -u "$($env:XKEY):" -X POST
https://api.xendit.co/v2/payouts/<psp_payout_id>/cancel`. That exercises
`payout.cancelled` → attempt `cancelled` → payslip `failed` → vale released →
cutoff retryable, which is C37's decisive branch and is also unobserved. If
test mode settles too fast to catch, skip it — step 3 covers the terminal
failure rollup.

---

## Step 3 — The failure rollup (no deletions needed)

**Revised after step 0.** The original plan deleted step 2's payslip to free up
the cutoff. Unnecessary: *Kuya Marito* is in the **same household** as *Ate
Marites*, has no vale and no payslip, so `payslips_one_per_cutoff` is not in the
way. Step 2's succeeded payslip stays intact as evidence, and the only change is
one phone number, restored afterwards.

```sql
-- Force a deterministic failure on Kuya Marito's next send. Record the real
-- number first: 09565563333.
update public.helper_profiles
set phone = '123456'                       -- TEMPORARY_TRANSFER_ERROR in test mode
where id = '61c73ec7-9512-4805-8733-885d973be916';
```

In the app, switch the Money tab to **Kuya Marito** and click **Pay via
GCash**, then check 0.2.

**Pass criteria:** attempt `failed` with Xendit's `failure_code` in
`failure_reason`, payslip `failed`, and the Money tab offers a retry. Ate
Marites' payslip and her settled vale must be **untouched** — this is also a
free check on the `MULTI_HELPER_HANDLING.md` failure mode, since a bug that
resolved "which helper" wrongly would show up right here.

Kuya Marito has no vale, so the release path isn't exercised by this. If you
want that too, approve a small vale for him first and confirm it returns to the
pool (`settled_in_payslip_id is null`) after the failure.

Note *which* leg produced the failure — a synchronous non-2xx from
`POST /v2/payouts` (the `pay.actions.ts:367` branch) or an asynchronous
`payout.failed` webhook. `123456` (`TEMPORARY_TRANSFER_ERROR`) should be the
async one; if `PH_GCASH` rejects the number format synchronously instead,
that's still a useful observation — paste it and try `999999`.

**Then restore — don't skip this, a `123456` phone left behind will fail every
future payout:**

```sql
update public.helper_profiles
set phone = '09565563333'
where id = '61c73ec7-9512-4805-8733-885d973be916';

-- Confirm both helpers are back to their real numbers.
select id, name, phone from public.helper_profiles order by created_at;
```

Leave the `failed` payslip in place — it's the evidence, and a `failed` row is
retryable by design so it blocks nothing.

> **Observed (step 3):**
>
> ```
> (paste)
> ```

---

## Step 4 — Idempotency retention window → **answers Q-D**

Not a same-day step, and nothing blocks on it.

1. **Ask Xendit support** (paste verbatim):
   > For Payouts v2 in the Philippines, how long is an `Idempotency-key`
   > retained/honoured on `POST /v2/payouts`? Specifically: after what interval
   > will replaying the same key with an identical payload create a *second*
   > payout rather than returning the original one? Is the window documented
   > anywhere?
2. **Measure it.** Re-run probe 1C (identical payload, same `$ref`) at ~24h and
   ~72h. First run that returns a **new** `id` bounds the window. Record the
   `$ref`, the original `id`, and the timestamp of each replay.

> **Observed (step 4):**
>
> ```
> (paste)
> ```

---

## What each answer changes in the code

Fill in after the paste-back; this is the whole point of doing E1 before E2–E6.

| Observation | Change to make | Status |
| --- | --- | --- |
| **1B** — always `{has_more, data:[…]}` | Drop the bare-array branch from `lookupXenditPayout`'s union type and its `Array.isArray` test. | confirmed, pending code |
| **1C** — identical replay = 200 + original object | Two edits: (a) comment the duplicate branch as a bug signal, not a retry path; (b) pass `body.status` through `attemptStatusFromXendit` on 2xx so a replay of an already-settled payout records `succeeded` instead of `accepted`. | confirmed, pending code |
| **1D** — 409 + `error_code: DUPLICATE_ERROR` | None. The existing `isDuplicate` test is correct as written — promote the comment from "guess" to "verified 2026-08-17". | confirmed, no change |
| **1F** — unknown ref = 200 + `data:[]` | None. Confirms a miss yields `null` → `ambiguous` → `needs_review`, as designed. | confirmed, no change |
| **1G** — simulated failures are async | None to code, but step 3's expectations change: the failure arrives by webhook, several minutes after the UI says `processing`. The synchronous rejection branch (line 367) remains unverified. | confirmed |
| 1E — webhook delivery | Close C35's open sub-item if delivery is observed. | **pending** |
| Step 2 pass | The end-to-end proof: webhook writes into `payslips`. | **pending** |
| Step 4 window | Decide whether per-attempt keys stay sufficient (they should) and record the number in C36/C37. | **pending** |

**Not observed, and still guesses:** the exact webhook envelope (`event` name
spelling, whether `data.failure_code` is present) — that needs 1E; and
`pay.actions.ts`'s synchronous-rejection branch, which no simulation account
number reaches.

**Cleanup when done:** `Remove-Item $probeA, $probeB` and
`Remove-Item Env:\XKEY`. Both probe files live in `$env:TEMP`, so nothing lands
in the repo — but do keep `$ref` and 1A's payout `id` written down, step 4
needs them days later.
