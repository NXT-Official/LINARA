# Selling Linara: plans, billing, analytics, support chat, FAQs

Date: 2026-10-19 · Branch: `nicoleDev` (the owner's "nicoleBranch") · Status: design, builder-checked

## Intent

Linara has users but no way to charge for it: nothing in the product collects money, there is
no notion of who runs the platform, no view of what it costs to run, and no way for a household
to ask for help from inside the app. The owner wants, in one pass:

1. **Plans the admin prices however they like** (monthly, yearly or one-time; per extra staff,
   per manager/user, per home, or a flat fee with or without inclusions) and a way for a household
   to buy one.
2. **Analytics** for the admin: COGS, cost per AI call, profit, profit per user.
3. **Support chat** between a household and the admin.
4. **FAQs** the admin maintains and anyone can read.

Line moved: **new revenue** (first money in) and **reduced cost** (no third-party chat/FAQ tool).

The owner's words set the scope. Where the request is silent this document says what I decided,
marked *(my call)*.

## Vocabulary

- **Household**: a paying customer. Its **managers** (primary, co, remote) are its users. Its
  **helpers** (kasambahay) are staff seats; the helper side stays free (concept doc §12).
- **Platform admin**: Linara staff who price, support and read analytics. New concept. In code
  and SQL it is always `platform_admin` to keep clear of the existing household "admin" roles
  (`remote_admin`, `is_household_admin()`).
- **Plan**: a priced offer. **Subscription**: a household's purchase of a plan. **Platform invoice**:
  one Xendit invoice for one subscription period.

## Goals

- An admin signs in, opens `/admin`, and can create, publish, edit and archive plans with any of
  the four pricing shapes, or a mix (base fee plus per-seat extras).
- A manager sees their plan and seat usage, picks a plan, pays on Xendit's hosted invoice page
  (GCash / Maya / cards / bank), and comes back entitled. Renewal is a new invoice per period.
- Seat limits are enforced in the database, not only in the UI, with an upgrade path shown where
  the limit bites. Default limits are unlimited so nothing changes for existing households until
  the admin decides.
- `/admin` shows revenue, COGS, AI cost, cost per AI call, profit, paying households, users and
  profit per user for a date range, with a monthly series chart. COGS is what the admin enters
  plus what AI calls cost.
- A household can open a support thread and chat; the admin answers from an inbox. New messages
  appear without reloading.
- FAQs are admin-edited, public at `/faq`, and never blank (checked-in fallback, like the landing).
- Everything is committed to `nicoleDev`, pushed as it lands, deployed to the nicoleDev preview.

## Non-goals

- Auto-debit renewals. Xendit auto-debit needs a tokenised card or linked e-wallet; this pass
  issues one invoice per period and reminds in-app. Revisit when a second household asks.
- Receipts as PDF / BIR Sales Invoice print. Platform invoices get a sequential number so one can
  be issued; the printable document is deferred with a trigger: the first real payment.
- Proration, upgrades mid-period, refunds. Changing plan starts a new period on payment.
- Email/SMS notifications for support messages. In-app unread counts only.
- Replacing the landing CMS. FAQs live in Postgres, not Sanity.

## Anti-goals (what would make this a failure even if it works)

- Linara holding or moving household money. Xendit collects; Linara records (consistent with
  KNOWN_GAPS O35's spirit: the helper's wages still never pass through Linara).
- A manager reading another household's thread, invoice or seat counts. Every new table has RLS
  in the same file and a PGlite isolation test.
- Existing households losing a feature when the SQL lands (defaults are unlimited and free tier
  enabled).
- Fabricated prices on the public site. `/pricing` shows only plans the admin published; with
  none it shows "Contact us" and the support entry point.
- Anything that breaks the mobile WebView contract (`linara_manager_*` keys, `/login`,
  `/manager/pass` unchanged).

## Constraints discovered (and what they mean here)

- **Schema is applied by hand** in the Supabase SQL editor of the one project
  (`tueckhlrrupmnzhblewy`), by the owner; this machine cannot reach it. So: SQL files in the
  repo's flat `supabase/add-*.sql` style, idempotent, each with a PGlite test, and an owner runbook.
- **The nicoleDev preview has no Supabase env (LW-9).** Live testing on the preview covers the
  public pages (`/pricing`, `/faq`, their fallbacks), signed-out redirects for `/admin/*` and the
  new manager pages, layout and console cleanliness. Data flows are proven by PGlite SQL tests,
  Vitest unit/component tests and local browser runs; the owner's runbook ends with the live
  checks to do once env and SQL are in.
- **No Xendit secret here.** The checkout server function degrades: without
  `XENDIT_SECRET_WRITE_KEY` it answers `available: false` and the page says payments are not
  switched on yet, with the support chat as the way to ask.
- **AI is mocked (`AI_ENABLED=false`, O26)**, so AI cost is zero today. The usage pipeline is
  built now so the number is real the day a provider is switched on.
- **Money columns**: the repo stores pesos as `NUMERIC(10,2)`; the workspace rule says integer
  minor units. New billing tables use **integer centavos** *(my call)*: platform money is new,
  Naaxtech's invoicing convention is centavos, and nothing existing joins to it.

## The parts, as decided

### 1. Platform admin identity

- `public.platform_admins (user_id uuid pk → auth.users, added_at, added_by, note)`.
- `public.is_platform_admin()` SECURITY DEFINER, `STABLE`, `auth.uid()` based. Every admin
  policy uses it. RPC `am_i_platform_admin()` for the client.
- Bootstrap: the owner inserts their own `auth.users.id` from the SQL editor (the file's header
  shows the one-line INSERT). No UI to grant admin *(my call: the SQL editor is already this
  repo's operator console; an in-app grant would need a service key the web app never holds).*
- Admin pages at `/admin/*` with their own layout file `src/routes/admin.tsx` (not under `_app`,
  which builds every household store). Gate `RequirePlatformAdmin`: needs a session token, calls
  `am_i_platform_admin()`, shows "This account isn't a Linara admin" otherwise. `signedOutRedirect`
  also covers `/admin` (307 to `/login`).
- Admin nav (TopBar at `lg`, bottom bar on phones, same `BottomNavItem` shape): Overview,
  Plans, Costs, Support, FAQs. A manager who is also an admin sees an "Admin" link in the TopBar.

### 2. Plans

`public.plans`:

| column | type | meaning |
|---|---|---|
| id | uuid | |
| name, tagline | text | shown to households |
| inclusions | text[] | bullet list ("Payslips", "Unlimited SOPs"), may be empty |
| interval | text | `one_time` · `monthly` · `yearly` |
| base_centavos | bigint ≥ 0 | flat fee per period (0 allowed: a per-seat-only plan) |
| included_helpers, included_managers, included_homes | int, nullable | seats in the base fee; NULL = unlimited |
| extra_helper_centavos, extra_manager_centavos, extra_home_centavos | bigint, nullable | price per seat above included; NULL = no extras sold (hard cap) |
| trial_days | int ≥ 0 | 0 = none |
| is_public | bool | shown on `/pricing` |
| status | text | `draft` · `active` · `archived` |
| sort_order | int | |
| created_at, updated_at | timestamptz | |

This covers every shape the owner named: per extra staff (`extra_helper_centavos`), per
manager/user (`extra_manager_centavos`), per home (`extra_home_centavos`, or `base_centavos`
with `included_homes = 1`), flat with inclusions (`base_centavos` + `inclusions`, extras NULL),
flat with nothing included (`included_* = 0`, extras priced).

RLS: admins all; anyone (anon included) reads `status = 'active' AND is_public`. A household can
be on an archived plan; archiving stops new purchases only.

Admin page `/admin/plans`: list with status pills; create/edit modal with a live price preview
("A household with 2 helpers, 1 manager, 1 home pays ₱…"); Publish / Unpublish / Archive.
Public `/pricing`: active public plans as one surface with hairline rows (DESIGN.md), CTA to
`/signup`; none → "Pricing is by conversation for now" + Contact us (link to `/faq#contact`).

### 3. Subscriptions and checkout

- `public.subscriptions`: id, plan_id, owner_user_id (the buyer), status (`pending` · `trialing`
  · `active` · `past_due` · `expired` · `canceled`), helper_seats, manager_seats, home_seats,
  amount_centavos (per period, snapshot), current_period_start/end (NULL end for one-time),
  canceled_at, created_at, updated_at.
- `public.subscription_homes (subscription_id, household_id)`: which households it covers.
  Defaults to every household the buyer is primary of; the buyer can untick.
- `public.platform_invoices`: id, invoice_number (`LIN-YYYY-000001`, per-year sequence),
  subscription_id, external_id (what we send Xendit: `sub_<id>_<n>`), xendit_invoice_id,
  invoice_url, status (`pending` · `paid` · `expired` · `failed`), amount_centavos, currency
  `PHP`, period_start/end, paid_at, paid_channel, payer_email, raw_callback jsonb, created_at.
- RLS: a manager reads subscriptions/invoices covering a household they manage, and writes
  nothing directly; admins read all. All writes go through SECURITY DEFINER RPCs:
  - `quote_subscription(plan_id, helper_seats, manager_seats, home_ids[])` → amount and a
    breakdown; raises `SEATS_OVER_PLAN` when a seat count exceeds a hard cap.
  - `start_subscription(...)` → inserts a `pending` subscription + a `pending` invoice, returns
    `{subscription_id, invoice_id, external_id, amount_centavos}`. Caller must be primary of
    every home chosen.
  - `attach_xendit_invoice(invoice_id, xendit_id, url, expires_at)`.
  - `record_platform_invoice_result(external_id, xendit_id, status, paid_centavos, paid_at,
    channel, raw)` (service role, from the webhook): idempotent; on `PAID` activates the
    subscription and sets its period from `max(now, previous period_end)`; a mismatched amount
    records the payment and marks the subscription `past_due` with a note rather than
    activating.
  - `renew_subscription(subscription_id)` → a new pending invoice for the next period.
  - `cancel_subscription(subscription_id)` → `canceled_at`, entitled until period end.
  - `household_entitlements(household_id)` → `{source: 'subscription'|'free'|'none', plan_name,
    status, helper_seats, manager_seats, period_end, days_left}`.
- Web server functions (`src/features/billing/billing.actions.ts`): `getBillingFn`,
  `quoteFn`, `startCheckoutFn` (RPC, then `POST {XENDIT_API_URL}/v2/invoices` with Basic auth,
  the manager's email as payer, success/failure redirects to `/manager/plan?paid=1|0`, then
  `attach_xendit_invoice`), `renewFn`, `cancelFn`. Missing Xendit key → `{available:false}`.
- Edge function `xendit-invoice-webhook` (`verify_jwt=false`, checks `x-callback-token` against
  `XENDIT_WEBHOOK_VERIFICATION_TOKEN` like the payout webhook, service role, calls
  `record_platform_invoice_result`). Returns 200 on duplicates.
- Manager page `/manager/plan` ("Plan & billing"): current plan and seats vs usage, period and
  days left, Renew / Cancel, invoice history with Pay links for pending ones, and the plan
  picker (seat steppers, home ticks, live quote, Pay button). After `?paid=1` it polls
  `getBillingFn` for up to 20 s then shows "Paid, thank you" or "We'll mark it paid as soon as
  Xendit confirms".
- Entry points: TopBar (`lg`) "Plan" link; People → Your account rows "Plan & billing" and
  "Help & support"; a slim notice on the Pass when `past_due`/`expired` or trial ends ≤ 3 days.

### 4. Seat enforcement

- `platform_settings` single row: `free_tier_enabled bool default true`, `free_helper_seats int
  null`, `free_manager_seats int null` (NULL = unlimited), `support_email text null`,
  `updated_at`. Admin edits it on `/admin/plans` (a "Free tier" card).
- `seats_available(household_id, kind)` and a BEFORE INSERT trigger on `helper_profiles` and
  `household_managers` raising `SEAT_LIMIT:<kind>` when the household is at its limit. Counts:
  helpers with status ≠ `INACTIVE`; managers = rows in `household_managers`.
- Web: the invite paths catch `SEAT_LIMIT` and show the upgrade modal linking to
  `/manager/plan`. Mobile gets the DB error text; nothing there changes in this pass.

### 5. Costs and analytics

- `cost_entries`: id, month (date, first of month), category (`infra` · `ai` · `payments` ·
  `support` · `other`), label, amount_centavos, note, created_by, created_at. Admin-only.
- `model_prices`: model (pk), input_centavos_per_1m, output_centavos_per_1m, updated_at. Admin
  sets them; defaults seeded for `gpt-4o`, `gpt-4o-mini`, `whisper-1` (per-minute price stored
  as `output_centavos_per_1m` with `input` 0 and a note) *(my call; the admin corrects them)*.
- `ai_usage`: id, at, user_id, household_id, fn, model, input_tokens, output_tokens,
  audio_seconds, cost_centavos (computed by `price_ai_call()` at insert from `model_prices`).
  Durable (no purge). Written by the edge functions through `_shared/ai-usage.ts` after a real
  provider call (mock calls are not recorded), with the service role. Admin reads all; nobody
  else reads it.
- `platform_analytics(from, to)` SECURITY DEFINER, admin-only: totals and a monthly series.
  Definitions, stated on the page: **Revenue** = paid platform invoices by `paid_at`.
  **COGS** = cost entries by month + AI cost. **Cost per call** = AI cost ÷ AI calls
  (— when none). **Profit** = revenue − COGS. **Paying households** = households covered by a
  subscription active at any point in the range. **Users** = distinct managers of those
  households. **Profit per user** = profit ÷ users.
- `/admin` (Overview): date range (this month, last 3, this year, custom), the figures as a
  hairline table (no big-number tiles, per DESIGN.md), a monthly bar/line chart (recharts via
  `ui/chart.tsx`, dataviz skill), and the AI usage by function table. `/admin/costs`: cost
  entries (add/edit/delete) and model prices.

### 6. Support chat

- `support_threads`: id, household_id, opened_by, subject, status (`open` · `closed`),
  created_at, last_message_at, household_unread int, admin_unread int.
- `support_messages`: id, thread_id, author_id, from_admin bool, body, created_at.
- RLS: a household's managers read/insert their own household's threads and messages (helpers
  do not: the helper's Linara is the app); admins all. A trigger stamps `author_id`,
  `from_admin`, bumps `last_message_at` and the other side's unread counter. RPC
  `mark_thread_read(thread_id)`. Both tables join the realtime publication.
- `/manager/help`: FAQs first (same data as `/faq`), then "Message us": thread list, new thread,
  conversation with composer. `/admin/support`: inbox sorted by unread then recency, household
  name, conversation, Close/Reopen. Live updates by subscribing to both tables and refetching.

### 7. FAQs

- `faqs`: id, question, answer, category, sort_order, published, updated_at, updated_by. RLS:
  everyone reads published; admins all.
- `/faq`: grouped by category, accordion, anchor per question, "Still stuck? Message us" linking
  to `/manager/help` (or `/login` when signed out). Server-loaded through a server function
  with the checked-in fallback list (`src/features/faq/faq-fallback.ts`) when the table is
  unreachable or empty, so the page is never blank. `/admin/faqs`: list, add/edit/delete,
  publish toggle, reorder by sort_order field.
- Landing footer gains "FAQ" and "Pricing" links (code-owned destinations; the fixture test is
  regenerated).

### 8. Docs, ops, ship

- SQL files (apply order): `add-platform-admins.sql` → `add-plans.sql` →
  `add-subscriptions.sql` → `add-seat-limits.sql` → `add-costs-and-ai-usage.sql` →
  `add-support-chat.sql` → `add-faqs.sql`. Each: idempotent, RLS in-file, FK indexes, a
  `supabase/tests/<name>.test.mjs` appended to `test:sql`, and a KNOWN_GAPS open item saying
  "built, not applied" with the date.
- `supabase/DEPLOYMENTS.md`: new function row + callback URL note. `README.md` §12: no new
  Vercel vars; Xendit invoice callback URL setting; `platform_admins` bootstrap.
- `docs/OPERATOR-GO-LIVE.md`: the owner's ordered checklist (apply SQL, insert admin, deploy
  functions, set Xendit callback URL, LW-9 preview env, then the live checks).
- `e2e/helpers.ts`: `/pricing`, `/faq` join `PUBLIC_ROUTES`; `/manager/plan`, `/manager/help`
  join `MANAGER_ROUTES`; new `ADMIN_ROUTES` list asserted to 307 to `/login` signed out.
- CHANGELOG entry; commit per slice; push to `origin/nicoleDev` after each.

## Builder-check decisions (2026-10-19)

A fresh engineer read this document and asked five questions. Answers, all my calls:

1. **Losing an entitlement costs seats only.** No paywall: `/manager/*`, the mobile WebView and
   the helper app keep working; only new helper/manager inserts are refused. The Pass notice shows
   only when that has a consequence (past due inside the 7-day window; expired with the free tier
   off or usage above it; trial ending in ≤ 3 days).
2. **Hand-sold deals have a path.** Admin-only `mark_platform_invoice_paid_manually` (bank
   transfer, GCash, Maya, cash) and `grant_subscription` (a comp'd plan: real entitlement, ₱0
   invoice with channel `comp`, so revenue stays honest), on a new `/admin/households` page that
   lists every household with counts, plan, status and pending invoice.
3. **A platform admin is a manager account** that finished household setup (the owner's own).
   No standalone admin login in this pass.
4. **Payment returns to a public page**, `/billing/return?paid=1|0`, outside the `/manager`
   cookie gate, because the mobile app opens Xendit in the system browser where there is no web
   session. The plan page refetches on focus.
5. **Prices are final, tax-inclusive PHP amounts**; no VAT line (non-VAT BMBE). Terms get a
   short "Plans and payments" section and Privacy one line about Xendit receiving the payer's
   name and email; both flagged for owner review in KNOWN_GAPS.
6. **Checkout is fail-closed**: `PLATFORM_BILLING=on` and the Xendit key are both required; a
   sandbox key left on a deployment never switches selling on by itself.
7. **Xendit Payment Sessions, not `/v2/invoices`**: the Invoice API is legacy and billed extra
   from 2026-10-01 (research, 2026-10-19). Webhook events are `payment_session.completed` /
   `payment_session.expired`.

## Left to the builder

- Exact component composition inside each page, as long as DESIGN.md holds (one surface per
  section, hairline rows, pills only for status, 13px minimum, shared `Modal`).
- Peso formatting helper for centavos (`fmtCentavos`), next to `fmtPeso`.
- How the Pass notice is injected (a small component rendered by the Pass page, reading
  entitlements from a billing hook).
- Test data shapes in the PGlite tests, beyond the required isolation cases.

## Testing and evidence

- PGlite: every SQL file applied twice; isolation (second household / non-admin cannot read or
  write); seat trigger raises at the limit and not below; webhook RPC idempotent and amount
  mismatch path; analytics totals on a seeded month; unread counters; FAQ public read.
- Vitest: pricing quote math, invoice number format, analytics shaping, page components in each
  state (loading / empty / error / data), fallback FAQ path, `signedOutRedirect` for `/admin`.
- Playwright (public project, runs locally and on the preview): new public pages load clean;
  manager and admin routes 307 signed out.
- Local browser pass on `vite dev` of every new page with the server functions answering
  `available:false` (no DB), to see the degraded states a preview visitor sees.
