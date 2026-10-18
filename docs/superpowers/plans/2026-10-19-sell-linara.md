# Selling Linara Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-priced plans a household can buy through Xendit, a seat-enforced entitlement, admin analytics (revenue, COGS, AI cost per call, profit, profit per user), household↔admin support chat, and admin-edited public FAQs, all on `nicoleDev`.

**Architecture:** Seven hand-applied SQL files (tables + RLS + SECURITY DEFINER RPCs, each with a PGlite test) are the API; the web app calls them through TanStack Start server functions with the manager's own token (`createAuthedClient`) exactly as every existing `*.actions.ts` does. A new `/admin/*` route tree with its own layout gates on `am_i_platform_admin()`. One new edge function receives Xendit invoice callbacks; a shared helper records AI usage from the six AI functions. Public pages (`/pricing`, `/faq`) load through server functions with checked-in fallbacks so they never blank.

**Tech Stack:** TanStack Start 1.168 (`createServerFn`, file routes), React 19, Tailwind 4 + shadcn (`ui/chart.tsx` → recharts 2.15), supabase-js 2.111 (`src/lib/supabase.ts`), Deno edge functions, PGlite 0.5 SQL tests, Vitest 4 (+ jsdom per file), Playwright 1.63, Xendit Payment Sessions (`POST https://api.xendit.co/sessions`, `session_type: PAY`, `mode: PAYMENT_LINK`; the `/v2/invoices` API is legacy and billed extra from 2026-10-01, do not use it).

**Spec:** `docs/superpowers/specs/2026-10-19-sell-linara-design.md`

## Global Constraints

- Branch `nicoleDev` only. Commit per task; the coordinator commits and pushes (`git push origin nicoleDev`). Implementers never run `git add/commit/stash/mv/rm`.
- Nothing incomplete: no TODO, no stub, no `any`, no commented-out code, no unhandled error path, no `console.log` (`.claude/rules/react.md`).
- SQL files: flat `supabase/add-<topic>.sql`, header with purpose + "Apply by hand in the SQL editor" + "AFTER <file>" + "Safe to run twice" + test file name; idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` then `CREATE POLICY`); RLS enabled and policies in the same file; every FK indexed; money as **integer centavos** (`BIGINT`), currency column `'PHP'`; `timestamptz`; `id uuid DEFAULT gen_random_uuid()`.
- Every new table has a PGlite test that a second household / a non-admin cannot read or write it. Tests are plain Node `*.test.mjs` in `supabase/tests/`, apply the file **twice**, use `set_config('test.uid', …)` + `SET ROLE authenticated`, and exit non-zero on failure (copy the harness of `supabase/tests/ai-call-limits.test.mjs`). The `test:sql` chain in `package.json` already lists the seven new test files (added by the coordinator); run only your own with `node supabase/tests/<name>.test.mjs`.
- Names: `platform_admin` everywhere (never "admin" alone in SQL/TS identifiers). UI label: "Linara admin".
- Error signalling from RPCs to the web: `RAISE EXCEPTION 'CODE:detail'` where CODE ∈ `NOT_ADMIN`, `NOT_PRIMARY`, `PLAN_NOT_ACTIVE`, `SEATS_OVER_PLAN`, `SEAT_LIMIT`, `ONE_TIME_PLAN`, `NOT_FOUND`. Web code matches on the prefix.
- Server functions: `createServerFn({ method: "POST" }).validator((data: {...token: string...}) => data).handler(...)`, `createAuthedClient(data.token)` from `src/lib/supabase.ts`. A missing RPC/table (`PGRST202`, `42883`, `42P01`, message contains "does not exist"/"could not find") returns `{ available: false }` so the UI degrades before the SQL is applied (pattern: `src/features/people/household.actions.ts` L18–19).
- UI: DESIGN.md. One surface per section with hairline rows (`divide-y divide-border/60`), pills only for status, soft rectangles for actions, no uppercase eyebrows, nothing under 13px (`text-xs` is 12px → use `text-[13px]` or `text-sm`), no emoji, no big-number tiles, every overlay through `@/components/shared/modal` (`Modal({ onClose, children, size?, scroll?, closeOnBackdrop? })`), labelled inputs through `@/components/shared/field` (`Field({ label, error?, children })`), toasts via `toast` from `sonner`, icons from `lucide-react`. Loading, empty and error states on every page. Phone-first at 390px, no sideways scroll.
- Formatting: `fmtCentavos(c: number): string` → `₱1,234.50` (two decimals, thousands separators) in `src/features/billing/money.ts`; never reuse `fmtPeso` (it rounds).
- Do not touch: `MANAGER_NAV`, `linara_manager_*` keys, `/login`, `/manager/pass` URL, `src/routeTree.gen.ts` by hand (it regenerates on `vite dev`/`build`; include the regenerated file in your result).
- Checkout is fail-closed: `startCheckoutFn`/`renewFn` create a Xendit session only when `process.env.PLATFORM_BILLING === "on"` AND `XENDIT_SECRET_WRITE_KEY` is set (both read at request time on the server); otherwise `{ available: false }`. Never gate on key presence alone.
- A platform admin is a manager account that has finished household setup (the owner's own account); `/admin` never has to work for an account without a household. Losing an entitlement costs seats only (no paywall): existing pages keep working, new helper/manager inserts are refused by the trigger.
- Prices are final, tax-inclusive amounts in PHP; no VAT is computed or shown (the selling entity is non-VAT BMBE). Copy says "per month", never "+ VAT".
- Any Xendit call or payload shape carries a citation line: `// src: https://docs.xendit.co/apidocs/create-session.md · Payment Sessions · 2026-10-19` (create), `// src: https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session.md · 2026-10-19` (webhook), `// src: https://docs.xendit.co/docs/handling-webhooks.md · 2026-10-19` (x-callback-token).
- Run before reporting done: `npx tsc --noEmit`, `npx eslint <your files>`, `npx prettier --check <your files>`, `npx vitest run <your test files>`, and your SQL test. Paste the output.

## Review Focus

1. A webhook delivered twice, or for an invoice already paid, must change nothing the second time and still answer 200 (Task 3 test "second PAID callback is a no-op").
2. A household already at its helper limit must be refused the next invite at the database, and one below it must not be (Task 3 test "seat trigger").
3. `/pricing` and `/faq` with no database env must render the fallback copy with a 200 and no console error (Task 9 and Task 10 component tests; Task 15 e2e on the preview).
4. A manager who is not a platform admin opening `/admin/plans` must see "not a Linara admin", never a blank page or another household's data (Task 8 test; Task 2/5/6/7 isolation tests).
5. A Xendit callback whose paid amount differs from the invoice must not activate the subscription (Task 3 test "amount mismatch marks past_due").

---

## Waves (file scopes never overlap inside a wave)

| Wave | Tasks | Runs after |
|---|---|---|
| 0 | 1 | — |
| 1 | 2, 5, 6, 7 | 1 |
| 2 | 3 | 2 |
| 3 | 8, 9, 10 | 1–7 |
| 4 | 11, 12, 13, 14, 16 | 8, 9, 10 |
| 5 | 15 | all |

---

### Task 1: Platform admins (SQL)

**Files:**
- Create: `supabase/add-platform-admins.sql`
- Test: `supabase/tests/platform-admins.test.mjs`

**Interfaces:**
- Produces: table `public.platform_admins(user_id uuid PK → auth.users ON DELETE CASCADE, added_at timestamptz NOT NULL DEFAULT now(), added_by uuid NULL, note text NULL)`; `public.is_platform_admin() RETURNS boolean` SECURITY DEFINER STABLE `SET search_path = public` (`EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())`); `public.am_i_platform_admin() RETURNS boolean` (wrapper, GRANT EXECUTE to `authenticated`). RLS: `platform_admins_read` SELECT for `authenticated` USING `(user_id = auth.uid() OR is_platform_admin())`; no INSERT/UPDATE/DELETE policy (writes only from the SQL editor). File header shows the bootstrap: `INSERT INTO public.platform_admins (user_id, note) SELECT id, 'owner' FROM auth.users WHERE email = '<you>' ON CONFLICT DO NOTHING;`.

