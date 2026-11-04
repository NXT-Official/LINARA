# Edge Function deployment log

Migrations in this repo are applied by hand and every one is recorded in
[`KNOWN_GAPS.md`](../KNOWN_GAPS.md) with a date. Edge Functions had **no
equivalent** — no deploy step in any workflow, no record of what was pushed, and
no way to compare `supabase/functions/*` against what is actually serving
traffic. This file is the missing half. See `KNOWN_GAPS.md` **C45**.

It exists because that gap cost us a live bug. `xendit-payout-webhook` was
rewritten on 2026-08-16 to read `payout_attempts` after a migration dropped
`payslips.payout_reference_id`. The migration was applied, the code was
committed, and the function was never deployed — so every Xendit callback threw
and returned 500, and every payout would have hung in `processing` forever while
Xendit reported success. Nothing failed loudly; it took a real payout and a log
read to find (**C44**).

## Deploying

```bash
npm install                        # the CLI is a devDependency; do not install it globally
npx supabase login                 # once per machine; browser flow
npm run deploy:functions           # deploys ALL functions in supabase/functions
```

The `supabase` CLI is pinned in `devDependencies`, so the bare `supabase` in the
npm scripts resolves through `node_modules/.bin`. There is no global install to
keep in sync, and `npx supabase` inside this repo runs that same pinned version
rather than downloading a floating one.

`verify_jwt` per function comes from [`config.toml`](config.toml) — **do not pass
`--no-verify-jwt` by hand**. The webhook needs it (Xendit sends no Supabase JWT,
authenticating with `X-CALLBACK-TOKEN` instead), and so does `purge-expired-evidence`
(called by our own pg_cron job, authenticating with `x-purge-secret`); the six AI
functions must NOT have it.
Getting that backwards fails in a particularly nasty way: the gateway rejects the
caller *before* the function runs, so there is no function log at all and it
looks exactly like "nobody called us".

To deploy one function only:

```bash
npx supabase functions deploy <name> --project-ref tueckhlrrupmnzhblewy
```

## After deploying

1. `npm run deploy:functions:check` — confirm the version/updated timestamp moved.
2. For anything on the payments path, **read the function logs after a real
   call**. Configuration being correct is not the same as the deployed build
   being correct; that distinction is the whole of C44.
3. Add a row below.

## Secrets

Set separately from deploys and **not** cleared by one
(`supabase secrets set NAME=value`). Required today:

| Secret | Used by |
| --- | --- |
| `XENDIT_WEBHOOK_VERIFICATION_TOKEN` | `xendit-payout-webhook` |
| `EVIDENCE_PURGE_SECRET` | `purge-expired-evidence`; the same value is in Vault as `evidence_purge_secret` for its pg_cron job (with `project_url`) |
| `USE_MOCK_AI` | the six AI functions — set, so they return canned output |
| `OPENAI_API_KEY` / provider keys | the AI functions, per `README.md` — **not set yet**; needed only once `USE_MOCK_AI` comes off |

## Scheduled jobs (pg_cron)

Not Edge Functions, but deployed by hand the same way: each is created by the
migration that defines it, and lives in the database.

| Job | Schedule | Migration |
| --- | --- | --- |
| `purge-stale-quick-utos` | `5 * * * *` (hourly) | `add-nightly-utos-purge.sql` |
| `purge-expired-evidence` | `30 18 * * *` (02:30 Manila) | `add-evidence-photo-retention.sql`; calls the Edge Function of the same name through pg_net. Its reply is in `net._http_response`. |

```sql
SELECT jobname, schedule, active FROM cron.job;
SELECT j.jobname, d.status, d.return_message, d.start_time
  FROM cron.job_run_details d JOIN cron.job j USING (jobid)
 ORDER BY d.start_time DESC LIMIT 10;
```

## Log

Newest first. Record what changed and how it was verified, not just that a
command ran.

