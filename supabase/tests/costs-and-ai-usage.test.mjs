// Runs add-costs-and-ai-usage.sql against a real Postgres (PGlite) as the API's
// roles: only a platform admin reads or writes cost_entries, model_prices and
// ai_usage; the AI edge functions (service_role) record a priced call; the
// admin's analytics add paid invoices, costs and AI spend into revenue, cost of
// goods and profit per user. Sell-Linara plan, Task 5.
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
/** As an AI edge function, which calls with the service role. */
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
// subscriptions.test.mjs, plus Supabase's service_role.
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
await db.exec(readFileSync(`${REPO}/add-subscriptions.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-costs-and-ai-usage.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-costs-and-ai-usage.sql`, "utf8"));
console.log("migration applied twice");

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const P = "00000000-0000-0000-0000-00000000000a"; // primary of H1
const C = "00000000-0000-0000-0000-00000000000c"; // co-manager of H1
const M2 = "00000000-0000-0000-0000-0000000000b2"; // primary of H2, never pays
const H1 = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";

await db.exec(`
  INSERT INTO auth.users VALUES ('${ADMIN}'), ('${P}'), ('${C}'), ('${M2}');
  INSERT INTO households (id, name) VALUES ('${H1}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles (id, household_id, full_name, user_type) VALUES
    ('${P}', '${H1}', 'Ben Reyes', 'primary_manager'),
    ('${C}', '${H1}', 'Carla Reyes', 'co_manager'),
    ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager');
  INSERT INTO household_managers (household_id, user_id, role) VALUES
    ('${H1}', '${P}', 'primary_manager'), ('${H1}', '${C}', 'co_manager'),
    ('${H2}', '${M2}', 'primary_manager');
  INSERT INTO platform_admins (user_id, note) VALUES ('${ADMIN}', 'owner');
`);
await db.exec(`SET ROLE authenticated`);

const countAs = async (uid, table) => {
  await as(uid);
  return (await one(`SELECT count(*)::int AS n FROM public.${table}`)).n;
};
const analytics = async (from, to) =>
  (await one(`SELECT public.platform_analytics($1::date, $2::date) AS r`, [from, to])).r;

// --- Seeded prices --------------------------------------------------------------
await as(ADMIN);
const prices = await q(
  `SELECT model, input_centavos_per_1m::int AS i, output_centavos_per_1m::int AS o,
          audio_centavos_per_minute::int AS a FROM public.model_prices ORDER BY model`,
);
check(
  "prices: gpt-4o, gpt-4o-mini and whisper-1 are seeded",
  JSON.stringify(prices) ===
    JSON.stringify([
      { model: "gpt-4o", i: 14000, o: 56000, a: 0 },
      { model: "gpt-4o-mini", i: 840, o: 3360, a: 0 },
      { model: "whisper-1", i: 0, o: 0, a: 34 },
    ]),
  prices,
);
check("prices: a non-admin sees none", (await countAs(P, "model_prices")) === 0);
await expectError(
  "prices: a non-admin can't insert",
  () => q(`INSERT INTO public.model_prices (model) VALUES ('x')`),
  /row-level security/,
);
await as(ADMIN);
await q(`UPDATE public.model_prices SET note = 'checked' WHERE model = 'gpt-4o-mini'`);
check(
  "prices: an admin can edit a price row",
  (await one(`SELECT note FROM public.model_prices WHERE model = 'gpt-4o-mini'`)).note ===
    "checked",
);

