// Runs add-subscriptions.sql against a real Postgres (PGlite) as the API's
// roles: a primary manager quotes and starts a subscription, the Xendit
// webhook (service_role) pays it once however often it calls and ignores what
// it shouldn't act on, a renewal extends the period from the previous end, an
// underpaid invoice marks it past due, paying a new plan replaces an old one
// whose homes it all covers (and expires its pending invoices), a payment that
// can't apply (after a manual mark, a second session, a replaced plan) is noted
// for a refund, a co-manager, an ex-primary and a second household can't act on
// what isn't theirs, the browser never reads notes or raw callbacks, platform
// admins mark an invoice paid by hand, comp and revoke a household and list
// every household, trials can't be farmed, a renewed comp gets concrete seats,
// a deleted owner leaves the revenue record, and household_entitlements falls
// back to the free tier. Sell-Linara plan, Task 3.
//
//   npm run test:sql
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const db = new PGlite();
let failures = 0;

const as = async (uid) => db.query("SELECT set_config('test.uid', $1, false)", [uid ?? ""]);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
};
const expectError = async (label, fn, pattern) => {
  try {
    await fn();
    check(label, false, "no error");
  } catch (e) {
    check(label, pattern.test(e.message), e.message);
  }
};
/** As the database owner (the SQL editor), for setup and checks. */
const asOwner = async (fn) => {
  await db.exec("RESET ROLE");
  try {
    return await fn();
  } finally {
    await db.exec("SET ROLE authenticated");
  }
};
/** As the Xendit webhook's edge function, which calls with the service role. */
const asService = async (fn) => {
  await db.exec("RESET ROLE");
  await db.exec("SET ROLE service_role");
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
    await db.exec("SET ROLE authenticated");
  }
};

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
// What the live schema has that base-schema.sql doesn't, as in
// household-managers.test.mjs, plus Supabase's service_role.
await db.exec(`
  CREATE ROLE service_role;
  ALTER TABLE user_profiles ALTER COLUMN household_id DROP NOT NULL;
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false,
                         ADD COLUMN petty_cash_budget NUMERIC(10,2) NOT NULL DEFAULT 1500;
  ALTER TABLE tickets ADD COLUMN suggested BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN emergency BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE quick_utos ADD COLUMN emergency BOOLEAN NOT NULL DEFAULT false,
                         ADD COLUMN ack_state TEXT NOT NULL DEFAULT 'sent';
  ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE quick_utos ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payout_attempts ENABLE ROW LEVEL SECURITY;
  CREATE POLICY appointments_isolation ON appointments FOR ALL USING (household_id = public.current_household_id());
  CREATE POLICY quick_utos_isolation ON quick_utos FOR ALL USING (
    EXISTS (SELECT 1 FROM helper_profiles hp WHERE hp.id = quick_utos.recipient_id AND hp.household_id = public.current_household_id()));
  CREATE POLICY payout_attempts_isolation ON payout_attempts FOR ALL USING (
    EXISTS (SELECT 1 FROM payslips p JOIN helper_profiles hp ON hp.id = p.helper_id
            WHERE p.id = payout_attempts.payslip_id AND hp.household_id = public.current_household_id()));
  CREATE POLICY user_profiles_self_read ON user_profiles FOR SELECT USING (id = auth.uid());
  CREATE FUNCTION public.ticket_ledger_source(p_helper_id UUID, p_at TIMESTAMPTZ, p_after_hours BOOLEAN, p_emergency BOOLEAN)
  RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT CASE WHEN name LIKE '%on shift%' THEN NULL ELSE 'overtime' END FROM public.helper_profiles WHERE id = p_helper_id $$;
  REVOKE ALL ON FUNCTION public.ticket_ledger_source(UUID, TIMESTAMPTZ, BOOLEAN, BOOLEAN) FROM PUBLIC;
`);
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-account-deletion.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-household-managers.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-platform-admins.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-plans.sql`, "utf8"));
// The first version of add-subscriptions.sql (2972e83): owner_user_id NOT NULL
// with a plain foreign key, platform_invoices without quote, and function
// signatures since changed (one of them from the second version, d4cb816). The
// file is applied over it, as it would be over a database that ran it.
await db.exec(`
  CREATE TABLE public.subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id UUID NOT NULL REFERENCES public.plans(id),
      owner_user_id UUID NOT NULL REFERENCES auth.users(id),
      status TEXT NOT NULL
          CHECK (status IN ('pending', 'trialing', 'active', 'past_due', 'expired', 'canceled')),
      helper_seats INT NULL CHECK (helper_seats >= 0),
      manager_seats INT NULL CHECK (manager_seats >= 0),
      home_seats INT NOT NULL DEFAULT 1 CHECK (home_seats >= 1),
      amount_centavos BIGINT NOT NULL CHECK (amount_centavos >= 0),
      current_period_start TIMESTAMPTZ NULL,
      current_period_end TIMESTAMPTZ NULL,
      canceled_at TIMESTAMPTZ NULL,
      note TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE public.platform_invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number TEXT NOT NULL UNIQUE,
      subscription_id UUID NOT NULL REFERENCES public.subscriptions(id),
      external_id TEXT NOT NULL UNIQUE,
      xendit_session_id TEXT NULL,
      payment_url TEXT NULL,
      expires_at TIMESTAMPTZ NULL,
      status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'paid', 'expired', 'failed')),
      amount_centavos BIGINT NOT NULL CHECK (amount_centavos >= 0),
      currency TEXT NOT NULL DEFAULT 'PHP',
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NULL,
      paid_at TIMESTAMPTZ NULL,
      paid_centavos BIGINT NULL,
      paid_channel TEXT NULL,
      payer_email TEXT NULL,
      raw_callback JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE FUNCTION public.billing_new_invoice(UUID, TIMESTAMPTZ, BIGINT)
  RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
  CREATE FUNCTION public.attach_xendit_invoice(UUID, TEXT, TEXT, TIMESTAMPTZ)
  RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
  CREATE FUNCTION public.billing_new_invoice(UUID, TIMESTAMPTZ)
  RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