| Date | Function(s) | Commit | Verified by |
| --- | --- | --- | --- |
| 2026-11-04 | **linara-staging** (`yiplebxoqyujjdaxujue`, future prod; no app points at it yet): all ten except `eas-build-webhook` (`functions deploy … --project-ref yiplebxoqyujjdaxujue --use-api`), plus secrets `USE_MOCK_AI`, `BILLING_ALLOW_LOCALHOST=false`, `BILLING_RETURN_ORIGINS=https://linara-delta.vercel.app`, `EVIDENCE_PURGE_SECRET`, `XENDIT_BILLING_WEBHOOK_TOKEN`, `XENDIT_WEBHOOK_VERIFICATION_TOKEN` (values in `.env.staging`). `XENDIT_MONEY_IN_KEY` not set yet | `2fa5140` + uncommitted `config.toml` | `functions list`: ten `ACTIVE`, `verify_jwt` false on the two Xendit webhooks and `purge-expired-evidence`, true on the other seven. POST with no credentials: 401 from all five probed (`purge-expired-evidence`, both Xendit webhooks, `billing-checkout`, `generate-sop`). The cron path end to end: `net.http_post` with the Vault `project_url` + `evidence_purge_secret` got 200 `{"released":0,"removed":0,"failed":0}`, so the Vault secret matches the function secret. Billing not exercised (no money-in key). |
| 2026-11-04 | `eas-build-webhook` (new; `functions deploy eas-build-webhook --no-verify-jwt`), plus secrets `EAS_WEBHOOK_SECRET`, `EAS_LOG_APPS_SCRIPT_URL`, `EAS_LOG_APPS_SCRIPT_TOKEN` set by the owner | uncommitted (`airaDev` working tree) | `functions list`: `ACTIVE`, version 1, `verify_jwt: false`. Live calls: GET 405; a forged `expo-signature` 401; a signed `production` build 200 `ignored`; a signed `preview` test build (id `…e2e1`) 200 and written to the build-log Google Doc; the same build again 200 `duplicate: true` (written once). 63 vitest tests in `functions/eas-build-webhook`. EAS webhook `e2348ac2-f31d-4cca-b0ef-6abe1f78379c` (BUILD, `@naaxtechs-team/linara-mobile`) created by the owner. Apps Script redeployed as version 2 (updates the LINARA table's Mobile row in place; a direct `canceled` probe answered `skipped: "status"`). Real preview build `940ce4f8-7344-4231-8eb4-3d038e1b7e7b` updated the Mobile row's Link, Notes and Date, confirmed by the owner in the Doc. See its README. |
| 2026-11-03 | All ten (`npm run deploy:functions`, by the owner, 04:13 UTC and again 04:24 UTC from the same source) | `76fbe2d` | Security test found the six AI functions still on pre-guard builds (last deployed Aug 17 to Oct 1), answering the anon key alone with 200 (KNOWN_GAPS O47). After the deploy: the anon key gets 401 "Sign in to use this." from all six, a signed-in manager gets 200 from all six, and a forged call to `xendit-payout-webhook`, `xendit-billing-webhook` and `purge-expired-evidence` gets 401. `functions list`: AI functions and `billing-checkout` `verify_jwt: true`, the two webhooks and the purge `false`. |
| 2026-08-18 | `generate-sop`, `parse-scheduler`, `promote-voice-task`, `route-utos`, `simplify-sop`, `transcribe-notes` | `81df8cb` | First deploy ever — `functions list` beforehand returned **only** `xendit-payout-webhook`, so the row below understated it: these six had never existed in the project, not merely "unknown vintage". All six came up `ACTIVE` at `version: 1` with `verify_jwt: true`; the webhook reported "No change found" and stayed at `version: 4`, `verify_jwt: false`. Not exercised by a real call — they run under `USE_MOCK_AI`, and no provider key is set. |
| 2026-08-17 | `xendit-payout-webhook` | pre-`6fab066` source (the C37 rewrite) | Two real sandbox payouts reached `succeeded` end to end; `amount_sent` matched `net_pay` on both; vale stayed settled on success. Closed C35 and C44. |