- [ ] **Step 1: Write the failing test** `platform-admins.test.mjs`: after base-schema + file twice: `am_i_platform_admin()` is false for uid A; owner inserts A; true for A, false for B; B cannot `SELECT` A's row (0 rows); B cannot `INSERT` (error or 0 rows).
- [ ] **Step 2: Run** `node supabase/tests/platform-admins.test.mjs` → fails (file missing).
- [ ] **Step 3: Write the SQL** per Interfaces.
- [ ] **Step 4: Run the test** → every line `ok`, exit 0.

---

### Task 2: Plans and platform settings (SQL)

**Files:**
- Create: `supabase/add-plans.sql`
- Test: `supabase/tests/plans.test.mjs` (loads base-schema, `add-platform-admins.sql`, then this file twice)

**Interfaces:**
- Produces table `public.plans`: `id uuid PK DEFAULT gen_random_uuid()`, `name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60)`, `tagline text NOT NULL DEFAULT ''`, `inclusions text[] NOT NULL DEFAULT '{}'`, `interval text NOT NULL CHECK (interval IN ('one_time','monthly','yearly'))`, `base_centavos bigint NOT NULL DEFAULT 0 CHECK (>= 0)`, `included_helpers int NULL CHECK (>= 0)`, `included_managers int NULL CHECK (>= 0)`, `included_homes int NULL CHECK (>= 0)`, `extra_helper_centavos bigint NULL CHECK (>= 0)`, `extra_manager_centavos bigint NULL CHECK (>= 0)`, `extra_home_centavos bigint NULL CHECK (>= 0)`, `trial_days int NOT NULL DEFAULT 0 CHECK (>= 0)`, `is_public boolean NOT NULL DEFAULT false`, `status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived'))`, `sort_order int NOT NULL DEFAULT 0`, `created_at`, `updated_at` (BEFORE UPDATE trigger `plans_touch` sets `updated_at = now()`). Index `plans_public_idx (status, is_public, sort_order)`.
- Produces table `public.platform_settings`: `id int PK CHECK (id = 1)`, `free_tier_enabled boolean NOT NULL DEFAULT true`, `free_helper_seats int NULL CHECK (>= 0)`, `free_manager_seats int NULL CHECK (>= 0)`, `support_email text NULL`, `updated_at timestamptz NOT NULL DEFAULT now()`; seeded `INSERT … (1) ON CONFLICT DO NOTHING`.
- RLS: `plans_public_read` SELECT for `anon, authenticated` USING `(status = 'active' AND is_public)`; `plans_platform_admin_all` ALL for `authenticated` USING/WITH CHECK `is_platform_admin()`. `platform_settings_read` SELECT for `authenticated` USING true; `platform_settings_platform_admin_write` UPDATE for `authenticated` USING/WITH CHECK `is_platform_admin()`; no INSERT/DELETE policy. GRANT SELECT on `plans` to `anon`.

- [ ] **Step 1: Failing test** `plans.test.mjs`: non-admin cannot INSERT a plan (0 rows / error); admin inserts a draft (`name 'Starter', interval 'monthly', base_centavos 49900`); non-admin sees 0 plans; admin sets `status='active', is_public=true`; non-admin sees 1; `SET ROLE anon` sees 1 and cannot see a second draft; `updated_at` moves on update; `platform_settings` has exactly one row, non-admin can read, cannot update (0 rows), admin can; CHECK rejects `interval 'weekly'` and `base_centavos -1`.
- [ ] **Step 2: Run** → fails. **Step 3: Write the SQL.** **Step 4: Run** → all ok.

---

### Task 3: Subscriptions, invoices, entitlements, seat limits (SQL)

**Files:**
- Create: `supabase/add-subscriptions.sql`, `supabase/add-seat-limits.sql`
- Test: `supabase/tests/subscriptions.test.mjs`, `supabase/tests/seat-limits.test.mjs` (both load base-schema, then as `household-managers.test.mjs` does: `fix-helper-write-access.sql`, `add-account-deletion.sql`, `add-household-managers.sql`, then `add-platform-admins.sql`, `add-plans.sql`, then the file under test twice). Add `CREATE ROLE service_role;` in the test preamble if base-schema lacks it, and `GRANT` as the file does.

