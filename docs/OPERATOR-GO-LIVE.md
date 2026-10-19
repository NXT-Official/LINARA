# Selling Linara: owner go-live checklist

Written 2026-10-19. Everything below is done by you, in order. Nothing here is applied yet
(KNOWN_GAPS O58 to O64). The design and the reasons are in
[docs/superpowers/specs/2026-10-19-sell-linara-design.md](superpowers/specs/2026-10-19-sell-linara-design.md).

Two repos are involved. The Linara Business Console (`LINARA_ADMIN`) owns the business schema: plans,
subscriptions, invoices, finance, FAQs and in-app support. This household app (`LINARA`) owns
`add-seat-limits.sql`, the edge functions and the public and manager pages. Both share one Supabase
project (`tueckhlrrupmnzhblewy`), which takes schema changes by hand in the SQL editor.

Why selling is switched on last: checkout is fail-closed, so nothing charges anyone until step 5 sets
`PLATFORM_BILLING=on` and the Xendit key together. Prices are final, tax-inclusive PHP amounts; no VAT
is shown (non-VAT BMBE).

## 1. LINARA_ADMIN: apply 015 to 020, in order

In the Supabase SQL editor, run the whole contents of each file from `LINARA_ADMIN/supabase/`, one at
a time, in this order:

1. `015-business-permissions.sql`
2. `016-billing-plans.sql`
3. `017-billing-subscriptions.sql`
4. `018-billing-finance.sql`
5. `019-support-in-app.sql`
6. `020-faq.sql`

Existing households lose nothing: the free tier is on and seat limits default to unlimited.

## 2. LINARA: apply the seat limits

In the same SQL editor, run `LINARA/supabase/add-seat-limits.sql`. It must come after 017, because its
seat triggers call `billing_household_entitlements`. Running it twice is safe.

## 3. LINARA: deploy the edge functions

```bash
npm run deploy:functions
```

This deploys `xendit-session-webhook` (it needs `verify_jwt = false`, already set in
`supabase/config.toml`) and the six AI functions, which record their usage. They call
`billing_record_invoice_result` and `billing_record_ai_usage` from 017 and 018. Then check
`npm run deploy:functions:check` and make sure the `supabase/DEPLOYMENTS.md` row for 2026-10-19 says
deployed, with the date.

## 4. Xendit dashboard: webhook URL

Xendit dashboard, Settings, Developers, Webhooks. Set the Payment Session completed and Payment
Session expired URL to:

```text
https://tueckhlrrupmnzhblewy.supabase.co/functions/v1/xendit-session-webhook
```

The events are `payment_session.completed` and `payment_session.expired`. Confirm the webhook
verification token shown there is the same value as the Supabase secret
`XENDIT_WEBHOOK_VERIFICATION_TOKEN` (the payout webhook shares it). Tokens and URLs are separate for
test and live mode: do test mode first, and repeat this step with the live token and URL when you go
live.

## 5. Vercel environment for LINARA

For each deployment, `linara-nicoledev` and `linara`:

1. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The preview has had neither (LW-9), so until now its
   manager pages could not load data. Redeploy afterwards: they are baked in at build time.
2. Only when selling is meant to be live on that deployment, also set `PLATFORM_BILLING=on`,
   `XENDIT_SECRET_WRITE_KEY` (a test-mode key for the first run) and, if it is not the default,
   `XENDIT_API_URL`. These are read at request time, so no rebuild is needed. Leave
   `PLATFORM_BILLING` unset anywhere you do not want to sell.

The console needs no new environment variables.

## 6. Console: staff permissions

In the console, give the business roles `billing.manage`, `finance.view` and `faq.manage`. The admin
and mods presets already have them after 015; sales and support only get `billing.view`.

## 7. Live checks

Do these on `linara-nicoledev` in Xendit test mode first.

1. Console, Plans: create a plan priced at ₱1 and publish it. LINARA `/pricing`, signed out, lists it.
2. Sign in to LINARA as a manager, open `/manager/plan`, pick the plan and press Pay.
3. On the Xendit test-mode page, simulate the payment. You come back to `/billing/return?paid=1`
   and the plan page shows "Paid, thank you".
4. Console, Finance: the revenue shows ₱1.00.
5. Let a second test session expire and start another for the same account. If Xendit rejects the
   repeat, that is KNOWN_GAPS O68.
6. LINARA `/manager/help`: send a message. The console Support inbox shows the in-app ticket; reply,
   and the reply appears on `/manager/help`.
7. Console, FAQs: add a question and publish it. It appears on LINARA `/faq`.
8. Archive the ₱1 test plan so it leaves `/pricing`.

## 8. Before the first real payment

- Read the new "Plans and payments" section on `/terms` and the Xendit line on `/privacy`, and set
  `PRIVACY_CONTACT_EMAIL` (KNOWN_GAPS O69).
- Switch the Xendit key, webhook token and URL to live mode (steps 4 and 5).
- Know that payouts are still off (O35). Xendit's legacy payouts and invoices APIs carry a monthly
  fee from 2026-10-01, so a move to Payouts v3 comes before payouts are switched on (O65).
- Transcription cost reads as zero on the console Finance page until `transcribe-notes` reports the
  clip length (O66). AI is on mocks, so nothing is under-counted today.
- Move KNOWN_GAPS O58 to O64 to Closed Gaps once each file is applied and the checks above pass.