// --- Cost entries ---------------------------------------------------------------
await as(P);
await expectError(
  "costs: a non-admin can't insert",
  () =>
    q(`INSERT INTO public.cost_entries (month, category, label, amount_centavos)
       VALUES ('2026-10-01', 'infra', 'Supabase', 100)`),
  /row-level security/,
);
await as(ADMIN);
const cost = await one(
  `INSERT INTO public.cost_entries (month, category, label, amount_centavos)
   VALUES ('2026-10-01', 'infra', 'Supabase + Vercel', 150000) RETURNING id, created_by`,
);
check("costs: an admin inserts and created_by defaults to them", cost.created_by === ADMIN, cost);
check("costs: a non-admin reads none", (await countAs(P, "cost_entries")) === 0);
check("costs: the admin reads it", (await countAs(ADMIN, "cost_entries")) === 1);
await as(P);
const hidden = await q(`UPDATE public.cost_entries SET amount_centavos = 1 RETURNING id`);
check("costs: a non-admin's update matches nothing", hidden.length === 0, hidden);
await as(ADMIN);
await expectError(
  "costs: a mid-month `month` is rejected",
  () =>
    q(`INSERT INTO public.cost_entries (month, category, label, amount_centavos)
       VALUES ('2026-10-15', 'infra', 'x', 1)`),
  /check constraint/,
);
await expectError(
  "costs: an unknown category is rejected",
  () =>
    q(`INSERT INTO public.cost_entries (month, category, label, amount_centavos)
       VALUES ('2026-10-01', 'snacks', 'x', 1)`),
  /check constraint/,
);
await expectError(
  "costs: a negative amount is rejected",
  () =>
    q(`INSERT INTO public.cost_entries (month, category, label, amount_centavos)
       VALUES ('2026-10-01', 'other', 'x', -1)`),
  /check constraint/,
);

// --- Pricing and recording an AI call -------------------------------------------
const priced = await asService(() =>
  one(`SELECT public.price_ai_call('gpt-4o-mini', 1000, 500, 0) AS c`),
);
check(
  "price_ai_call: 1000 in / 500 out on gpt-4o-mini is 3 centavos",
  Number(priced.c) === 3,
  priced,
);
const whisper = await asService(() =>
  one(`SELECT public.price_ai_call('whisper-1', 0, 0, 90) AS c`),
);
check("price_ai_call: 90s of whisper-1 is 51 centavos", Number(whisper.c) === 51, whisper);
const unknownModel = await asService(() =>
  one(`SELECT public.price_ai_call('mystery', 5000, 5000, 60) AS c`),
);
check("price_ai_call: an unknown model costs 0", Number(unknownModel.c) === 0, unknownModel);

await as(P);
await expectError(
  "ai_usage: authenticated can't execute record_ai_usage",
  () => q(`SELECT public.record_ai_usage($1, $2, 'scheduler', 'gpt-4o-mini', 1, 1, 0)`, [P, H1]),
  /permission denied/,
);
await expectError(
  "ai_usage: authenticated can't insert directly",
  () => q(`INSERT INTO public.ai_usage (fn, model) VALUES ('scheduler', 'gpt-4o-mini')`),
  /permission denied/,
);
const recorded = await asService(() =>
  one(`SELECT public.record_ai_usage($1, $2, 'scheduler', 'gpt-4o-mini', 1000, 500, 0) AS c`, [
    P,
    H1,
  ]),
);
check(
  "ai_usage: service_role records the call and gets the cost",
  Number(recorded.c) === 3,
  recorded,
);
const fromProfile = await asService(() =>
  one(`SELECT public.record_ai_usage($1, NULL, 'sop', 'unknown-model', 10, 10, 0) AS c`, [P]),
);
const looked = await asOwner(() =>
  one(`SELECT household_id FROM public.ai_usage WHERE fn = 'sop'`),
);
check(
  "ai_usage: a NULL household is looked up from the user's profile, unknown model costs 0",
  Number(fromProfile.c) === 0 && looked.household_id === H1,
  { fromProfile, looked },
);
await asOwner(() => db.exec(`DELETE FROM public.ai_usage WHERE fn = 'sop'`));
check("ai_usage: a non-admin reads none", (await countAs(P, "ai_usage")) === 0);
check("ai_usage: the admin reads it", (await countAs(ADMIN, "ai_usage")) === 1);
// Put the call in October so the range below is stable whatever day this runs.
await asOwner(() => db.exec(`UPDATE public.ai_usage SET at = '2026-10-10 12:00+08'`));

// --- Analytics ------------------------------------------------------------------
await as(P);
await expectError(
  "analytics: a non-admin gets NOT_ADMIN",
  () => q(`SELECT public.platform_analytics('2026-10-01', '2026-10-31')`),
  /^NOT_ADMIN/,
);
await expectError(
  "analytics: anon can't execute it",
  async () => {
    await db.exec("RESET ROLE");
    await db.exec("SET ROLE anon");
    try {
      await q(`SELECT public.platform_analytics('2026-10-01', '2026-10-31')`);
    } finally {
      await db.exec("RESET ROLE");
      await db.exec("SET ROLE authenticated");
    }
  },
  /permission denied/,
);

