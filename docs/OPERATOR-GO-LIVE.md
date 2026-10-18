# Selling Linara: owner go-live checklist

Written 2026-10-19. Everything below is done by you, in order. Nothing here is applied yet
(KNOWN_GAPS O58 to O64). The design and the reasons are in
[docs/superpowers/specs/2026-10-19-sell-linara-design.md](superpowers/specs/2026-10-19-sell-linara-design.md).

Why it is manual: the one Supabase project (`tueckhlrrupmnzhblewy`) takes schema changes by hand in
the SQL editor, and this machine cannot reach it. Why selling is switched on last: checkout is
fail-closed, so nothing charges anyone until step 5 sets `PLATFORM_BILLING=on` and the Xendit key
together. Prices are final, tax-inclusive PHP amounts; no VAT is shown (non-VAT BMBE).

## 1. Apply the seven SQL files, in this order

In Supabase, SQL editor, run each file's whole contents. Running one twice is safe.

1. `supabase/add-platform-admins.sql`
2. `supabase/add-plans.sql`
3. `supabase/add-subscriptions.sql`
4. `supabase/add-seat-limits.sql`
5. `supabase/add-costs-and-ai-usage.sql`
6. `supabase/add-support-chat.sql`
7. `supabase/add-faqs.sql`

Existing households lose nothing: seat limits default to unlimited and the free tier is on.

## 2. Make yourself a Linara admin

Nobody can be made an admin from the app. Run this once, with your own sign-in email (the account
must have finished household setup):

```sql
INSERT INTO public.platform_admins (user_id, note)
SELECT id, 'owner' FROM auth.users WHERE email = '<you>'
ON CONFLICT DO NOTHING;
```

## 3. Deploy the edge functions

```bash
npm run deploy:functions
```

This deploys `xendit-session-webhook` (it needs `verify_jwt = false`, already set in
`supabase/config.toml`) and the six AI functions, which now record their usage. Then check
`npm run deploy:functions:check` and make sure the `supabase/DEPLOYMENTS.md` row for 2026-10-19
says deployed, with the date.

## 4. Point Xendit at the webhook

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

## 5. Vercel environment

For each deployment, `linara-nicoledev` and `linara`:

1. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The preview has had neither (LW-9), so until now its
   manager and admin pages could not load data. Redeploy afterwards: they are baked in at build time.
2. Only when selling is meant to be live on that deployment, also set `PLATFORM_BILLING=on`,
   `XENDIT_SECRET_WRITE_KEY` (a test-mode key for the first run) and, if it is not the default,
   `XENDIT_API_URL`. These are read at request time, so no rebuild is needed. Leave
   `PLATFORM_BILLING` unset anywhere you do not want to sell.

## 6. Live checks

Do these on `linara-nicoledev` in Xendit test mode first.

1. Sign in with the admin account, open `/admin/plans`, create a plan priced at ₱1 and publish it.
2. Open `/pricing` signed out: the ₱1 plan is listed.
3. Sign in as a manager (the admin account works), open `/manager/plan`, pick the plan and press Pay.
4. On the Xendit test-mode page, simulate the payment. You come back to `/billing/return?paid=1`
   and the plan page shows "Paid, thank you".
5. Open `/admin`: revenue shows ₱1.00.
6. Let a second test session expire and start another for the same account. If Xendit rejects the
   repeat, that is KNOWN_GAPS O68.
7. From `/manager/help` open a support thread and send a message. In `/admin/support` the thread is
   unread; answer it, and see the reply appear in `/manager/help` without reloading.
8. In `/admin/faqs` add a question and publish it. It appears on `/faq`.
9. Archive the ₱1 test plan so it leaves `/pricing`.

## 7. Before the first real payment

- Read the new "Plans and payments" section on `/terms` and the Xendit line on `/privacy`, and set
  `PRIVACY_CONTACT_EMAIL` (KNOWN_GAPS O69).
- Switch the Xendit key, webhook token and URL to live mode (steps 4 and 5).
- Know that payouts are still off (O35). Xendit's legacy payouts and invoices APIs carry a monthly
  fee from 2026-10-01, so a move to Payouts v3 comes before payouts are switched on (O65).
- Transcription cost reads as zero on `/admin` until `transcribe-notes` reports the clip length
  (O66). AI is on mocks, so nothing is under-counted today.
- Move KNOWN_GAPS O58 to O64 to Closed Gaps once each file is applied and the checks above pass.