`);
await db.exec(readFileSync(`${REPO}/add-subscriptions.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-subscriptions.sql`, "utf8"));
console.log("migration applied twice, over its first version");

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const P = "00000000-0000-0000-0000-00000000000a"; // primary of H1, H4 and H6
const C = "00000000-0000-0000-0000-00000000000c"; // co-manager of H1
const M2 = "00000000-0000-0000-0000-0000000000b2"; // primary of H2
const Q = "00000000-0000-0000-0000-0000000000b3"; // primary of H3, later hands over
const R = "00000000-0000-0000-0000-0000000000b4"; // co-manager of H3, later its primary
const T = "00000000-0000-0000-0000-0000000000b5"; // primary of H5 and H10
const S = "00000000-0000-0000-0000-0000000000b6"; // primary of H8 and H9
const V = "00000000-0000-0000-0000-0000000000b7"; // co-manager of H9, later its primary
const H1 = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const H3 = "10000000-0000-0000-0000-000000000003";
const H4 = "10000000-0000-0000-0000-000000000004";
const H5 = "10000000-0000-0000-0000-000000000005";
const H6 = "10000000-0000-0000-0000-000000000006";
const H7 = "10000000-0000-0000-0000-000000000007"; // nobody manages it
const H8 = "10000000-0000-0000-0000-000000000008";
const H9 = "10000000-0000-0000-0000-000000000009";
const H10 = "10000000-0000-0000-0000-000000000010";

await db.exec(`
  INSERT INTO auth.users VALUES ('${ADMIN}'), ('${P}'), ('${C}'), ('${M2}'), ('${Q}'), ('${R}'), ('${T}'), ('${S}'), ('${V}');
  INSERT INTO households (id, name) VALUES
    ('${H1}', 'Reyes Household'), ('${H2}', 'Cruz Household'), ('${H3}', 'Lim Household'),
    ('${H4}', 'Reyes Beach House'), ('${H5}', 'Tan Household'), ('${H6}', 'Reyes Farm'),
    ('${H7}', 'Empty House'), ('${H8}', 'Santos Household'), ('${H9}', 'Santos Annex'),
    ('${H10}', 'Tan Beach House');
  INSERT INTO user_profiles (id, household_id, full_name, user_type) VALUES
    ('${P}', '${H1}', 'Ben Reyes', 'primary_manager'),
    ('${C}', '${H1}', 'Carla Reyes', 'co_manager'),
    ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager'),
    ('${Q}', '${H3}', 'Quin Lim', 'primary_manager'),
    ('${R}', '${H3}', 'Rico Lim', 'co_manager'),
    ('${T}', '${H5}', 'Tess Tan', 'primary_manager'),
    ('${S}', '${H8}', 'Sol Santos', 'primary_manager'),
    ('${V}', '${H9}', 'Vic Santos', 'co_manager');
  INSERT INTO household_managers (household_id, user_id, role) VALUES
    ('${H1}', '${P}', 'primary_manager'), ('${H1}', '${C}', 'co_manager'),
    ('${H4}', '${P}', 'primary_manager'), ('${H6}', '${P}', 'primary_manager'),
    ('${H2}', '${M2}', 'primary_manager'),
    ('${H3}', '${Q}', 'primary_manager'), ('${H3}', '${R}', 'co_manager'),
    ('${H5}', '${T}', 'primary_manager'), ('${H10}', '${T}', 'primary_manager'),
    ('${H8}', '${S}', 'primary_manager'), ('${H9}', '${S}', 'primary_manager'),
    ('${H9}', '${V}', 'co_manager');
  INSERT INTO helper_profiles (household_id, name, station, monthly_rate, payday_interval, status) VALUES
    ('${H1}', 'Rosa', 'Cook', 7000, 'monthly', 'ACTIVE'),
    ('${H1}', 'Marites', 'Yaya', 8000, 'monthly', 'ACTIVE'),
    ('${H1}', 'Lorna', 'Laundry', 6000, 'monthly', 'INACTIVE'),
    ('${H2}', 'Nena', 'Cook', 7000, 'monthly', 'ACTIVE');
  INSERT INTO platform_admins (user_id, note) VALUES ('${ADMIN}', 'owner');
`);
const YEAR = (await one(`SELECT EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Manila')::int AS y`)).y;
await db.exec(`SET ROLE authenticated`);

const XENDIT = (session) => `https://checkout-staging.xendit.co/web/${session}`;
const rpc = async (sql, params) => (await one(`SELECT ${sql} AS r`, params)).r;
const quote = (plan, helpers, managers, homes) =>
  rpc(`public.quote_subscription($1, $2, $3, $4::uuid[])`, [plan, helpers, managers, homes]);
const start = (plan, helpers, managers, homes) =>
  rpc(`public.start_subscription($1, $2, $3, $4::uuid[])`, [plan, helpers, managers, homes]);
const renew = (id) => rpc(`public.renew_subscription($1)`, [id]);
const cancel = (id) => rpc(`public.cancel_subscription($1)`, [id]);
const entitlements = (household) => rpc(`public.household_entitlements($1)`, [household]);
const trialEligible = (plan, homes) => rpc(`public.trial_eligible($1, $2::uuid[])`, [plan, homes]);
const attach = (invoiceId, session, url, email = null) =>
  q(`SELECT public.attach_xendit_invoice($1, $2, $3, now() + interval '1 day', $4)`, [
    invoiceId,
    session,
    url,
    email,
  ]);
const pay = (externalId, status, paidCentavos, session = "ps_webhook") =>
  asService(() =>
    rpc(
      `public.record_platform_invoice_result($1, $4, $2, $3, now(), 'GCASH', '{"event":"payment_session.completed"}'::jsonb)`,
      [externalId, status, paidCentavos, session],
    ),
  );
const subRow = (id) => asOwner(() => one(`SELECT * FROM public.subscriptions WHERE id = $1`, [id]));
const invoiceRow = (id) =>
  asOwner(() => one(`SELECT * FROM public.platform_invoices WHERE id = $1`, [id]));
const snapshot = (subId, invoiceId) =>
  asOwner(async () =>
    JSON.stringify([
      await one(`SELECT to_jsonb(s) AS j FROM public.subscriptions s WHERE id = $1`, [subId]),
      await one(`SELECT to_jsonb(i) AS j FROM public.platform_invoices i WHERE id = $1`, [
        invoiceId,
      ]),
    ]),
  );
const nearNow = async (ts) =>
  (
    await asOwner(() =>
      one(`SELECT abs(extract(epoch FROM ($1::timestamptz - now()))) < 120 AS ok`, [ts]),
    )
  ).ok;
const countAs = async (uid, table) => {
  await as(uid);
  return (await one(`SELECT count(*)::int AS n FROM public.${table}`)).n;
};
const setEnd = (id, sql) =>
  asOwner(() =>
    q(`UPDATE public.subscriptions SET current_period_end = ${sql} WHERE id = $1`, [id]),
  );

// --- Plans the admin prices -------------------------------------------------
await as(ADMIN);
const newPlan = async (name, interval, base, h, xh, m, xm, homes, xhome, trial, status) =>
  (
    await one(
      `INSERT INTO public.plans (name, interval, base_centavos, included_helpers, extra_helper_centavos,
                                 included_managers, extra_manager_centavos, included_homes, extra_home_centavos,
                                 trial_days, status, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true) RETURNING id`,
      [name, interval, base, h, xh, m, xm, homes, xhome, trial, status],
    )
  ).id;
const MONTHLY = await newPlan(
  "Household",
  "monthly",
  49900,
  1,
  9900,
  2,
  null,
  null,
  null,
  0,
  "active",
);
const LIFETIME = await newPlan(
  "Lifetime",
  "one_time",
  99900,
  1,
  9900,
  2,
  null,
  1,
  null,
  0,
  "active",
);
const STARTER = await newPlan(
  "Starter",
  "monthly",
  29900,
  2,
  null,
  2,
  null,
  1,
  10000,
  14,
  "active",
);
const BIG = await newPlan(
  "Big house",
  "yearly",
  199900,
  null,
  null,
  null,
  null,
  null,
  null,
  0,
  "active",
);
const DRAFT = await newPlan("Draft", "monthly", 100, 1, null, 1, null, null, null, 0, "draft");

// --- Quotes -----------------------------------------------------------------
await as(P);
const q1 = await quote(MONTHLY, 3, 2, [H1]);
check(
  "quote: 3 helpers, 2 managers, one home = 49900 + 2 x 9900",
  q1.amount_centavos === 69700 &&
    q1.base_centavos === 49900 &&
    q1.helper_extra_centavos === 19800 &&
    q1.manager_extra_centavos === 0 &&
    q1.home_extra_centavos === 0 &&
    q1.helper_seats === 3 &&
    q1.manager_seats === 2 &&
    q1.home_seats === 1 &&
    q1.interval === "monthly",
  q1,
);
await expectError(
  "quote: a third manager on a plan that sells none raises SEATS_OVER_PLAN:manager",
  () => quote(MONTHLY, 3, 3, [H1]),
  /^SEATS_OVER_PLAN:manager/,
);
await expectError(
  "quote: a helper over a hard cap raises SEATS_OVER_PLAN:helper",
  () => quote(STARTER, 3, 2, [H1]),
  /^SEATS_OVER_PLAN:helper/,
);
await expectError(
  "quote: a second home over a hard cap raises SEATS_OVER_PLAN:home",
  () => quote(LIFETIME, 1, 2, [H1, H4]),
  /^SEATS_OVER_PLAN:home/,
);
const qHomes = await quote(STARTER, 2, 2, [H1, H4, H4]);
check(
  "quote: an extra home is priced, a repeated home counts once",
  qHomes.home_seats === 2 &&
    qHomes.home_extra_centavos === 10000 &&
    qHomes.amount_centavos === 39900,
  qHomes,
);
const qLow = await quote(MONTHLY, 0, null, [H1]);
check(
  "quote: never fewer seats than the plan includes",
  qLow.helper_seats === 1 && qLow.manager_seats === 2 && qLow.amount_centavos === 49900,
  qLow,
);
const qBig = await quote(BIG, 9, 9, [H1]);
check(
  "quote: a plan with unlimited seats gives NULL seats and no extras",
  qBig.helper_seats === null &&
    qBig.manager_seats === null &&
    qBig.amount_centavos === 199900 &&
    qBig.interval === "yearly",
  qBig,
);
await expectError(
  "quote: a draft plan raises PLAN_NOT_ACTIVE",
  () => quote(DRAFT, 1, 1, [H1]),
  /^PLAN_NOT_ACTIVE/,
);
await expectError("quote: no homes raises NOT_FOUND", () => quote(MONTHLY, 1, 1, []), /^NOT_FOUND/);