await as(ADMIN);
const empty = await analytics("2026-01-01", "2026-01-31");
check(
  "analytics: an empty range is all zeros with null ratios",
  empty.revenue_centavos === 0 &&
    empty.ai_calls === 0 &&
    empty.cost_per_call_centavos === null &&
    empty.users === 0 &&
    empty.profit_per_user_centavos === null &&
    empty.series.length === 0 &&
    empty.ai_by_fn.length === 0,
  empty,
);

// A primary manager buys the plan, the webhook pays it on 2026-10-05.
const plan = (
  await one(
    `INSERT INTO public.plans (name, interval, base_centavos, included_helpers, extra_helper_centavos,
                               included_managers, extra_manager_centavos, status, is_public)
     VALUES ('Household', 'monthly', 49900, 1, 9900, 2, NULL, 'active', true) RETURNING id`,
  )
).id;
await as(P);
const sub = (
  await one(`SELECT public.start_subscription($1, 3, 2, ARRAY[$2]::uuid[]) AS r`, [plan, H1])
).r;
await asService(() =>
  q(
    `SELECT public.record_platform_invoice_result($1, 'ps_1', 'PAID', 69700, '2026-10-05 10:00+08'::timestamptz, 'GCASH', '{}'::jsonb)`,
    [sub.external_id],
  ),
);
// The period starts when it is paid (now); pin it to October for a stable range.
await asOwner(() =>
  q(
    `UPDATE public.subscriptions SET current_period_start = '2026-10-05 10:00+08',
            current_period_end = '2026-11-05 10:00+08' WHERE id = $1`,
    [sub.subscription_id],
  ),
);

// H2 is comped (₱0) for October: covered, but not paying.
await as(ADMIN);
const comp = (
  await one(
    `SELECT public.grant_subscription($1, $2, 2, 2, now() + interval '30 days', 'pilot') AS r`,
    [H2, plan],
  )
).r;
await asOwner(() =>
  q(
    `UPDATE public.subscriptions SET current_period_start = '2026-10-02 10:00+08',
            current_period_end = '2026-12-01 10:00+08' WHERE id = $1`,
    [comp.subscription_id],
  ),
);
const a = await analytics("2026-10-01", "2026-10-31");
check(
  "analytics: revenue, cost of goods and profit add up",
  a.revenue_centavos === 69700 &&
    a.cost_entries_centavos === 150000 &&
    a.ai_cost_centavos === 3 &&
    a.cogs_centavos === 150003 &&
    a.profit_centavos === -80303,
  a,
);
check(
  "analytics: AI calls and cost per call",
  a.ai_calls === 1 && a.cost_per_call_centavos === 3,
  a,
);
check(
  "analytics: one paying household (the comp isn't), its two managers, profit per user",
  a.paying_households === 1 && a.users === 2 && a.profit_per_user_centavos === -40152,
  a,
);
check(
  "analytics: one 2026-10 series entry",
  a.series.length === 1 &&
    a.series[0].month === "2026-10" &&
    a.series[0].revenue_centavos === 69700 &&
    a.series[0].cogs_centavos === 150003 &&
    a.series[0].profit_centavos === -80303 &&
    a.series[0].ai_calls === 1,
  a.series,
);
check(
  "analytics: one ai_by_fn row",
  a.ai_by_fn.length === 1 &&
    a.ai_by_fn[0].fn === "scheduler" &&
    a.ai_by_fn[0].calls === 1 &&
    a.ai_by_fn[0].cost_centavos === 3 &&
    a.ai_by_fn[0].input_tokens === 1000 &&
    a.ai_by_fn[0].output_tokens === 500,
  a.ai_by_fn,
);
const november = await analytics("2026-11-06", "2026-11-30");
check(
  "analytics: a later range has no revenue and no paying household",
  november.revenue_centavos === 0 && november.paying_households === 0 && november.users === 0,
  november,
);
const lastDay = await analytics("2026-10-01", "2026-10-10");
check(
  "analytics: the end date is inclusive for AI calls",
  lastDay.ai_calls === 1 && lastDay.revenue_centavos === 69700,
  lastDay,
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
