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

## Step −1 — Pre-flight (5 min, do not skip)

Four checks. Three of them are the difference between "the webhook doesn't
work" and "I misread the result".

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

Running the app locally is fine for step 2: the callback goes to the deployed
Supabase function over the public internet, not to `localhost`, so nothing
needs tunnelling.

---

## Step 0 — Baseline (read-only SQL, Supabase SQL editor)

```sql
-- 0.1 The helper we'll pay, and the cutoff the RPC will derive on its own.
select
  hp.id            as helper_id,
  hp.name,
  hp.phone,
  hp.payday_interval,
  hp.monthly_rate,
  public.household_today()                                as household_today,
  (select cutoff_start from public.household_cutoff(hp.payday_interval)) as cutoff_start,
  (select cutoff_end   from public.household_cutoff(hp.payday_interval)) as cutoff_end
from public.helper_profiles hp
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

> **Observed (step 0):**
>
> ```
> (paste)
> ```

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

> **Observed (1A):**
>
> ```
> (paste)
> ```

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

> **Observed (1B):**
>
> ```
> (paste)
> ```

### 1C — Replay: same key, **identical** payload → **answers Q-B, half 1**

```powershell
curl.exe -i -u "$($env:XKEY):" -X POST https://api.xendit.co/v2/payouts `
  -H "Content-Type: application/json" -H "Idempotency-key: $ref" --data "@$probeA"
```

Docs say this returns the original payout object. If it does, our
`isDuplicate` branch is **never reached on a genuine network retry** — the
replay just looks like a normal 2xx, which is the outcome we want. Confirm the
status code (200? 201?) and that the `id` matches 1A's.

> **Observed (1C):**
>
> ```
> (paste)
> ```

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

> **Observed (1D):**
>
> ```
> (paste)
> ```

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

> **Observed (1E) — raw webhook body + our response + function log line:**
>
> ```
> (paste)
> ```

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

> **Observed (step 2) — 0.2 before, 0.2 after, function log, UI state:**
>
> ```
> (paste)
> ```

**Opportunistic sub-probe — cancel (only if the payout is still `ACCEPTED`
when you check at 5):** `curl.exe -i -u "$($env:XKEY):" -X POST
https://api.xendit.co/v2/payouts/<psp_payout_id>/cancel`. That exercises
`payout.cancelled` → attempt `cancelled` → payslip `failed` → vale released →
cutoff retryable, which is C37's decisive branch and is also unobserved. If
test mode settles too fast to catch, skip it — step 3 covers the terminal
failure rollup.

---

## Step 3 — The failure rollup (destructive to sandbox rows)

The current cutoff is now occupied by a `succeeded` payslip, and
`payslips_one_per_cutoff` will (correctly) refuse a second. Data is disposable,
so clear it:

```sql
-- Deletes the payslip and cascades payout_attempts; vales.settled_in_payslip_id
-- is ON DELETE SET NULL, so the vale returns to the pool by itself.
delete from public.payslips where id = '<payslip id from step 2>';

-- Force a deterministic failure on the next send.
update public.helper_profiles set phone = '123456' where id = '<helper id>';
```

Click **Pay via GCash** again, then check 0.2.

**Pass criteria:** attempt `failed` with Xendit's `failure_code` in
`failure_reason`, payslip `failed`, vale released
(`settled_in_payslip_id is null`), and the Money tab offers a retry.

Note *which* leg produced the failure — a synchronous non-2xx from
`POST /v2/payouts` (the `pay.actions.ts:367` branch) or an asynchronous
`payout.failed` webhook. `123456` (`TEMPORARY_TRANSFER_ERROR`) should be the
async one; if `PH_GCASH` rejects the number format synchronously instead,
that's still a useful observation — paste it and try `999999`.

**Then restore:**

```sql
update public.helper_profiles set phone = '<original phone from 0.1>' where id = '<helper id>';
delete from public.payslips where id = '<the failed payslip id>';   -- optional, leaves the cutoff clean
```

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

| Observation | Change to make |
| --- | --- |
| 1B response shape | Narrow `lookupXenditPayout`'s union type to what was actually returned; keep a defensive fallback only if the shape is genuinely ambiguous. |
| 1C returns the original object | Document that a network-retry replay lands in the normal 2xx branch; the duplicate branch becomes a bug-signal path only. |
| 1D status code + `error_code` | Fix `isDuplicate` to match the observed status/code instead of guessing 409. |
| Step 2 pass | Close C35's open sub-item; the webhook is verified end to end. |
| Step 3 failure_code location | Confirm `failure_reason` carries something a manager can act on. |
| Step 4 window | Decide whether per-attempt keys stay sufficient (they should) and record the number in C36/C37. |

**Cleanup when done:** `Remove-Item $probeA, $probeB` and
`Remove-Item Env:\XKEY`. Both probe files live in `$env:TEMP`, so nothing lands
in the repo — but do keep `$ref` and 1A's payout `id` written down, step 4
needs them days later.