// --- Starting -----------------------------------------------------------------
await as(C);
await expectError(
  "start: a co-manager raises NOT_PRIMARY",
  () => start(MONTHLY, 3, 2, [H1]),
  /^NOT_PRIMARY/,
);
await as(M2);
await expectError(
  "start: another household's manager raises NOT_PRIMARY",
  () => start(MONTHLY, 3, 2, [H1]),
  /^NOT_PRIMARY/,
);
await as(P);
await expectError(
  "start: one home the caller isn't primary of raises NOT_PRIMARY",
  () => start(MONTHLY, 3, 2, [H1, H2]),
  /^NOT_PRIMARY/,
);
const s1 = await start(MONTHLY, 3, 2, [H1]);
check(
  "start: pending subscription, invoice LIN-<year>-000001, external_id sub_<id>_1",
  s1.status === "pending" &&
    s1.invoice_number === `LIN-${YEAR}-000001` &&
    s1.external_id === `sub_${s1.subscription_id}_1` &&
    s1.amount_centavos === 69700 &&
    typeof s1.invoice_id === "string",
  s1,
);
const s1Row = await subRow(s1.subscription_id);
check(
  "start: the subscription keeps the quote's seats and amount, no period yet",
  s1Row.owner_user_id === P &&
    s1Row.plan_id === MONTHLY &&
    s1Row.helper_seats === 3 &&
    s1Row.manager_seats === 2 &&
    s1Row.home_seats === 1 &&
    Number(s1Row.amount_centavos) === 69700 &&
    s1Row.current_period_start === null &&
    s1Row.current_period_end === null,
  s1Row,
);
const s1Invoice = await asOwner(() =>
  one(
    `SELECT status, currency, amount_centavos::int AS amount,
            period_end = period_start + interval '1 month' AS month_long,
            abs(extract(epoch FROM (period_start - now()))) < 120 AS starts_now
       FROM public.platform_invoices WHERE id = $1`,
    [s1.invoice_id],
  ),
);
check(
  "start: one pending PHP invoice for this month",
  s1Invoice.status === "pending" &&
    s1Invoice.currency === "PHP" &&
    s1Invoice.amount === 69700 &&
    s1Invoice.month_long &&
    s1Invoice.starts_now,
  s1Invoice,
);
const s1Homes = await asOwner(() =>
  q(`SELECT household_id FROM public.subscription_homes WHERE subscription_id = $1`, [
    s1.subscription_id,
  ]),
);
check("start: the home is recorded", s1Homes.length === 1 && s1Homes[0].household_id === H1);
const s1Quote = (await invoiceRow(s1.invoice_id)).quote;
check(
  "start: the invoice keeps the quote it was priced from",
  s1Quote.helper_seats === 3 &&
    s1Quote.manager_seats === 2 &&
    s1Quote.home_seats === 1 &&
    s1Quote.amount_centavos === 69700,
  s1Quote,
);

await as(Q);
const s3 = await start(MONTHLY, 3, 2, [H3]);
check(
  "start: the next invoice number is 000002",
  s3.invoice_number === `LIN-${YEAR}-000002`,
  s3.invoice_number,
);

// --- Who can read what ----------------------------------------------------------
check(
  "another household's manager sees 0 subscriptions",
  (await countAs(M2, "subscriptions")) === 0,
);
check(
  "another household's manager sees 0 invoices",
  (await countAs(M2, "platform_invoices")) === 0,
);
check("another household's manager sees 0 homes", (await countAs(M2, "subscription_homes")) === 0);
check("the owner sees 1 subscription", (await countAs(P, "subscriptions")) === 1);
check("the owner sees 1 invoice", (await countAs(P, "platform_invoices")) === 1);
check("the owner sees 1 home row", (await countAs(P, "subscription_homes")) === 1);
check("a co-manager of a covered home sees it", (await countAs(C, "subscriptions")) === 1);
check(
  "a co-manager of a covered home sees its invoice",
  (await countAs(C, "platform_invoices")) === 1,
);
check("a platform admin sees every subscription", (await countAs(ADMIN, "subscriptions")) === 2);

// The browser reads only the columns the web shows, admins included.
const SUB_COLUMNS = `id, plan_id, owner_user_id, status, helper_seats, manager_seats, home_seats,
  amount_centavos, current_period_start, current_period_end, canceled_at, created_at, updated_at`;
const INVOICE_COLUMNS = `id, invoice_number, subscription_id, external_id, payment_url, expires_at,
  status, amount_centavos, currency, period_start, period_end, paid_at, created_at`;
await as(P);
for (const column of [
  "raw_callback",
  "payer_email",
  "xendit_session_id",
  "paid_centavos",
  "paid_channel",
  "quote",
]) {
  await expectError(
    `a manager can't read an invoice's ${column}`,
    () => q(`SELECT ${column} FROM public.platform_invoices`),
    /permission denied/,
  );
}
await expectError(
  "a manager can't read a subscription's note",
  () => q(`SELECT note FROM public.subscriptions`),
  /permission denied/,
);
check(
  "a manager reads the invoice columns the web shows",
  (await q(`SELECT ${INVOICE_COLUMNS} FROM public.platform_invoices`)).length === 1,
);
check(
  "a manager reads every other subscription column",
  (await q(`SELECT ${SUB_COLUMNS} FROM public.subscriptions`)).length === 1,
);
await as(ADMIN);
await expectError(
  "the column grants hold for a platform admin too (admins use platform_invoice_detail)",
  () => q(`SELECT raw_callback FROM public.platform_invoices`),
  /permission denied/,
);

await as(P);
await expectError(
  "nobody inserts a subscription directly",
  () =>
    q(
      `INSERT INTO public.subscriptions (plan_id, owner_user_id, status, amount_centavos) VALUES ($1, $2, 'active', 0)`,
      [MONTHLY, P],
    ),
  /permission denied/,
);
await expectError(
  "nobody updates an invoice directly",
  () => q(`UPDATE public.platform_invoices SET status = 'paid' WHERE id = $1`, [s1.invoice_id]),
  /permission denied/,
);
await expectError(
  "nobody deletes a home row directly",
  () => q(`DELETE FROM public.subscription_homes WHERE subscription_id = $1`, [s1.subscription_id]),
  /permission denied/,
);
await expectError(
  "nobody reads the invoice counter",
  () => q(`SELECT * FROM public.platform_invoice_counters`),
  /permission denied/,
);
await expectError(
  "nobody takes an invoice number directly",
  () => q(`SELECT public.next_platform_invoice_number()`),
  /permission denied/,
);
await as(M2);
await expectError(
  "household_entitlements: another household's manager raises NOT_FOUND",
  () => entitlements(H1),
  /^NOT_FOUND/,
);