**Interfaces (add-subscriptions.sql):**
- `public.subscriptions`: `id uuid PK`, `plan_id uuid NOT NULL → plans`, `owner_user_id uuid NOT NULL → auth.users`, `status text NOT NULL CHECK IN ('pending','trialing','active','past_due','expired','canceled')`, `helper_seats int NULL`, `manager_seats int NULL`, `home_seats int NOT NULL DEFAULT 1`, `amount_centavos bigint NOT NULL`, `current_period_start timestamptz NULL`, `current_period_end timestamptz NULL`, `canceled_at timestamptz NULL`, `note text NULL`, `created_at`, `updated_at`. Indexes on `plan_id`, `owner_user_id`.
- `public.subscription_homes (subscription_id uuid → subscriptions ON DELETE CASCADE, household_id uuid → households ON DELETE CASCADE, PRIMARY KEY (subscription_id, household_id))`, index on `household_id`.
- `public.platform_invoice_counters (year int PK, last int NOT NULL DEFAULT 0)` and `public.next_platform_invoice_number() RETURNS text` → `LIN-2026-000001` (zero-padded 6, per year, row lock).
- `public.platform_invoices`: `id uuid PK`, `invoice_number text UNIQUE NOT NULL`, `subscription_id uuid NOT NULL → subscriptions`, `external_id text UNIQUE NOT NULL` (`'sub_' || subscription_id || '_' || n`), `xendit_session_id text NULL`, `payment_url text NULL`, `expires_at timestamptz NULL`, `status text NOT NULL DEFAULT 'pending' CHECK IN ('pending','paid','expired','failed')`, `amount_centavos bigint NOT NULL`, `currency text NOT NULL DEFAULT 'PHP'`, `period_start timestamptz NOT NULL`, `period_end timestamptz NULL`, `paid_at timestamptz NULL`, `paid_centavos bigint NULL`, `paid_channel text NULL`, `payer_email text NULL`, `raw_callback jsonb NULL`, `created_at`. Index on `subscription_id`, `status`.
- RLS (all three tables): SELECT for `authenticated` USING (`is_platform_admin()` OR the row's subscription has a home in `my_household_ids()` OR `owner_user_id = auth.uid()`); no direct INSERT/UPDATE/DELETE policies. `my_household_ids()` exists from `add-household-managers.sql`.
- RPCs (all `SECURITY DEFINER SET search_path = public`, GRANT EXECUTE to `authenticated` unless noted):
  - `quote_subscription(p_plan_id uuid, p_helper_seats int, p_manager_seats int, p_home_ids uuid[]) RETURNS jsonb` → `{amount_centavos, base_centavos, helper_extra_centavos, manager_extra_centavos, home_extra_centavos, helper_seats, manager_seats, home_seats, interval}`. Extra = `GREATEST(0, seats - COALESCE(included, seats)) * extra_price`. If `extra_*_centavos IS NULL AND included_* IS NOT NULL AND seats > included_*` → `RAISE 'SEATS_OVER_PLAN:<helper|manager|home>'`. Plan must be `active` else `PLAN_NOT_ACTIVE`. `p_home_ids` must be non-empty.
  - `start_subscription(same args) RETURNS jsonb` → `{subscription_id, invoice_id, external_id, invoice_number, amount_centavos, status}`. Caller must have `household_managers.role = 'primary'` on every home (`NOT_PRIMARY`). Creates the subscription (`pending`, seats, amount from the quote, homes rows) and, unless `plan.trial_days > 0` and no prior subscription row covers any of these homes (then `trialing`, `current_period_start = now()`, `current_period_end = now() + trial_days`, no invoice, `invoice_id` null), one `pending` invoice with `period_start = now()` and `period_end = now() + interval` (NULL for `one_time`).
  - `attach_xendit_invoice(p_invoice_id uuid, p_xendit_id text, p_url text, p_expires_at timestamptz) RETURNS void` — sets `xendit_session_id`, `payment_url`, `expires_at`; caller must own the subscription (`NOT_FOUND`).
  - `record_platform_invoice_result(p_external_id text, p_xendit_id text, p_status text, p_paid_centavos bigint, p_paid_at timestamptz, p_channel text, p_raw jsonb) RETURNS jsonb` → `{applied boolean, invoice_status, subscription_status}`. REVOKE from `anon, authenticated`; GRANT to `service_role`. Unknown external_id → `{applied:false, invoice_status:null}`. Invoice already `paid`/`expired`/`failed` → `applied:false`, no change. `p_status = 'PAID'` with `p_paid_centavos IS NULL OR p_paid_centavos = amount_centavos` (a Payment Session is created by us at a fixed amount, and its completed webhook does not reliably carry one, so NULL means "as invoiced") → invoice `paid` (+paid_at, paid_centavos, paid_channel, raw_callback), subscription `active`, `current_period_start = GREATEST(now(), COALESCE(previous current_period_end, now()))`… precisely: `start = CASE WHEN current_period_end IS NOT NULL AND current_period_end > now() THEN current_period_end ELSE now() END`, `current_period_end = start + interval` (NULL for one_time), `amount_centavos = invoice.amount_centavos`. `PAID` with a non-null different amount → invoice `paid`, subscription `past_due`, `note = 'Paid ₱x for an invoice of ₱y; check in Xendit'`. `EXPIRED` → invoice `expired`; subscription stays as it was. Anything else → `failed`.
  - `renew_subscription(p_subscription_id uuid) RETURNS jsonb` → same shape as start plus `reused boolean`. Owner only. `ONE_TIME_PLAN` for one-time plans. If a `pending` invoice exists, return it with `reused:true`; else create one for the next period (`period_start = GREATEST(now(), COALESCE(current_period_end, now()))`).
  - `cancel_subscription(p_subscription_id uuid) RETURNS void` — owner only; sets `status='canceled', canceled_at=now()` (entitled until `current_period_end`).
  - `mark_platform_invoice_paid_manually(p_invoice_id uuid, p_channel text, p_note text) RETURNS jsonb` — admin only (`NOT_ADMIN`); applies the same transition as a PAID callback with `paid_centavos = amount_centavos`, `paid_channel = 'manual:' || p_channel` (e.g. `manual:bank_transfer`, `manual:gcash`), `raw_callback = jsonb_build_object('manual', true, 'note', p_note, 'by', auth.uid())`; `applied:false` when already terminal.
  - `grant_subscription(p_household_id uuid, p_plan_id uuid, p_helper_seats int, p_manager_seats int, p_period_end timestamptz, p_note text) RETURNS jsonb` — admin only; creates an `active` subscription owned by the household's primary manager (`owner_user_id`), one home, `amount_centavos 0`, period `now()`→`p_period_end` (NULL allowed = no end), and a `paid` invoice of 0 with `paid_channel 'comp'` and `note`; returns `{subscription_id, invoice_id}`. Revenue stays honest (0) while the entitlement is real.
  - `platform_households_overview() RETURNS jsonb` — admin only; `[{household_id, name, created_at, managers, helpers, entitlements: <household_entitlements json>, pending_invoice: {id, invoice_number, amount_centavos, created_at} | null}]` ordered by name.
  - `household_entitlements(p_household_id uuid) RETURNS jsonb` → `{source: 'subscription'|'free'|'none', subscription_id, plan_name, status, effective_status, helper_seats, manager_seats, period_end, days_left}`. Picks the covering subscription with the latest `current_period_end` whose `status IN ('trialing','active','past_due','canceled')`. `effective_status`: `canceled` and `period_end < now()` → `expired`; `period_end < now() - interval '7 days'` → `expired`; `period_end < now()` → `past_due`; else `status`. When `effective_status = 'expired'` or no subscription: `source = 'free'` if `platform_settings.free_tier_enabled` (seats from `free_*_seats`, NULL = unlimited) else `'none'` (seats 0). Caller must manage the household or be admin.
- `subscriptions_touch` updated_at trigger.

**Interfaces (add-seat-limits.sql, applied AFTER add-subscriptions.sql):**
- `public.seat_limit(p_household_id uuid, p_kind text) RETURNS int` (NULL = unlimited) from `household_entitlements` (SECURITY DEFINER, no caller check — internal, REVOKE from anon/authenticated).
- `public.seats_used(p_household_id uuid, p_kind text) RETURNS int`: helper → `COUNT(*) FROM helper_profiles WHERE household_id = p AND status <> 'INACTIVE'`; manager → `COUNT(*) FROM household_managers WHERE household_id = p`.
- Trigger function `public.enforce_seat_limit() RETURNS trigger`: kind by `TG_TABLE_NAME` (`helper_profiles` → helper, `household_managers` → manager); if `seat_limit` not null and `seats_used >= seat_limit` → `RAISE EXCEPTION 'SEAT_LIMIT:%', kind`. Triggers `helper_profiles_seat_limit` and `household_managers_seat_limit` BEFORE INSERT FOR EACH ROW (`DROP TRIGGER IF EXISTS` first).

- [ ] **Step 1: Failing tests.** `subscriptions.test.mjs`: primary P of household H1 (owner inserts households, user_profiles, household_managers rows as `household-managers.test.mjs` does), admin publishes plan `monthly, base 49900, included_helpers 1, extra_helper 9900, included_managers 2, extra_manager NULL`. Asserts: quote for 3 helpers, 2 managers, [H1] = 49900 + 2×9900 = 69700; quote with 3 managers raises `SEATS_OVER_PLAN:manager`; co-manager C of H1 calling `start_subscription` raises `NOT_PRIMARY`; P starts → invoice `LIN-<year>-000001`, `external_id` = `sub_<id>_1`, subscription `pending`; a second start's invoice number ends `000002`; manager of H2 sees 0 subscriptions/invoices, P sees 1; `record_platform_invoice_result` as `service_role` with PAID 69700 → `{applied:true}`, subscription `active`, `current_period_end` ≈ now + 1 month; second identical call → `{applied:false}` and nothing changed; `renew_subscription` → new pending invoice, `reused:false`; calling again → `reused:true`, same invoice id; PAID on the renewal with 69700 → period_end moved +1 month from the previous end; a start on a `one_time` plan then `renew_subscription` → `ONE_TIME_PLAN`; a PAID with 100 on a 69700 invoice → invoice paid, subscription `past_due`, note set; a PAID with NULL amount on a fresh invoice → `applied:true`, subscription `active`; `household_entitlements(H1)` → `source 'subscription'`, `helper_seats 3`; `household_entitlements(H2)` → `source 'free'`, seats null; after `UPDATE platform_settings SET free_tier_enabled=false` → `source 'none'`, seats 0; `cancel_subscription` by C raises `NOT_FOUND`, by P sets canceled with period_end kept; trial plan (`trial_days 14`) start → `trialing`, `invoice_id` null, period_end ≈ now+14d; `authenticated` cannot execute `record_platform_invoice_result` (permission error); `mark_platform_invoice_paid_manually` by a non-admin raises `NOT_ADMIN`, by admin on a pending invoice activates the subscription with `paid_channel 'manual:gcash'`, and again → `applied:false`; `grant_subscription(H2, plan, 2, 2, now()+30d, 'pilot')` → `household_entitlements(H2)` source `subscription`, helper_seats 2, and a paid invoice of 0 with channel `comp`; `platform_households_overview()` lists both households with manager/helper counts and the pending invoice for H1 (null for H2). `seat-limits.test.mjs`: free tier `free_helper_seats = 1`: inserting the 1st helper into H1 ok, the 2nd raises `SEAT_LIMIT:helper`; an INACTIVE helper does not count; `free_manager_seats = 1`: the 2nd `household_managers` row raises `SEAT_LIMIT:manager`; with an active subscription of 3 helper seats the 2nd and 3rd helper insert ok and the 4th raises; `free_helper_seats = NULL` → no limit.
- [ ] **Step 2: Run both** → fail. **Step 3: Write both SQL files.** **Step 4: Run** → all ok, exit 0.

---

### Task 4: (merged into Task 3)

---

### Task 5: Costs, AI usage, analytics (SQL)

**Files:**
- Create: `supabase/add-costs-and-ai-usage.sql`
- Test: `supabase/tests/costs-and-ai-usage.test.mjs` (loads base-schema, household-managers chain as Task 3, `add-platform-admins.sql`, `add-plans.sql`, `add-subscriptions.sql`, then this file twice; `CREATE ROLE service_role` if missing)

**Interfaces:**
- `public.cost_entries`: `id uuid PK`, `month date NOT NULL CHECK (month = date_trunc('month', month)::date)`, `category text NOT NULL CHECK IN ('infra','ai','payments','support','other')`, `label text NOT NULL`, `amount_centavos bigint NOT NULL CHECK (>= 0)`, `note text NULL`, `created_by uuid NULL`, `created_at`. Index `(month)`. RLS: ALL for `authenticated` USING/WITH CHECK `is_platform_admin()`.
- `public.model_prices`: `model text PK`, `input_centavos_per_1m bigint NOT NULL DEFAULT 0`, `output_centavos_per_1m bigint NOT NULL DEFAULT 0`, `audio_centavos_per_minute bigint NOT NULL DEFAULT 0`, `note text NULL`, `updated_at`. Seed `ON CONFLICT DO NOTHING`: `gpt-4o` (14000, 56000, 0, 'USD list ×56 ₱/$ — set yours'), `gpt-4o-mini` (840, 3360, 0, same note), `whisper-1` (0, 0, 34, same note). RLS: admin ALL; SELECT also for `service_role` via GRANT (no RLS bypass needed: service_role bypasses).
- `public.ai_usage`: `id bigserial PK`, `at timestamptz NOT NULL DEFAULT now()`, `user_id uuid NULL`, `household_id uuid NULL`, `fn text NOT NULL`, `model text NOT NULL`, `input_tokens int NOT NULL DEFAULT 0`, `output_tokens int NOT NULL DEFAULT 0`, `audio_seconds numeric(10,2) NOT NULL DEFAULT 0`, `cost_centavos bigint NOT NULL DEFAULT 0`. Indexes `(at)`, `(household_id)`. RLS: SELECT for `authenticated` USING `is_platform_admin()`; nothing else. REVOKE INSERT from authenticated.
- `public.price_ai_call(p_model text, p_input int, p_output int, p_audio_seconds numeric) RETURNS bigint` = `round(input×in/1e6 + output×out/1e6 + audio_seconds/60×audio)`; unknown model → 0.
- `public.record_ai_usage(p_user_id uuid, p_household_id uuid, p_fn text, p_model text, p_input_tokens int, p_output_tokens int, p_audio_seconds numeric) RETURNS bigint` (the cost) — SECURITY DEFINER, GRANT to `service_role` only; inserts with `cost_centavos = price_ai_call(...)`. `household_id` may be looked up from `user_profiles.household_id` when NULL.
- `public.platform_analytics(p_from date, p_to date) RETURNS jsonb` — admin only (`NOT_ADMIN`); range inclusive of `p_from`, exclusive of `p_to + 1 day`. Returns `{ revenue_centavos, cogs_centavos, cost_entries_centavos, ai_cost_centavos, ai_calls, cost_per_call_centavos (null when ai_calls = 0), profit_centavos, paying_households, users, profit_per_user_centavos (null when users = 0), series: [{month: 'YYYY-MM', revenue_centavos, cogs_centavos, profit_centavos, ai_calls}], ai_by_fn: [{fn, calls, cost_centavos, input_tokens, output_tokens}] }`. Definitions: revenue = `platform_invoices.paid_centavos` where `status='paid'` and `paid_at` in range; cost entries by `month` in range (a month counts when its first day is in range); AI cost by `at`; paying_households = distinct `subscription_homes.household_id` whose subscription has `status IN ('active','past_due','canceled')` and `current_period_start <= range_end AND COALESCE(current_period_end, 'infinity') >= range_start`; users = distinct `household_managers.user_id` of those households.

- [ ] **Step 1: Failing test**: non-admin cannot read/insert cost_entries or ai_usage; admin inserts cost `2026-10-01 infra 150000`; `record_ai_usage` as service_role for `gpt-4o-mini` 1000 in / 500 out → cost = round(1000×840/1e6 + 500×3360/1e6) = round(0.84+1.68) = 3; `authenticated` cannot execute it; a paid invoice of 69700 on 2026-10-05 for household H1 (via Task 3 RPCs) → `platform_analytics('2026-10-01','2026-10-31')` = revenue 69700, cogs 150003, profit −80303, ai_calls 1, cost_per_call 3, paying_households 1, users = number of H1 managers, series has one 2026-10 entry, `ai_by_fn` one row; non-admin → `NOT_ADMIN`; CHECK rejects a mid-month `month`.
- [ ] **Step 2: Run** → fail. **Step 3: Write the SQL.** **Step 4: Run** → ok.

---

### Task 6: Support chat (SQL)

**Files:**
- Create: `supabase/add-support-chat.sql`
- Test: `supabase/tests/support-chat.test.mjs` (base-schema + household-managers chain + `add-platform-admins.sql` + this file twice)

**Interfaces:**
- `public.support_threads`: `id uuid PK`, `household_id uuid NOT NULL → households`, `opened_by uuid NOT NULL → auth.users`, `subject text NOT NULL CHECK (length BETWEEN 1 AND 120)`, `status text NOT NULL DEFAULT 'open' CHECK IN ('open','closed')`, `created_at`, `last_message_at timestamptz NOT NULL DEFAULT now()`, `household_unread int NOT NULL DEFAULT 0`, `platform_admin_unread int NOT NULL DEFAULT 0`. Indexes `(household_id)`, `(status, last_message_at DESC)`.
- `public.support_messages`: `id uuid PK`, `thread_id uuid NOT NULL → support_threads ON DELETE CASCADE`, `author_id uuid NOT NULL`, `from_platform_admin boolean NOT NULL DEFAULT false`, `body text NOT NULL CHECK (length BETWEEN 1 AND 4000)`, `created_at`. Index `(thread_id, created_at)`.
- RLS SELECT on both: `is_platform_admin() OR household_id IN (SELECT my_household_ids())` (messages via their thread). No direct INSERT/UPDATE/DELETE policies; writes via RPC:
  - `open_support_thread(p_household_id uuid, p_subject text, p_body text) RETURNS uuid` — caller must manage the household (`NOT_FOUND` otherwise); creates thread + first message (`platform_admin_unread = 1`).
  - `post_support_message(p_thread_id uuid, p_body text) RETURNS uuid` — caller is an admin (`from_platform_admin = true`, bumps `household_unread`) or a manager of the thread's household (bumps `platform_admin_unread`); updates `last_message_at`; reopens a closed thread when a manager posts.
  - `mark_support_thread_read(p_thread_id uuid) RETURNS void` — zeroes the caller's side.
  - `set_support_thread_status(p_thread_id uuid, p_status text) RETURNS void` — admin only (`NOT_ADMIN`).
- Realtime: `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='support_threads') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads, public.support_messages; END IF; END $$;` plus `REPLICA IDENTITY FULL` on both.

- [ ] **Step 1: Failing test**: manager M1 of H1 opens a thread → thread + 1 message, `platform_admin_unread 1`; M2 of H2 sees 0 threads and `post_support_message` on it raises `NOT_FOUND`; admin A sees 1, posts → `household_unread 1`, `from_platform_admin true`, `platform_admin_unread` still 1; `mark_support_thread_read` as A → `platform_admin_unread 0`; as M1 → `household_unread 0`; A closes; M1 posts → status back to `open`; M1 cannot call `set_support_thread_status` (`NOT_ADMIN`); direct `INSERT INTO support_messages` as M1 → 0 rows/error; `body` of 4001 chars rejected.
- [ ] **Step 2: Run** → fail. **Step 3: Write the SQL.** **Step 4: Run** → ok.

---

### Task 7: FAQs (SQL)

**Files:**
- Create: `supabase/add-faqs.sql`
- Test: `supabase/tests/faqs.test.mjs` (base-schema + `add-platform-admins.sql` + this file twice)

**Interfaces:**
- `public.faqs`: `id uuid PK`, `question text NOT NULL CHECK (length BETWEEN 1 AND 200)`, `answer text NOT NULL CHECK (length BETWEEN 1 AND 4000)`, `category text NOT NULL DEFAULT 'General' CHECK (length BETWEEN 1 AND 40)`, `sort_order int NOT NULL DEFAULT 0`, `published boolean NOT NULL DEFAULT false`, `updated_at`, `updated_by uuid NULL`. Index `(published, category, sort_order)`. `faqs_touch` trigger. RLS: `faqs_public_read` SELECT for `anon, authenticated` USING `published`; `faqs_platform_admin_all` ALL for `authenticated` USING/WITH CHECK `is_platform_admin()`. GRANT SELECT to `anon`.

- [ ] **Step 1: Failing test**: non-admin insert refused; admin inserts 2 (one published); anon sees 1; non-admin sees 1; admin sees 2; admin updates → `updated_at` moves; CHECK rejects empty question.
- [ ] **Step 2–4** as above.

---

### Task 8: Admin shell, gate, nav, redirect (web)

**Files:**
- Create: `src/features/platform-admin/platform-admin.actions.ts`, `src/features/platform-admin/hooks/use-platform-admin-session.ts`, `src/features/platform-admin/components/platform-admin-shell.tsx`, `src/features/platform-admin/components/require-platform-admin.tsx`, `src/features/platform-admin/platform-admin-nav.constants.ts`, `src/routes/admin.tsx`
- Modify: `src/lib/signed-in-cookie.ts:44` (cover `/admin` and `/admin/*` too), `src/lib/signed-in-cookie.test.ts` (or create), `src/features/people/hooks/use-session.ts` (three additive exports, no other change: `readStoredManagerToken(): string | null` (reads `TOKEN_KEY`), the existing `renewStoredSession` and `isDueForRenewal`, and `clearStoredManagerSession(): void` = the body of `clear`), `src/features/dashboard/components/top-bar.tsx` (when authed: "Plan" → `/manager/plan`, "Help" → `/manager/help` links beside Log out at `sm+`, and "Admin" → `/admin` only when `usePlatformAdminFlag()` says so)
- Test: `src/features/platform-admin/components/require-platform-admin.test.tsx` (jsdom), `src/lib/signed-in-cookie.test.ts`

**Interfaces:**
- Consumes: RPC `am_i_platform_admin()`.
- Produces: `amIPlatformAdminFn({ data: { token } }) → { available: boolean; isPlatformAdmin: boolean }`; `usePlatformAdminSession(): { status: 'loading'|'anon'|'not_admin'|'admin'|'unavailable'; token: string | null; userId: string | null; logOut: () => void }` (reads the stored token, renews it first with `renewStoredSession` when `isDueForRenewal`, calls the fn once; `unavailable` when `available:false`; `logOut` = `clearStoredManagerSession` + `markSignedIn(false)` + navigate `/login`); `usePlatformAdminFlag(): boolean` (same call, cached in module scope per token, for the TopBar); `PLATFORM_ADMIN_NAV: BottomNavItem[]` = Overview `/admin`, Households `/admin/households`, Plans `/admin/plans`, Costs `/admin/costs`, Support `/admin/support`, FAQs `/admin/faqs` (icons: `BarChart3`, `Home`, `Tags`, `Receipt`, `MessagesSquare`, `CircleHelp`); `PlatformAdminShell({ children })` = header (wordmark + "Linara admin" + `lg` nav + "Back to dashboard" link to `/manager/pass` + Log out) + content well + `BottomNav` on phones; `RequirePlatformAdmin({ children })` renders a spinner while loading, redirects `anon` to `/login`, shows a one-surface message "This account isn't a Linara admin." with a link to `/manager/pass` for `not_admin`, "Admin tools aren't switched on yet" for `unavailable`, children for `admin`. `src/routes/admin.tsx`: `createFileRoute('/admin')` with `component` = `RequirePlatformAdmin` → `PlatformAdminShell` → `<Outlet />`, `errorComponent: RouteError`, `head` title "Linara admin".

- [ ] **Step 1: Failing tests**: `signedOutRedirect(new Request('https://x/admin/plans'))` → 307 to `/login`; with the cookie → null; `/admin-ish` → null. `RequirePlatformAdmin` with a mocked `usePlatformAdminSession` for each status renders the four outcomes (use `vi.mock`).
- [ ] **Step 2: Run** → fail. **Step 3: Implement.** **Step 4: Run tests + tsc + lint** → pass; `npx vite build` regenerates `routeTree.gen.ts` (include it).

---

### Task 9: FAQs (web)

**Files:**
- Create: `src/features/faq/faq.types.ts`, `src/features/faq/faq-fallback.ts`, `src/features/faq/faq.actions.ts`, `src/features/faq/components/faq-list.tsx`, `src/features/faq/pages/faq-page.tsx`, `src/features/faq/pages/platform-admin-faqs-page.tsx`, `src/routes/faq.tsx`, `src/routes/admin/faqs.tsx`
- Modify: `src/features/landing/landing-view.tsx` (footer: add `FAQ` → `/faq` and `Pricing` → `/pricing` links before Privacy), `src/features/landing/landing-view.test.tsx` (href list), `src/features/landing/__fixtures__/landing.pre-cms.html` (regenerate by rendering `LANDING_FALLBACK`, as the test does)
- Test: `src/features/faq/faq.actions.test.ts`, `src/features/faq/components/faq-list.test.tsx` (jsdom), `src/features/faq/pages/platform-admin-faqs-page.test.tsx` (jsdom)

**Interfaces:**
- `Faq = { id: string; question: string; answer: string; category: string; sortOrder: number; published: boolean }`.
- `FAQ_FALLBACK: Faq[]` — 8 entries written from PRODUCT.md / plan.md facts only (what Linara is, who it is for, the kasambahay app, payslips, privacy wall, pricing "by conversation for now", how to get help, data deletion). Category `General`, `Pay`, `Privacy`, `Help`.
- `loadFaqsFn({ data: {} }) → { faqs: Faq[]; source: 'db' | 'fallback' }` — anon client select `published = true` ordered by `category, sort_order`; any error or empty → fallback. `listAllFaqsFn({ data: { token } })`, `saveFaqFn({ data: { token, faq: Omit<Faq,'id'> & { id?: string } } })`, `deleteFaqFn({ data: { token, id } })` → `{ available: boolean, ... }`.
- `FaqList({ faqs, contactHref })`: grouped by category, shadcn `Accordion`, each item `id` = slug of the question for anchors, footer line "Still stuck? Message us" → `contactHref`.
- `/faq` route: `loader: () => loadFaqsFn()`, head title "Linara — FAQ", page with `FaqList` and `contactHref` = `/manager/help`; `/admin/faqs`: list with published pill, Add/Edit modal (`Field`s: question, answer textarea, category, sort order, published switch), Delete with confirm modal, states loading/empty/error/unavailable.

- [ ] **Step 1: Failing tests**: `loadFaqsFn` returns fallback with `source 'fallback'` when the client throws (mock `@/lib/supabase`); `FaqList` renders one group per category and an anchor id per question; admin page shows "Admin tools aren't switched on yet" on `available:false`, the empty state copy "No FAQs yet" on `[]`, and the rows on data; landing hrefs now `["/login","/signup","/signup?step=household","/signup?step=join","/signup?step=kasambahay","/faq","/pricing","/privacy","/terms"]` (confirm order against the rendered footer).
- [ ] **Step 2–4** as above (regenerate fixture; run landing tests too).

---

### Task 10: Plans domain, admin plans page, public pricing (web)

**Files:**
- Create: `src/features/billing/money.ts`, `src/features/billing/plan.types.ts`, `src/features/billing/plan.pricing.ts`, `src/features/billing/plan.actions.ts`, `src/features/billing/components/plan-form-modal.tsx`, `src/features/billing/components/plan-card.tsx`, `src/features/billing/pages/platform-admin-plans-page.tsx`, `src/features/billing/pages/pricing-page.tsx`, `src/routes/pricing.tsx`, `src/routes/admin/plans.tsx`
- Test: `src/features/billing/money.test.ts`, `src/features/billing/plan.pricing.test.ts`, `src/features/billing/pages/pricing-page.test.tsx` (jsdom), `src/features/billing/pages/platform-admin-plans-page.test.tsx` (jsdom)

**Interfaces:**
- `fmtCentavos(c: number): string` (`₱1,234.50`; negative → `−₱…`).
- `PlanInterval = 'one_time'|'monthly'|'yearly'`; `Plan = { id, name, tagline, inclusions: string[], interval, baseCentavos, includedHelpers: number|null, includedManagers: number|null, includedHomes: number|null, extraHelperCentavos: number|null, extraManagerCentavos: number|null, extraHomeCentavos: number|null, trialDays, isPublic, status: 'draft'|'active'|'archived', sortOrder }`; `PlatformSettings = { freeTierEnabled, freeHelperSeats: number|null, freeManagerSeats: number|null, supportEmail: string|null }`; `planFromRow(row)`/`planToRow(plan)` mappers.
- `quoteAmount(plan: Plan, seats: { helpers: number; managers: number; homes: number }): { ok: true; amountCentavos: number; lines: { label: string; centavos: number }[] } | { ok: false; over: 'helper'|'manager'|'home' }` — same arithmetic as the SQL `quote_subscription`; `intervalLabel(i)` → "one-time" / "per month" / "per year"; `describePlanPricing(plan)` → one sentence ("₱499.00 per month, 1 helper included, ₱99.00 per extra helper").
- Server fns: `listPublicPlansFn({ data: {} }) → { available, plans }` (anon client), `listAllPlansFn({ data: { token } })`, `savePlanFn({ data: { token, plan } })`, `setPlanStatusFn({ data: { token, id, status } })`, `getPlatformSettingsFn`, `savePlatformSettingsFn({ data: { token, settings } })`.
- `/pricing` route: `loader: () => listPublicPlansFn()`, page = one surface listing plans (name, tagline, `describePlanPricing`, inclusions as hairline rows), CTA "Get started" → `/signup?step=household`; no plans → "Pricing is by conversation for now." + "Message us" → `/faq#contact`... use `/manager/help` for signed-in, `/login` otherwise is not knowable server-side: link to `/faq` section "Help". `/admin/plans`: list (status pill, interval, price sentence), New plan / Edit → `PlanFormModal` (all fields, `Field`s, number inputs in pesos converted to centavos, "unlimited" checkboxes for included seats, "not sold" checkboxes for extras, inclusions textarea one per line, live preview "A household with 2 helpers, 1 manager, 1 home pays ₱…" via `quoteAmount`), Publish/Unpublish/Archive actions, and a "Free tier" surface editing `PlatformSettings`.

- [ ] **Step 1: Failing tests**: `fmtCentavos(123456)` = `₱1,234.56`, `fmtCentavos(0)` = `₱0.00`; `quoteAmount` for the Task 3 example = 69700 with three lines; over cap → `{ok:false, over:'manager'}`; unlimited (null included) → no extra; pricing page renders fallback copy on `available:false` and on `[]`, and the plan rows on data; admin plans page: unavailable copy, empty copy "No plans yet", rows, and the form's preview text for the example.
- [ ] **Step 2–4** as above.

---

### Task 11: Household billing: checkout, plan page, seat-limit prompts (web)

**Files:**
- Create: `src/features/billing/billing.types.ts`, `src/features/billing/billing.actions.ts`, `src/features/billing/xendit-sessions.ts`, `src/features/billing/hooks/use-billing.ts`, `src/features/billing/components/plan-picker.tsx`, `src/features/billing/components/billing-notice.tsx`, `src/features/billing/components/seat-limit-modal.tsx`, `src/features/billing/pages/manager-plan-page.tsx`, `src/features/billing/pages/billing-return-page.tsx`, `src/routes/_app/manager/plan.tsx`, `src/routes/billing/return.tsx`
- Modify: `src/features/people/components/account-section.tsx` (two rows: "Plan & billing" → `/manager/plan`, "Help & support" → `/manager/help`), `src/features/dashboard/pages/*pass*` page file (render `<BillingNotice />` above the content), the helper-invite and manager-invite submit paths in `src/features/people/` (catch an error whose message starts with `SEAT_LIMIT:` and open `SeatLimitModal` instead of a toast — find them with `grep -rn "invite" src/features/people/*.actions.ts src/features/people/components/*.tsx`)
- Test: `src/features/billing/xendit-sessions.test.ts`, `src/features/billing/billing.actions.test.ts`, `src/features/billing/pages/manager-plan-page.test.tsx` (jsdom), `src/features/billing/components/billing-notice.test.tsx` (jsdom)

**Interfaces:**
- Consumes Task 3 RPCs and Task 10 `Plan`, `quoteAmount`, `fmtCentavos`, `listPublicPlansFn`.
- `Entitlements = { source: 'subscription'|'free'|'none'; subscriptionId: string|null; planName: string|null; status: string|null; effectiveStatus: string|null; helperSeats: number|null; managerSeats: number|null; periodEnd: string|null; daysLeft: number|null }`; `Subscription`, `PlatformInvoice` row types (camelCase).
- `getBillingFn({ data: { token, householdId } }) → { available: boolean; entitlements: Entitlements|null; subscriptions: Subscription[]; invoices: PlatformInvoice[]; usage: { helpers: number; managers: number }; homes: { id: string; name: string; primary: boolean }[] }` (usage from `seats_used`-equivalent selects on `helper_profiles`/`household_managers`; homes from `my_households`).
- `quoteFn({ data: { token, planId, helperSeats, managerSeats, homeIds } }) → { ok: true; quote } | { ok: false; code }`.
- `startCheckoutFn({ data: { token, planId, helperSeats, managerSeats, homeIds, email } }) → { available: false } | { ok: true; invoiceUrl: string|null; trialing: boolean } | { ok: false; code: string }`. Flow: `start_subscription` RPC → if `invoice_id` null (trial) return `trialing:true`; else if `!process.env.XENDIT_SECRET_WRITE_KEY` → `{ available: false }`; else `createPaymentSession(...)` then `attach_xendit_invoice`, return `invoiceUrl` (= `payment_link_url`).
- `renewFn({ data: { token, subscriptionId, email } })` same return as start; `cancelFn({ data: { token, subscriptionId } })`.
- `xendit-sessions.ts`: `createPaymentSession(input: { referenceId: string; amountCentavos: number; customer: { referenceId: string; email: string; givenNames: string }; description: string; successUrl: string; cancelUrl: string; expiresAt: string }, env: { secretKey: string; apiUrl: string }, fetchImpl = fetch): Promise<{ sessionId: string; paymentUrl: string; expiresAt: string }>` — `POST ${apiUrl}/sessions`, headers `Authorization: Basic base64(secretKey + ':')`, `Content-Type: application/json`, body `{ reference_id, currency: 'PHP', amount: amountCentavos / 100, country: 'PH', session_type: 'PAY', mode: 'PAYMENT_LINK', customer: { type: 'INDIVIDUAL', reference_id, email, individual_detail: { given_names } }, description, expires_at, success_return_url, cancel_return_url, notification_channels: ['EMAIL'], metadata: { linara: 'subscription' } }`; response `{ payment_session_id, payment_link_url, expires_at }`; non-2xx → throw with Xendit's `error_code`/`message`. `apiUrl` from `XENDIT_API_URL` (default `https://api.xendit.co`, the same host the payouts use). Return URLs: `${SITE_URL}/billing/return?paid=1` and `?paid=0` (`process.env.SITE_URL`, else `https://linara-delta.vercel.app`) — a PUBLIC page outside the `/manager` cookie gate, because the mobile app opens Xendit in the system browser (`../LINARA_MOBILE/app/manager.tsx` `onShouldStartLoad`) where no web session exists. `expiresAt` = now + 24 h ISO (Xendit's default is 30 min).
- `useBilling({ token, householdId, ready }) → { status: 'loading'|'ready'|'error'|'unavailable'; data; refresh }` (hand-rolled like `use-payslips.ts`).
- `/manager/plan` page sections: "Your plan" (plan name or "Free" / "No plan", status pill, seats vs usage as hairline rows "Helpers 2 of 3", period end + days left, Renew / Pay now (pending invoice link) / Cancel with confirm modal), "Choose a plan" (`PlanPicker`: public plans as rows, seat steppers starting at current usage, home ticks for primaries of several homes, live `quoteAmount` line, Pay button → `startCheckoutFn` → `window.location.assign(invoiceUrl)`), "Invoices" (number, period, amount, status pill, Pay link while pending). `/billing/return` (`validateSearch` `paid?: '1'|'0'`): one surface, `paid=1` → "Paid, thank you." + "Xendit tells Linara within a minute; your plan updates on its own." + link "Back to your plan" → `/manager/plan` and a line "In the Linara app? Close this tab and go back to the app."; `paid=0` → "Payment didn't go through. Try again when you're ready." + the same link. `/manager/plan` also accepts `?paid=1|0` (same copy as a toast) and refetches on `visibilitychange` → visible and on `focus`, plus every 5 s for 60 s after `paid=1`, until the latest invoice is `paid`. Unavailable: "Payments aren't switched on yet — message us from Help." → `/manager/help`.
- `BillingNotice()` (reads `useBilling` through the app store context or its own call): one slim surface, only when it has a consequence: `effectiveStatus === 'past_due'` ("Your plan's period ended on … You have 7 days to renew before seats go back to the free tier."); `effectiveStatus === 'expired'` only when `source === 'none'` or usage exceeds the free seats ("Your plan has lapsed. You can't add helpers or managers until you renew."); trial with `daysLeft <= 3` ("Your trial ends in N days."); link to `/manager/plan`; nothing otherwise. Pure helper `noticeFor(entitlements, usage): { text: string } | null` in `billing-notice.tsx`, unit-tested.
- `SeatLimitModal({ kind, onClose })`: "You've used every helper seat on your plan." / manager variant, link to `/manager/plan`.

