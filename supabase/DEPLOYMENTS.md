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
authenticating with `X-CALLBACK-TOKEN` instead); the other six must NOT have it.
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
| `USE_MOCK_AI` | the six AI functions — set, so they return canned output |
| `OPENAI_API_KEY` / provider keys | the AI functions, per `README.md` — **not set yet**; needed only once `USE_MOCK_AI` comes off |

## Log

Newest first. Record what changed and how it was verified, not just that a
command ran.

| Date | Function(s) | Commit | Verified by |
| --- | --- | --- | --- |
| 2026-08-18 | `generate-sop`, `parse-scheduler`, `promote-voice-task`, `route-utos`, `simplify-sop`, `transcribe-notes` | `81df8cb` | First deploy ever — `functions list` beforehand returned **only** `xendit-payout-webhook`, so the row below understated it: these six had never existed in the project, not merely "unknown vintage". All six came up `ACTIVE` at `version: 1` with `verify_jwt: true`; the webhook reported "No change found" and stayed at `version: 4`, `verify_jwt: false`. Not exercised by a real call — they run under `USE_MOCK_AI`, and no provider key is set. |
| 2026-08-17 | `xendit-payout-webhook` | pre-`6fab066` source (the C37 rewrite) | Two real sandbox payouts reached `succeeded` end to end; `amount_sent` matched `net_pay` on both; vale stayed settled on success. Closed C35 and C44. |