// --- Function privileges ----------------------------------------------------------
const FNS = {
  "public.quote_subscription(uuid, int, int, uuid[])": true,
  "public.trial_eligible(uuid, uuid[])": true,
  "public.start_subscription(uuid, int, int, uuid[])": true,
  "public.attach_xendit_invoice(uuid, text, text, timestamptz, text)": true,
  "public.renew_subscription(uuid)": true,
  "public.cancel_subscription(uuid)": true,
  "public.mark_platform_invoice_paid_manually(uuid, text, text)": true,
  "public.grant_subscription(uuid, uuid, int, int, timestamptz, text)": true,
  "public.platform_households_overview()": true,
  "public.platform_invoice_detail(uuid)": true,
  "public.household_entitlements(uuid)": true,
  "public.record_platform_invoice_result(text, text, text, bigint, timestamptz, text, jsonb)": false,
  "public.next_platform_invoice_number()": false,
  "public.billing_can_manage_subscription(uuid)": false,
  "public.billing_price(public.plans, int, int, int)": false,
  "public.billing_new_invoice(uuid, timestamptz, jsonb)": false,
  "public.billing_settle_invoice(uuid, text, bigint, timestamptz, text, jsonb, text)": false,
  "public.billing_entitlements(uuid)": false,
};
const privileges = await asOwner(() =>
  Promise.all(
    Object.keys(FNS).map((fn) =>
      one(
        `SELECT $1 AS fn, has_function_privilege('anon', $1, 'EXECUTE') AS anon,
                has_function_privilege('authenticated', $1, 'EXECUTE') AS authenticated,
                has_function_privilege('service_role', $1, 'EXECUTE') AS service`,
        [fn],
      ),
    ),
  ),
);
check(
  "anon executes none of the functions",
  privileges.every((p) => !p.anon),
  privileges.filter((p) => p.anon).map((p) => p.fn),
);
check(
  "authenticated executes exactly the user and admin functions",
  privileges.every((p) => p.authenticated === FNS[p.fn]),
  privileges.filter((p) => p.authenticated !== FNS[p.fn]).map((p) => p.fn),
);
check(
  "service_role executes record_platform_invoice_result",
  privileges.find((p) => p.fn.startsWith("public.record_platform_invoice_result")).service === true,
);
const oldSignatures = await asOwner(() =>
  one(
    `SELECT to_regprocedure('public.attach_xendit_invoice(uuid, text, text, timestamptz)') IS NULL
        AND to_regprocedure('public.billing_new_invoice(uuid, timestamptz)') IS NULL
        AND to_regprocedure('public.billing_new_invoice(uuid, timestamptz, bigint)') IS NULL AS gone`,
  ),
);
check("the earlier function signatures are dropped", oldSignatures.gone === true);
await as(P);
await expectError(
  "authenticated can't execute record_platform_invoice_result",
  () =>
    q(
      `SELECT public.record_platform_invoice_result($1, 'x', 'PAID', 69700, now(), 'GCASH', '{}'::jsonb)`,
      [s1.external_id],
    ),
  /permission denied/,
);

// --- Attaching the Xendit session ---------------------------------------------------
await as(C);
await expectError(
  "attach: a co-manager raises NOT_FOUND",
  () => attach(s1.invoice_id, "ps_1", XENDIT("ps_1")),
  /^NOT_FOUND/,
);
await as(P);
for (const url of [
  "https://pay.example/ps_1",
  "http://xen.to/abc",
  "https://xendit.co.evil.com/abc",
  "https://evil.com/?u=checkout.xendit.co/",
  null,
]) {
  await expectError(
    `attach: ${url} raises BAD_URL`,
    () => attach(s1.invoice_id, "ps_1", url),
    /^BAD_URL/,
  );
}
await attach(s1.invoice_id, "ps_0", "HTTPS://XEN.TO/abc");
check(
  "attach: a xen.to link is accepted, in any case",
  (await invoiceRow(s1.invoice_id)).payment_url === "HTTPS://XEN.TO/abc",
);
for (const session of ["   ", null]) {
  await expectError(
    `attach: session id ${JSON.stringify(session)} raises BAD_SESSION`,
    () => attach(s1.invoice_id, session, XENDIT("ps_1")),
    /^BAD_SESSION/,
  );
}
await attach(s1.invoice_id, "  ps_1  ", XENDIT("ps_1"), "ben@example.com");
const attached = await invoiceRow(s1.invoice_id);
check(
  "attach: the primary stores the session id (trimmed), xendit.co URL, expiry and payer email",
  attached.xendit_session_id === "ps_1" &&
    attached.payment_url === XENDIT("ps_1") &&
    attached.expires_at instanceof Date &&
    attached.payer_email === "ben@example.com",
  attached,
);

// --- The webhook ----------------------------------------------------------------
const unknown = await pay("sub_nope_1", "PAID", 69700);
check(
  "webhook: an unknown external_id is not applied",
  unknown.applied === false && unknown.invoice_status === null,
  unknown,
);
const paid1 = await pay(s1.external_id, "PAID", 69700);
check(
  "webhook: PAID for the full amount is applied and activates",
  paid1.applied === true &&
    paid1.invoice_status === "paid" &&
    paid1.subscription_status === "active",
  paid1,
);
const active1 = await asOwner(() =>
  one(
    `SELECT status, current_period_end = current_period_start + interval '1 month' AS month_long,
            abs(extract(epoch FROM (current_period_start - now()))) < 120 AS starts_now,
            current_period_end AS period_end
       FROM public.subscriptions WHERE id = $1`,
    [s1.subscription_id],
  ),
);
check(
  "webhook: the period runs from now to now + 1 month",
  active1.status === "active" && active1.month_long && active1.starts_now,
  active1,
);
const paidInvoice = await invoiceRow(s1.invoice_id);
check(
  "webhook: the invoice records amount, channel, time, the paying session and the callback",
  paidInvoice.status === "paid" &&
    Number(paidInvoice.paid_centavos) === 69700 &&
    paidInvoice.paid_channel === "GCASH" &&
    paidInvoice.paid_at instanceof Date &&
    paidInvoice.xendit_session_id === "ps_webhook" &&
    paidInvoice.raw_callback.event === "payment_session.completed",
  paidInvoice,
);
const beforeRepeat = await snapshot(s1.subscription_id, s1.invoice_id);
const repeat = await pay(s1.external_id, "PAID", 69700);
check(
  "webhook: the same PAID again is not applied",
  repeat.applied === false &&
    repeat.invoice_status === "paid" &&
    repeat.subscription_status === "active",
  repeat,
);
check(
  "webhook: and changes nothing",
  (await snapshot(s1.subscription_id, s1.invoice_id)) === beforeRepeat,
);
const expireAfterPaid = await pay(s1.external_id, "EXPIRED", null);
check(
  "webhook: EXPIRED after PAID is not applied",
  expireAfterPaid.applied === false && expireAfterPaid.invoice_status === "paid",
  expireAfterPaid,
);

// The admin's full view of an invoice (raw_callback and note included).
await as(ADMIN);
const detail = await rpc(`public.platform_invoice_detail($1)`, [s1.invoice_id]);
check(
  "invoice detail: a platform admin reads the raw callback and the subscription",
  detail.invoice.raw_callback.event === "payment_session.completed" &&
    detail.subscription.id === s1.subscription_id &&
    "note" in detail.subscription,
  detail.invoice.raw_callback,
);
await expectError(
  "invoice detail: an unknown invoice raises NOT_FOUND",
  () => q(`SELECT public.platform_invoice_detail(gen_random_uuid())`),
  /^NOT_FOUND/,
);
await as(P);
await expectError(
  "invoice detail: a manager raises NOT_ADMIN",
  () => q(`SELECT public.platform_invoice_detail($1)`, [s1.invoice_id]),
  /^NOT_ADMIN/,
);