- [ ] **Step 1: Failing tests**: `createPaymentSession` sends the exact body and Basic header (assert on a fake fetch), maps `payment_link_url` → `paymentUrl`, and throws on a 400 with Xendit's message; `startCheckoutFn` returns `{available:false}` without `XENDIT_SECRET_WRITE_KEY` after the RPC succeeded (mock supabase); manager plan page renders unavailable, loading, free-tier, active-with-seats ("Helpers 2 of 3"), pending-invoice "Pay now" link; `noticeFor` returns null for `active`, null for `expired` with free tier unlimited and usage within it, the past_due copy, the expired copy when `source 'none'`, the expired copy when usage 3 helpers > free 1, the trial copy at 3 days and null at 4; the return page renders the paid and failed copy.
- [ ] **Step 2–4** as above.

---

### Task 12: Costs and analytics (web)

**Files:**
- Create: `src/features/platform-admin/analytics.types.ts`, `src/features/platform-admin/analytics.actions.ts`, `src/features/platform-admin/analytics.utils.ts`, `src/features/platform-admin/components/analytics-chart.tsx`, `src/features/platform-admin/components/cost-entry-modal.tsx`, `src/features/platform-admin/pages/platform-admin-overview-page.tsx`, `src/features/platform-admin/pages/platform-admin-costs-page.tsx`, `src/routes/admin/index.tsx`, `src/routes/admin/costs.tsx`
- Test: `src/features/platform-admin/analytics.utils.test.ts`, `src/features/platform-admin/pages/platform-admin-overview-page.test.tsx` (jsdom), `src/features/platform-admin/pages/platform-admin-costs-page.test.tsx` (jsdom)

**Interfaces:**
- `Analytics` = camelCase of Task 5's JSON. `getAnalyticsFn({ data: { token, from, to } }) → { available, analytics }`; `listCostEntriesFn`, `saveCostEntryFn`, `deleteCostEntryFn`, `listModelPricesFn`, `saveModelPriceFn` (all `{ token, … }` → `{ available, … }`).
- `rangeFor(preset: 'this_month'|'last_3_months'|'this_year', today: Date): { from: string; to: string }` (ISO dates); `seriesForChart(analytics)` → `{ month: 'Oct', revenue: number (pesos), cogs, profit }[]`.
- Overview page: range control (segmented buttons + two date inputs for custom), figures as hairline rows with a one-line definition each (Revenue, COGS, of which AI, AI calls, Cost per AI call, Profit, Paying households, Users, Profit per user; `—` when null), the chart (`ChartContainer` + recharts `BarChart` revenue/cogs bars and `Line` profit, colours from the theme tokens, dataviz skill rules: label the axis in ₱, legend, tooltip in `fmtCentavos`), "AI by function" table. Costs page: cost entries list by month (edit/delete), "Add cost" modal (`Field`s: month `<input type=month>`, category select, label, amount in pesos, note), model prices surface (per model: input ₱/1M, output ₱/1M, audio ₱/min, note, Save).