// --- Renewing ----------------------------------------------------------------
await as(C);
await expectError(
  "renew: a co-manager raises NOT_FOUND",
  () => renew(s1.subscription_id),
  /^NOT_FOUND/,
);
await as(P);
const r1 = await renew(s1.subscription_id);
check(
  "renew: a new pending invoice, not reused",
  r1.reused === false &&
    r1.invoice_id !== s1.invoice_id &&
    r1.external_id === `sub_${s1.subscription_id}_2` &&
    r1.invoice_number === `LIN-${YEAR}-000003` &&
    r1.amount_centavos === 69700,
  r1,
);
const r1Period = await asOwner(() =>
  one(
    `SELECT i.period_start = s.current_period_end AS from_end,
            i.period_end = s.current_period_end + interval '1 month' AS month_long
       FROM public.platform_invoices i JOIN public.subscriptions s ON s.id = i.subscription_id
      WHERE i.id = $1`,
    [r1.invoice_id],
  ),
);
check(
  "renew: the invoice covers the month after the current period",
  r1Period.from_end && r1Period.month_long,
  r1Period,
);
const r2 = await renew(s1.subscription_id);
check(
  "renew: again returns the same pending invoice, reused",
  r2.reused === true && r2.invoice_id === r1.invoice_id,
  r2,
);
const paid2 = await pay(r1.external_id, "PAID", 69700);
const extended = await asOwner(() =>
  one(
    `SELECT current_period_start = $2::timestamptz AS from_old_end,
            current_period_end = $2::timestamptz + interval '1 month' AS month_long
       FROM public.subscriptions WHERE id = $1`,
    [s1.subscription_id, active1.period_end],
  ),
);
check(
  "webhook: paying the renewal moves the period end +1 month from the previous end",
  paid2.applied === true && extended.from_old_end && extended.month_long,
  { paid2, extended },
);

// --- What the webhook acts on ------------------------------------------------------
await as(P);
const r3 = await renew(s1.subscription_id);
await attach(r3.invoice_id, "xs_r3", XENDIT("xs_r3"));
const ignored = await pay(r3.external_id, "OTHER", null, "xs_r3");
const ignoredNull = await pay(r3.external_id, null, null, "xs_r3");
check(
  "webhook: a status other than PAID, EXPIRED or FAILED (or none) is not applied",
  ignored.applied === false &&
    ignoredNull.applied === false &&
    (await invoiceRow(r3.invoice_id)).status === "pending",
  { ignored, ignoredNull },
);
const stale = await pay(r3.external_id, "EXPIRED", null, "xs_stale");
check(
  "webhook: EXPIRED from another session than the stored one is not applied",
  stale.applied === false && (await invoiceRow(r3.invoice_id)).status === "pending",
  stale,
);
const beforeExpire = await subRow(s1.subscription_id);
const expired = await pay(r3.external_id, "EXPIRED", null, "xs_r3");
const afterExpire = await subRow(s1.subscription_id);
check(
  "webhook: EXPIRED from the stored session expires the invoice and leaves the subscription alone",
  r3.reused === false &&
    expired.applied === true &&
    expired.invoice_status === "expired" &&
    afterExpire.status === "active" &&
    afterExpire.current_period_end.getTime() === beforeExpire.current_period_end.getTime(),
  { r3, expired },
);
const failAfterExpire = await pay(r3.external_id, "FAILED", null, "xs_r3");
check(
  "webhook: FAILED on an expired invoice is not applied",
  failAfterExpire.applied === false && failAfterExpire.invoice_status === "expired",
  failAfterExpire,
);
const r4 = await renew(s1.subscription_id);
const failed = await pay(r4.external_id, "FAILED", null, "xs_any");
check(
  "webhook: FAILED fails an invoice with no stored session",
  r4.reused === false && failed.applied === true && failed.invoice_status === "failed",
  { r4, failed },
);
const beforeLatePay = await subRow(s1.subscription_id);
const latePay = await pay(r4.external_id, "PAID", 69700, "xs_r4");
const lateExtended = await asOwner(() =>
  one(
    `SELECT current_period_end = $2::timestamptz + interval '1 month' AS month_long
       FROM public.subscriptions WHERE id = $1`,
    [s1.subscription_id, beforeLatePay.current_period_end],
  ),
);
check(
  "webhook: PAID on a failed invoice still settles it and extends the period",
  latePay.applied === true && latePay.invoice_status === "paid" && lateExtended.month_long,
  latePay,
);
const duplicate = await pay(r4.external_id, "PAID", 69700, "xs_r4b");
const dupNote = (await subRow(s1.subscription_id)).note ?? "";
check(
  "webhook: PAID from a second session on a paid invoice is not applied, and noted for a refund",
  duplicate.applied === false &&
    dupNote.includes(
      `Duplicate payment: session xs_r4b paid invoice ${r4.invoice_number} again on `,
    ) &&
    dupNote.endsWith("; refund in Xendit"),
  { duplicate, dupNote },
);
await pay(r4.external_id, "PAID", 69700, "xs_r4b");
const samePaid = await pay(r4.external_id, "PAID", 69700, "xs_r4");
const dupNoteAgain = (await subRow(s1.subscription_id)).note ?? "";
check(
  "webhook: the same duplicate again is noted once, and the paying session again not at all",
  samePaid.applied === false &&
    dupNoteAgain === dupNote &&
    dupNoteAgain.split("Duplicate payment").length === 2,
  dupNoteAgain,
);

// --- One-time plans ----------------------------------------------------------------
await as(P);
const s4 = await start(LIFETIME, 1, 2, [H4]);
const s4Invoice = await invoiceRow(s4.invoice_id);
check(
  "one-time: the invoice has no period end",
  s4.status === "pending" && s4Invoice.period_end === null,
  s4,
);
await expectError(
  "one-time: renew raises ONE_TIME_PLAN",
  () => renew(s4.subscription_id),
  /^ONE_TIME_PLAN/,
);

// --- Paid the wrong amount ----------------------------------------------------------
const under = await pay(s3.external_id, "PAID", 100);
const s3Row = await subRow(s3.subscription_id);
const s3Invoice = await invoiceRow(s3.invoice_id);
check(
  "webhook: PAID 100 on a 69700 invoice records the payment and marks it past due",
  under.applied === true &&
    under.invoice_status === "paid" &&
    under.subscription_status === "past_due" &&
    Number(s3Invoice.paid_centavos) === 100 &&
    s3Row.status === "past_due" &&
    s3Row.note === "Paid ₱1.00 for an invoice of ₱697.00; check in Xendit",
  { under, note: s3Row.note },
);

// --- PAID without an amount (a Payment Session) means as invoiced -----------------
const asInvoiced = await pay(s4.external_id, "PAID", null);
const s4Row = await subRow(s4.subscription_id);
const s4Paid = await invoiceRow(s4.invoice_id);
check(
  "webhook: PAID with no amount on a fresh invoice is applied and activates",
  asInvoiced.applied === true &&
    asInvoiced.subscription_status === "active" &&
    Number(s4Paid.paid_centavos) === 99900 &&
    s4Row.current_period_end === null &&
    (await nearNow(s4Row.current_period_start)),
  { asInvoiced, s4Row },
);

// --- Entitlements -------------------------------------------------------------------
await as(P);
const e1 = await entitlements(H1);
check(
  "entitlements: H1 has its subscription's seats (three paid months)",
  e1.source === "subscription" &&
    e1.subscription_id === s1.subscription_id &&
    e1.plan_name === "Household" &&
    e1.status === "active" &&
    e1.effective_status === "active" &&
    e1.helper_seats === 3 &&
    e1.manager_seats === 2 &&
    e1.days_left >= 85 &&
    e1.days_left <= 95,
  e1,
);
const e4 = await entitlements(H4);
check(
  "entitlements: a paid one-time plan has no end",
  e4.source === "subscription" &&
    e4.period_end === null &&
    e4.days_left === null &&
    e4.helper_seats === 1,
  e4,
);
await as(C);
check("entitlements: a co-manager reads them", (await entitlements(H1)).source === "subscription");
await as(Q);
const e3 = await entitlements(H3);
check(
  "entitlements: an underpaid subscription that never started gives no seats",
  e3.source === "free",
  e3,
);
await as(M2);
const e2 = await entitlements(H2);
check(
  "entitlements: no subscription and the free tier on: free, unlimited seats",
  e2.source === "free" &&
    e2.subscription_id === null &&
    e2.helper_seats === null &&
    e2.manager_seats === null,
  e2,
);
await asOwner(() => q(`UPDATE public.platform_settings SET free_tier_enabled = false`));
const e2None = await entitlements(H2);
check(
  "entitlements: with the free tier off: none, 0 seats",
  e2None.source === "none" && e2None.helper_seats === 0 && e2None.manager_seats === 0,
  e2None,
);
await asOwner(() =>
  q(
    `UPDATE public.platform_settings SET free_tier_enabled = true, free_helper_seats = 2, free_manager_seats = 1`,
  ),
);
const e2Seats = await entitlements(H2);
check(
  "entitlements: the free tier's seat numbers",
  e2Seats.source === "free" && e2Seats.helper_seats === 2 && e2Seats.manager_seats === 1,
  e2Seats,
);
await asOwner(() =>
  q(`UPDATE public.platform_settings SET free_helper_seats = NULL, free_manager_seats = NULL`),
);
await as(ADMIN);
check(
  "entitlements: a platform admin reads any household's",
  (await entitlements(H2)).source === "free",
);