- [ ] **Step 1: Failing tests**: `rangeFor('this_month', 2026-10-19)` = `2026-10-01`…`2026-10-31`; `last_3_months` = `2026-08-01`…`2026-10-31`; `seriesForChart` converts centavos to pesos and `2026-10` → `Oct`; overview renders unavailable/loading/data (shows `₱697.00` revenue and `—` for cost per call when null); costs page unavailable/empty "No costs recorded"/rows.
- [ ] **Step 2–4** as above.

---

### Task 16: Admin households page (web)

**Files:**
- Create: `src/features/platform-admin/households.actions.ts`, `src/features/platform-admin/components/grant-plan-modal.tsx`, `src/features/platform-admin/components/mark-paid-modal.tsx`, `src/features/platform-admin/pages/platform-admin-households-page.tsx`, `src/routes/admin/households.tsx`
- Test: `src/features/platform-admin/pages/platform-admin-households-page.test.tsx` (jsdom)

**Interfaces:**
- Consumes Task 3 `platform_households_overview`, `grant_subscription`, `mark_platform_invoice_paid_manually`; Task 10 `listAllPlansFn`, `fmtCentavos`.
- `listHouseholdsOverviewFn({ data: { token } }) → { available, households: HouseholdOverview[] }` (camelCase of the RPC JSON); `grantPlanFn({ data: { token, householdId, planId, helperSeats, managerSeats, periodEnd, note } })`; `markInvoicePaidFn({ data: { token, invoiceId, channel: 'bank_transfer'|'gcash'|'maya'|'cash'|'other', note } })`.
- Page: search box (name), one surface with hairline rows: household name, managers/helpers counts, plan + status pill + period end, pending invoice (number, amount) with "Mark paid" → `MarkPaidModal` (channel select, note, confirm), and "Grant plan" → `GrantPlanModal` (plan select from active + archived, seat inputs, period end date, note). States: unavailable, loading, empty "No households yet", error.