// A pending subscription that's canceled was never paid for: no seats.
await as(Q);
const s3b = await start(MONTHLY, 1, 2, [H3]);
await cancel(s3b.subscription_id);
const e3b = await entitlements(H3);
check(
  "entitlements: a canceled subscription that never started gives no seats",
  e3b.source === "free",
  e3b,
);

// --- Canceling -------------------------------------------------------------------
await as(C);
await expectError(
  "cancel: a co-manager raises NOT_FOUND",
  () => cancel(s1.subscription_id),
  /^NOT_FOUND/,
);
const beforeCancel = await subRow(s1.subscription_id);
await as(P);
await cancel(s1.subscription_id);
const canceled = await subRow(s1.subscription_id);
check(
  "cancel: the primary cancels, the period end is kept",
  canceled.status === "canceled" &&
    canceled.canceled_at instanceof Date &&
    canceled.current_period_end.getTime() === beforeCancel.current_period_end.getTime(),
  canceled,
);
const eCanceled = await entitlements(H1);
check(
  "entitlements: canceled stays entitled until the period ends",
  eCanceled.source === "subscription" &&
    eCanceled.status === "canceled" &&
    eCanceled.effective_status === "canceled" &&
    eCanceled.helper_seats === 3,
  eCanceled,
);

// --- Trials -----------------------------------------------------------------------
await as(C);
check(
  "trial_eligible: not for a home the caller isn't primary of",
  (await trialEligible(STARTER, [H1])) === false,
);
await as(T);
check(
  "trial_eligible: not on a plan without a trial",
  (await trialEligible(MONTHLY, [H5])) === false,
);
check(
  "trial_eligible: a new home and a new buyer get the trial",
  (await trialEligible(STARTER, [H5])) === true,
);
const s5 = await start(STARTER, 2, 2, [H5]);
const s5Row = await asOwner(() =>
  one(
    `SELECT status, current_period_end - current_period_start = interval '14 days' AS two_weeks,
            abs(extract(epoch FROM (current_period_start - now()))) < 120 AS starts_now,
            (SELECT count(*)::int FROM public.platform_invoices WHERE subscription_id = $1) AS invoices
       FROM public.subscriptions WHERE id = $1`,
    [s5.subscription_id],
  ),
);
check(
  "trial: trialing for 14 days, no invoice",
  s5.status === "trialing" &&
    s5.invoice_id === null &&
    s5Row.two_weeks &&
    s5Row.starts_now &&
    s5Row.invoices === 0,
  { s5, s5Row },
);
const e5 = await entitlements(H5);
check(
  "entitlements: a trial gives its seats",
  e5.source === "subscription" &&
    e5.status === "trialing" &&
    e5.helper_seats === 2 &&
    e5.days_left === 14,
  e5,
);
check(
  "trial_eligible: not once the home has had a trial",
  (await trialEligible(STARTER, [H5])) === false,
);
const s6 = await start(STARTER, 2, 2, [H5]);
check(
  "trial: a home that had a subscription gets no second trial",
  s6.status === "pending" && typeof s6.invoice_id === "string",
  s6,
);
await as(Q);
check(
  "trial_eligible: unpaid checkouts (pending, canceled before starting, underpaid) don't use it up",
  (await trialEligible(STARTER, [H3])) === true,
);
await as(P);
check(
  "trial_eligible: not for a buyer who already owns a subscription that started, even on a new home",
  (await trialEligible(STARTER, [H6])) === false,
);
const sFarm = await start(STARTER, 2, 2, [H6]);
check(
  "trial: start_subscription follows trial_eligible (no trial farming through a new household)",
  sFarm.status === "pending" && typeof sFarm.invoice_id === "string",
  sFarm,
);
await as(T);
check(
  "trial_eligible: an owner who has had a trial gets none on another home",
  (await trialEligible(STARTER, [H10])) === false,
);
const sTanBeach = await start(STARTER, 2, 2, [H10]);
check(
  "trial: a second start by the same owner, on a new home, is not a trial",
  sTanBeach.status === "pending" && typeof sTanBeach.invoice_id === "string",
  sTanBeach,
);

// The grace week after a period ends, then the free tier.
await as(T);
await setEnd(s5.subscription_id, `now() - interval '2 days'`);
const eGrace = await entitlements(H5);
check(
  "entitlements: ended 2 days ago: past due, still entitled",
  eGrace.source === "subscription" &&
    eGrace.effective_status === "past_due" &&
    eGrace.days_left === 0,
  eGrace,
);
await setEnd(s5.subscription_id, `now() - interval '8 days'`);
const eLapsed = await entitlements(H5);
check(
  "entitlements: ended 8 days ago: expired, back to the free tier",
  eLapsed.source === "free" &&
    eLapsed.effective_status === "expired" &&
    eLapsed.subscription_id === s5.subscription_id &&
    eLapsed.helper_seats === null,
  eLapsed,
);
await asOwner(() =>
  q(
    `UPDATE public.subscriptions SET status = 'canceled', current_period_end = now() - interval '1 hour' WHERE id = $1`,
    [s5.subscription_id],
  ),
);
const eCanceledEnded = await entitlements(H5);
check(
  "entitlements: canceled and ended: expired at once",
  eCanceledEnded.source === "free" && eCanceledEnded.effective_status === "expired",
  eCanceledEnded,
);

// --- Marking an invoice paid by hand ---------------------------------------------------
// A checkout left open on the invoice the admin is about to mark paid.
await as(T);
await attach(s6.invoice_id, "xs_s6", XENDIT("xs_s6"));
await as(P);
await expectError(
  "mark paid: a non-admin raises NOT_ADMIN",
  () =>
    q(`SELECT public.mark_platform_invoice_paid_manually($1, 'gcash', 'at the counter')`, [
      s6.invoice_id,
    ]),
  /^NOT_ADMIN/,
);
await as(ADMIN);
const manual = await rpc(
  `public.mark_platform_invoice_paid_manually($1, 'gcash', 'GCash ref 123')`,
  [s6.invoice_id],
);
const manualInvoice = await invoiceRow(s6.invoice_id);
check(
  "mark paid: the admin activates the subscription, channel manual:gcash",
  manual.applied === true &&
    manual.subscription_status === "active" &&
    manualInvoice.paid_channel === "manual:gcash" &&
    Number(manualInvoice.paid_centavos) === Number(manualInvoice.amount_centavos) &&
    manualInvoice.raw_callback.manual === true &&
    manualInvoice.raw_callback.note === "GCash ref 123" &&
    manualInvoice.raw_callback.by === ADMIN,
  { manual, manualInvoice },
);
const manualAgain = await rpc(`public.mark_platform_invoice_paid_manually($1, 'gcash', 'twice')`, [
  s6.invoice_id,
]);
check("mark paid: again is not applied", manualAgain.applied === false, manualAgain);
await expectError(
  "mark paid: an unknown invoice raises NOT_FOUND",
  () => q(`SELECT public.mark_platform_invoice_paid_manually(gen_random_uuid(), 'gcash', 'x')`),
  /^NOT_FOUND/,
);
// The customer then completes that open checkout too.
const afterManual = await pay(s6.external_id, "PAID", null, "xs_s6");
const afterManualInvoice = await invoiceRow(s6.invoice_id);
const afterManualNote = (await subRow(s6.subscription_id)).note ?? "";
check(
  "a Xendit payment after a manual mark is not applied, but noted for a refund and its callback kept",
  afterManual.applied === false &&
    afterManualNote.includes(
      `Duplicate payment: session xs_s6 paid invoice ${s6.invoice_number} again on `,
    ) &&
    afterManualInvoice.raw_callback.manual === true &&
    afterManualInvoice.raw_callback.callback_xs_s6?.event === "payment_session.completed",
  { afterManual, afterManualNote, raw: afterManualInvoice.raw_callback },
);

// H5 now has s5 (canceled, ended an hour ago: expired) and s6 (active). With
// s6 two days into its grace week, the later-ending s5 still loses to it.
await setEnd(s6.subscription_id, `now() - interval '2 days'`);
await as(T);
const eBest = await entitlements(H5);
check(
  "entitlements: a subscription in its grace week beats a later-ending expired one",
  eBest.source === "subscription" &&
    eBest.subscription_id === s6.subscription_id &&
    eBest.effective_status === "past_due",
  eBest,
);

// --- Comping a household -------------------------------------------------------------
const GRANT = `SELECT public.grant_subscription($1, $2, 2, 2, now() + interval '30 days', 'pilot') AS r`;
await as(P);
await expectError(
  "grant: a non-admin raises NOT_ADMIN",
  () => q(GRANT, [H2, MONTHLY]),
  /^NOT_ADMIN/,
);
await as(ADMIN);
await expectError(
  "grant: a household with no primary manager raises NOT_FOUND",
  () => q(GRANT, [H7, MONTHLY]),
  /^NOT_FOUND/,
);
await expectError(
  "grant: a period end in the past raises BAD_PERIOD",
  () =>
    q(`SELECT public.grant_subscription($1, $2, 2, 2, now() - interval '1 day', 'late')`, [
      H2,
      MONTHLY,
    ]),
  /^BAD_PERIOD/,
);
await expectError(
  "grant: negative helper seats raise BAD_SEATS",
  () => q(`SELECT public.grant_subscription($1, $2, -1, 2, NULL, 'x')`, [H2, MONTHLY]),
  /^BAD_SEATS:helper/,
);
await expectError(
  "grant: negative manager seats raise BAD_SEATS",
  () => q(`SELECT public.grant_subscription($1, $2, 2, -1, NULL, 'x')`, [H2, MONTHLY]),
  /^BAD_SEATS:manager/,
);
const granted = (await one(GRANT, [H2, MONTHLY])).r;
const grantedSub = await subRow(granted.subscription_id);
const grantedInvoice = await invoiceRow(granted.invoice_id);
check(
  "grant: an active subscription owned by the household's primary, amount 0",
  grantedSub.status === "active" &&
    grantedSub.owner_user_id === M2 &&
    Number(grantedSub.amount_centavos) === 0 &&
    grantedSub.note === "pilot",
  grantedSub,
);
check(
  "grant: a paid invoice of 0 with channel comp",
  grantedInvoice.status === "paid" &&
    Number(grantedInvoice.amount_centavos) === 0 &&
    Number(grantedInvoice.paid_centavos) === 0 &&
    grantedInvoice.paid_channel === "comp",
  grantedInvoice,
);
await as(M2);
const eGranted = await entitlements(H2);
check(
  "grant: H2 is entitled through the subscription",
  eGranted.source === "subscription" &&
    eGranted.helper_seats === 2 &&
    eGranted.manager_seats === 2 &&
    eGranted.days_left === 30,
  eGranted,
);

// --- Paying for a new plan replaces the running one ---------------------------------
await as(Q);
const s3c = await start(MONTHLY, 1, 2, [H3]);
await asOwner(() =>
  q(
    `UPDATE public.platform_invoices SET period_start = now() - interval '10 days', period_end = now() - interval '9 days' WHERE id = $1`,
    [s3c.invoice_id],
  ),
);
await pay(s3c.external_id, "PAID", 49900, "xs_s3c");
const s3cPeriods = await asOwner(() =>
  one(
    `SELECT i.period_start = s.current_period_start AND i.period_end = s.current_period_end AS same
       FROM public.platform_invoices i JOIN public.subscriptions s ON s.id = i.subscription_id
      WHERE i.id = $1`,
    [s3c.invoice_id],
  ),
);
check(
  "settling rewrites the invoice's period to the one granted",
  s3cPeriods.same === true,
  s3cPeriods,
);
check(
  "trial_eligible: not once a subscription on the home has started",
  (await trialEligible(STARTER, [H3])) === false,
);
const r3c = await renew(s3c.subscription_id);
const s3d = await start(MONTHLY, 3, 2, [H3]);
await pay(s3d.external_id, "PAID", 69700, "xs_s3d");
const replaced = await asOwner(() =>
  one(
    `SELECT status, canceled_at IS NOT NULL AS canceled_at, current_period_end <= now() AS ended, note
       FROM public.subscriptions WHERE id = $1`,
    [s3c.subscription_id],
  ),
);
check(
  "paying for a new plan ends the running one on the same home, noted",
  replaced.status === "canceled" &&
    replaced.canceled_at &&
    replaced.ended &&
    replaced.note === `Replaced by ${s3d.subscription_id}`,
  replaced,
);
check(
  "a subscription that never started isn't touched by the replacement",
  (await subRow(s3.subscription_id)).status === "past_due",
);
const e3d = await entitlements(H3);
check(
  "entitlements: the new plan is the home's",
  e3d.source === "subscription" && e3d.subscription_id === s3d.subscription_id,
  e3d,
);
const r3cRow = await invoiceRow(r3c.invoice_id);
check(
  "the replaced subscription's pending invoice expires, marked replaced",
  r3c.reused === false &&
    r3cRow.status === "expired" &&
    r3cRow.raw_callback.replaced_by === s3d.subscription_id &&
    r3cRow.raw_callback.note === `Replaced by ${s3d.subscription_id}`,
  r3cRow,
);
const lateOnReplaced = await pay(r3c.external_id, "PAID", 49900, "xs_r3c");
const s3cAfter = await subRow(s3c.subscription_id);
check(
  "paying a replaced plan's invoice is not applied: it stays ended, the new plan stays, a refund is noted",
  lateOnReplaced.applied === false &&
    s3cAfter.status === "canceled" &&
    (await subRow(s3d.subscription_id)).status === "active" &&
    s3cAfter.note.includes(`Late payment: session xs_r3c paid invoice ${r3c.invoice_number} on `) &&
    s3cAfter.note.endsWith("; refund in Xendit") &&
    (await invoiceRow(r3c.invoice_id)).raw_callback.callback_xs_r3c?.event ===
      "payment_session.completed",
  { lateOnReplaced, note: s3cAfter.note },
);

// A subscription that also covers a home the new one doesn't is left alone.
await as(S);
const multi = await start(MONTHLY, 1, 2, [H8, H9]);
await pay(multi.external_id, "PAID", 49900, "xs_multi");
const multiBefore = await subRow(multi.subscription_id);
const single = await start(MONTHLY, 1, 2, [H8]);
await pay(single.external_id, "PAID", 49900, "xs_single");
const multiAfter = await subRow(multi.subscription_id);
check(
  "paying a one-home plan doesn't end a subscription that also covers another home",
  multiAfter.status === "active" &&
    multiAfter.current_period_end.getTime() === multiBefore.current_period_end.getTime() &&
    multiAfter.note === null &&
    (await subRow(single.subscription_id)).status === "active",
  multiAfter,
);

// Acting for a 2-home subscription takes being primary of both homes.
const setPrimary = (household, primary, demoted) =>
  asOwner(async () => {
    await q(
      `UPDATE public.household_managers SET role = 'co_manager' WHERE household_id = $1 AND user_id = $2`,
      [household, demoted],
    );
    await q(
      `UPDATE public.household_managers SET role = 'primary_manager' WHERE household_id = $1 AND user_id = $2`,
      [household, primary],
    );
  });