- [ ] **Step 1: Failing test**: renders unavailable/empty/rows; a row with a pending invoice shows "Mark paid"; the grant modal submits the mapped payload (mock the fn).
- [ ] **Step 2–4** as above.

---

### Task 13: Support chat (web)

**Files:**
- Create: `src/features/support/support.types.ts`, `src/features/support/support.actions.ts`, `src/features/support/hooks/use-support-threads.ts`, `src/features/support/components/thread-list.tsx`, `src/features/support/components/thread-view.tsx`, `src/features/support/components/new-thread-modal.tsx`, `src/features/support/pages/manager-help-page.tsx`, `src/features/support/pages/platform-admin-support-page.tsx`, `src/routes/_app/manager/help.tsx`, `src/routes/admin/support.tsx`
- Test: `src/features/support/hooks/use-support-threads.test.tsx` (jsdom), `src/features/support/components/thread-view.test.tsx` (jsdom), `src/features/support/pages/manager-help-page.test.tsx` (jsdom)

**Interfaces:**
- Consumes Task 6 RPCs; Task 9 `loadFaqsFn` + `FaqList`.
- `SupportThread = { id, householdId, householdName: string|null, subject, status: 'open'|'closed', createdAt, lastMessageAt, householdUnread, platformAdminUnread }`, `SupportMessage = { id, threadId, authorId, fromPlatformAdmin, body, createdAt }`.
- `listThreadsFn({ data: { token, scope: 'household'|'platform_admin', householdId? } }) → { available, threads }` (admin scope joins `households.name`); `listMessagesFn({ data: { token, threadId } })`; `openThreadFn({ data: { token, householdId, subject, body } }) → { available, threadId }`; `postMessageFn({ data: { token, threadId, body } })`; `markReadFn`; `setThreadStatusFn`.
- `useSupportThreads({ token, scope, householdId, ready })` → `{ status, threads, refresh }` and subscribes with `createAuthedClient(token).channel('support').on('postgres_changes', { event: '*', schema: 'public', table: 'support_threads' }, refresh).on(… 'support_messages' …).subscribe()`, unsubscribing on unmount (pattern: `app-store-provider.tsx` realtime channels).
- `ThreadView({ token, thread, me: 'household'|'platform_admin', onChanged })`: messages (own on the right, other side on the left, time), composer (textarea + Send, Enter sends, Shift+Enter newline), marks read on open; admin sees Close/Reopen.
- `/manager/help`: section "Answers" (`FaqList` of `loadFaqsFn`, `contactHref="#message-us"`), section "Message us" (`ThreadList` + "New message" → `NewThreadModal` with subject + body) and `ThreadView` for the selected thread; unavailable copy "Support chat isn't switched on yet; email <support_email or 'us'>". `/admin/support`: inbox (unread first, household name, subject, last message time, open/closed pill), `ThreadView` with `me='platform_admin'`.