await as(S);
const rMulti = await renew(multi.subscription_id);
check(
  "the primary of both homes renews it",
  rMulti.reused === false && typeof rMulti.invoice_id === "string",
  rMulti,
);
await setPrimary(H9, V, S);
for (const [who, uid] of [
  ["the primary of only the second home", V],
  ["the primary of only the first home", S],
]) {
  await as(uid);
  await expectError(`${who} can't renew it`, () => renew(multi.subscription_id), /^NOT_FOUND/);
  await expectError(`${who} can't cancel it`, () => cancel(multi.subscription_id), /^NOT_FOUND/);
}
await as(V);
await expectError(
  "the primary of only one home can't attach a payment link to it",
  () => attach(rMulti.invoice_id, "xs_v", XENDIT("xs_v")),
  /^NOT_FOUND/,
);
await setPrimary(H9, S, V);
await as(S);
await attach(rMulti.invoice_id, "xs_s", XENDIT("xs_s"));
await cancel(multi.subscription_id);
check(
  "the primary of both homes attaches its payment link and cancels it",
  (await invoiceRow(rMulti.invoice_id)).xendit_session_id === "xs_s" &&
    (await subRow(multi.subscription_id)).status === "canceled",
);

// --- Acting for a subscription after the primary hands over -------------------------
await asOwner(() =>
  q(
    `UPDATE public.household_managers SET role = 'co_manager' WHERE household_id = $1 AND user_id = $2;`,
    [H3, Q],
  ),
);
await asOwner(() =>
  q(
    `UPDATE public.household_managers SET role = 'primary_manager' WHERE household_id = $1 AND user_id = $2`,
    [H3, R],
  ),
);
await as(Q);
await expectError(
  "an owner who handed over primary can't renew",
  () => renew(s3d.subscription_id),
  /^NOT_FOUND/,
);
await expectError(
  "an owner who handed over primary can't cancel",
  () => cancel(s3d.subscription_id),
  /^NOT_FOUND/,
);
await as(R);
const rR = await renew(s3d.subscription_id);
check(
  "the new primary, not the owner, renews",
  rR.reused === false && typeof rR.invoice_id === "string",
  rR,
);
await as(Q);
await expectError(
  "an owner who handed over primary can't attach a payment link",
  () => attach(rR.invoice_id, "xs_q", XENDIT("xs_q")),
  /^NOT_FOUND/,
);
await as(R);
await attach(rR.invoice_id, "xs_r", XENDIT("xs_r"), "rico@example.com");
check(
  "the new primary attaches the payment link",
  (await invoiceRow(rR.invoice_id)).payer_email === "rico@example.com",
);
await asOwner(() =>
  q(`DELETE FROM public.household_managers WHERE household_id = $1 AND user_id = $2`, [H3, Q]),
);
await as(Q);
await expectError(
  "an owner removed from the household can't renew",
  () => renew(s3d.subscription_id),
  /^NOT_FOUND/,
);
await as(R);
await cancel(s3d.subscription_id);
check("the new primary cancels", (await subRow(s3d.subscription_id)).status === "canceled");

// --- The admin's household list --------------------------------------------------------
await as(P);
const r5 = await renew(s1.subscription_id);
await expectError(
  "overview: a non-admin raises NOT_ADMIN",
  () => q(`SELECT public.platform_households_overview()`),
  /^NOT_ADMIN/,
);
await as(ADMIN);
const overview = await rpc(`public.platform_households_overview()`);
const names = overview.map((h) => h.name);
const byId = Object.fromEntries(overview.map((h) => [h.household_id, h]));
check(
  "overview: every household, ordered by name",
  overview.length === 10 &&
    JSON.stringify(names) === JSON.stringify([...names].sort((a, b) => a.localeCompare(b))),
  names,
);
check(
  "overview: H1's managers, active helpers, entitlements and pending invoice",
  byId[H1].managers === 2 &&
    byId[H1].helpers === 2 &&
    byId[H1].entitlements.source === "subscription" &&
    byId[H1].pending_invoice?.id === r5.invoice_id &&
    byId[H1].pending_invoice.invoice_number === r5.invoice_number &&
    byId[H1].pending_invoice.amount_centavos === 69700,
  byId[H1],
);
check(
  "overview: H2 has no pending invoice",
  byId[H2].managers === 1 &&
    byId[H2].helpers === 1 &&
    byId[H2].entitlements.source === "subscription" &&
    byId[H2].pending_invoice === null,
  byId[H2],
);
check(
  "overview: the admin sees the subscriptions' notes (duplicate payment, underpaid)",
  byId[H1].notes.some((n) => n.note.includes("Duplicate payment")) &&
    byId[H3].notes.some((n) => n.note.startsWith("Paid ₱1.00")),
  { H1: byId[H1].notes, H3: byId[H3].notes },
);

// --- Renewing a comp is priced from its plan -----------------------------------------
await as(M2);
const rComp = await renew(granted.subscription_id);
check(
  "renewing a comp invoices the plan's price for its seats (49900 + 1 extra helper)",
  rComp.reused === false && rComp.amount_centavos === 59800,
  rComp,
);

// --- Admins cancel; a comp ends at once ------------------------------------------------
await as(ADMIN);
await cancel(granted.subscription_id);
const revoked = await asOwner(() =>
  one(
    `SELECT status, current_period_end <= now() AS ended FROM public.subscriptions WHERE id = $1`,
    [granted.subscription_id],
  ),
);
check(
  "an admin revokes a comp: canceled and ended now",
  revoked.status === "canceled" && revoked.ended,
  revoked,
);
await as(M2);
check("a revoked comp leaves the free tier", (await entitlements(H2)).source === "free");
await as(ADMIN);
await cancel(s4.subscription_id);
const adminCanceled = await subRow(s4.subscription_id);
check(
  "an admin cancels a paid subscription: its period is kept",
  adminCanceled.status === "canceled" && adminCanceled.current_period_end === null,
  adminCanceled,
);

// --- A comp with unlimited seats renews with concrete ones ---------------------------
await as(ADMIN);
const openComp = (
  await one(`SELECT public.grant_subscription($1, $2, NULL, NULL, NULL, 'open pilot') AS r`, [
    H2,
    MONTHLY,
  ])
).r;
await as(M2);
const rOpen = await renew(openComp.subscription_id);
const rOpenQuote = (await invoiceRow(rOpen.invoice_id)).quote;
check(
  "renewing a comp with NULL seats quotes concrete seats (the plan's included)",
  rOpen.amount_centavos === 49900 &&
    rOpenQuote.helper_seats === 1 &&
    rOpenQuote.manager_seats === 2 &&
    rOpenQuote.home_seats === 1 &&
    rOpenQuote.amount_centavos === 49900,
  rOpenQuote,
);
await pay(rOpen.external_id, "PAID", null, "xs_open");
const openPaid = await subRow(openComp.subscription_id);
check(
  "paying it sets the subscription's seats to the quote's",
  openPaid.status === "active" &&
    openPaid.helper_seats === 1 &&
    openPaid.manager_seats === 2 &&
    Number(openPaid.amount_centavos) === 49900,
  openPaid,
);

// --- Deleting the owner's account keeps the revenue record -----------------------------
const s6Invoices = async () =>
  (
    await asOwner(() =>
      one(`SELECT count(*)::int AS n FROM public.platform_invoices WHERE subscription_id = $1`, [
        s6.subscription_id,
      ]),
    )
  ).n;
const invoicesBefore = await s6Invoices();
await asOwner(() => q(`DELETE FROM auth.users WHERE id = $1`, [T]));
const orphan = await subRow(s6.subscription_id);
check(
  "deleting the owner's account keeps the subscription, without an owner",
  orphan !== undefined && orphan.owner_user_id === null && orphan.status === "active",
  orphan,
);
check(
  "and its invoices",
  invoicesBefore === 1 && (await s6Invoices()) === invoicesBefore,
  invoicesBefore,
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