- [ ] **Step 1: Failing tests**: hook returns `unavailable` on `available:false` and refreshes on a channel event (mock `createAuthedClient` with a fake channel); `ThreadView` sends on Enter and not on Shift+Enter, clears the composer, calls `onChanged`; manager help page renders FAQ fallback + "No messages yet" empty state and the unavailable copy.
- [ ] **Step 2–4** as above.

---

### Task 14: Edge functions: invoice webhook + AI usage logging

**Files:**
- Create: `supabase/functions/xendit-session-webhook/index.ts`, `supabase/functions/_shared/ai-usage.ts`, `supabase/functions/_shared/ai-usage.test.ts` (Deno test if the repo has any; otherwise a Vitest-compatible pure helper in `src/lib/ai-usage-shape.ts` — pick the first that fits existing tooling: `grep -rn "Deno.test" supabase/functions`)
- Modify: `supabase/config.toml` (add `[functions.xendit-session-webhook] verify_jwt = false` with a comment like the payout one), the six AI functions' OpenAI call sites (`generate-sop`, `simplify-sop`, `parse-scheduler`, `route-utos`, `promote-voice-task`, `transcribe-notes`): after a real provider response, `await recordAiUsage(req, fn, model, usage)` — three lines each, no other change; `supabase/DEPLOYMENTS.md` (new row + "Xendit dashboard → Settings → Developers → Webhooks: Payment Session completed/expired URL = `https://tueckhlrrupmnzhblewy.supabase.co/functions/v1/xendit-session-webhook`"; `verify_jwt` note)
- Test: `supabase/tests/invoice-webhook-shape.test.mjs` is not needed; the RPC is tested in Task 3. Add `src/features/billing/xendit-callback.test.ts` for the pure parser below.

**Interfaces:**
- `src/features/billing/xendit-callback.ts`: `parseSessionCallback(payload: unknown): { externalId: string; xenditId: string; status: 'PAID'|'EXPIRED'|'OTHER'; paidCentavos: number|null; paidAt: string|null; channel: string|null } | null` (Payment Session webhook: `event` `payment_session.completed` → PAID, `payment_session.expired` → EXPIRED, else OTHER; `data.reference_id`, `data.payment_session_id`, `data.amount` when present ×100 else null, `created` → paidAt, `data.payment_channel`/`data.channel_code` when present else null; null when `data.reference_id` or `data.payment_session_id` is missing); the edge function inlines the same logic (Deno can't import from `src/`): keep both in sync by making the edge function's copy a verbatim block with a `// mirrors src/features/billing/xendit-callback.ts` comment.
- Edge function: method guard → `x-callback-token` check against `XENDIT_WEBHOOK_VERIFICATION_TOKEN` (401) → parse (200 `{received:true}` on an unrecognisable body, like the payout webhook ignores other events) → service-role `rpc('record_platform_invoice_result', {...})` → 200 `{ received: true, applied }`; RPC error → 500 with the message in logs only.
- `recordAiUsage(req: Request, fn: string, model: string, usage: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number; audio_seconds?: number } | undefined): Promise<void>` — reads the user from the Bearer token (as `ai-guard.ts` does), inserts through service-role `rpc('record_ai_usage', {...})`; swallows and `console.warn`s errors (a failed log never fails the call); no-op when `usage` is undefined or in the mock branch.

- [ ] **Step 1: Failing test**: `parseSessionCallback` maps a sample `payment_session.completed` payload with `amount: 697` → 69700 and one without `amount` → null, a `payment_session.expired` one → EXPIRED, an unknown event → OTHER, and returns null for `{}`.
- [ ] **Step 2–4**: implement; `deno check supabase/functions/xendit-session-webhook/index.ts` if `deno` is installed (else say so), tsc/lint/prettier on the TS files.

---

### Task 15: Docs, e2e, runbook, changelog

**Files:**
- Modify: `e2e/helpers.ts` (`PUBLIC_ROUTES` += `/pricing`, `/faq`, `/billing/return`; `MANAGER_ROUTES` += `/manager/plan`, `/manager/help`; new `PLATFORM_ADMIN_ROUTES = ['/admin','/admin/plans','/admin/costs','/admin/support','/admin/faqs']`), `e2e/public.spec.ts` (each `PLATFORM_ADMIN_ROUTES` entry 307s to `/login` signed out and lands on `/login` in a browser), `KNOWN_GAPS.md` (one open item per SQL file: "Built 2026-10-19, not applied", template at the bottom of the file; plus one open item: Xendit classes `/v2/payouts` (used by `pay.actions.ts`) and `/v2/invoices` as legacy and bills a monthly fee for legacy API use from 2026-10-01 — payouts are off (O35) so nothing is billed today, but a Payouts v3 move is owed before they are switched on; src https://docs.xendit.co/docs/migrating-to-xendit-s-latest-payments-stack.md), `README.md` §12.2/12.3/12.5 (Xendit invoice callback URL, `platform_admins` bootstrap, the seven SQL files in order), `CHANGELOG.md` (dated entry; create the file if absent), `.env.example` (`PLATFORM_BILLING=on` switches plan checkout on, server-side, together with `XENDIT_SECRET_WRITE_KEY`; document both), `src/features/legal/terms-of-service.tsx` (a short "Plans and payments" section: plans are bought per period through Xendit's hosted page, Linara never stores card or wallet details, nothing renews automatically, a lapsed plan keeps your data and limits new seats only, refunds by conversation at the support contact) and `src/features/legal/privacy-policy.tsx` (one line: when you buy a plan, your name and email go to Xendit to issue the payment page), bump `LEGAL_LAST_UPDATED` to "October 19, 2026" — mark both in KNOWN_GAPS as "owner to review legal copy"
- Create: `docs/OPERATOR-GO-LIVE.md` — ordered owner checklist: (1) apply the seven SQL files in the SQL editor in order; (2) `INSERT INTO platform_admins …` for the owner's email; (3) `npm run deploy:functions` + the DEPLOYMENTS.md row; (4) Xendit dashboard (Settings → Developers → Webhooks): Payment Session completed + expired URL = the `xendit-session-webhook` function URL, and confirm the verification token matches `XENDIT_WEBHOOK_VERIFICATION_TOKEN` (tokens and URLs are per test/live mode); (5) Vercel `linara-nicoledev` and `linara`: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (LW-9), then `PLATFORM_BILLING=on`, `XENDIT_SECRET_WRITE_KEY`, `XENDIT_API_URL` only when selling is meant to be live on that deployment; (6) live checks: sign in as admin → `/admin/plans` → create + publish a ₱1 test plan → `/pricing` shows it → `/manager/plan` → Pay → Xendit test-mode page (simulate the payment there) → back on `?paid=1` → "Paid, thank you" → `/admin` shows ₱1 revenue; open a support thread from `/manager/help`, answer from `/admin/support`; publish an FAQ and see it on `/faq`.

- [ ] **Step 1**: `npx playwright test e2e/public.spec.ts --project=desktop --project=phone` locally (starts the dev server itself) → the new routes pass.
- [ ] **Step 2**: write the docs; `npx prettier --check .`.
