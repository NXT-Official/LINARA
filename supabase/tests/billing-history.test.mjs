// Runs add-billing-history.sql against a real Postgres (PGlite): every
// subscription change is logged once with its MRR before and after, buying
// again after a plan ended counts as new, and only the server reads it.
//
//   node supabase/tests/billing-history.test.mjs
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const db = new PGlite();
let failures = 0;

const as = async (uid) => {
  await db.exec(uid ? "SET ROLE authenticated" : "RESET ROLE");
  await db.query("SELECT set_config('test.uid', $1, false)", [uid ?? ""]);
};
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

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
await db.exec("CREATE ROLE service_role");
await db.exec(`
  CREATE TABLE public.pantry_items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), household_id UUID NOT NULL, name TEXT NOT NULL);
  ALTER TABLE payslips DROP COLUMN payout_reference_id;
  ALTER TABLE user_profiles ALTER COLUMN household_id DROP NOT NULL;
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false,
                         ADD COLUMN petty_cash_budget NUMERIC(10,2) NOT NULL DEFAULT 1500;
  ALTER TABLE tickets ADD COLUMN suggested BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN emergency BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE quick_utos ADD COLUMN emergency BOOLEAN NOT NULL DEFAULT false;
  CREATE FUNCTION public.ticket_ledger_source(p UUID, a TIMESTAMPTZ, b BOOLEAN, c BOOLEAN)
  RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;

  CREATE SCHEMA storage;
  CREATE TABLE storage.objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id TEXT NOT NULL,
    name TEXT NOT NULL
  );
  CREATE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS
  $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA storage TO authenticated;
  GRANT EXECUTE ON FUNCTION storage.foldername(TEXT) TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
`);
for (const file of [
  "fix-helper-write-access.sql",
  "add-employment-end.sql",
  "add-pay-periods.sql",
  "add-account-deletion.sql",
  "add-household-managers.sql",
  "add-direct-gcash-pay.sql",
  "restrict-create-household.sql",
  "add-pay-hr-switch.sql",
  "add-billing.sql",
  "add-billing.sql",
  "add-billing-idempotency.sql",
  "add-billing-idempotency.sql",
  "add-billing-plan-changes.sql",
  "add-billing-plan-changes.sql",
  "add-ai-call-limits.sql",
  "add-billing-history.sql",
  "add-billing-history.sql",
]) {
  await db.exec(readFileSync(`${REPO}/${file}`, "utf8"));
}
// Supabase grants every new public table to authenticated by default; only RLS
// stands between a signed-in user and app_switches.
await db.exec(`GRANT ALL ON public.app_switches TO authenticated`);
console.log("migrations applied (add-billing.sql twice)");

const M = "00000000-0000-0000-0000-00000000000a"; // manager, primary of H
const U = "00000000-0000-0000-0000-00000000000b"; // helper account, works in H
const C = "00000000-0000-0000-0000-00000000000c"; // a second manager account
const X = "00000000-0000-0000-0000-00000000000d"; // another primary manager, household H2
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const HP = "20000000-0000-0000-0000-000000000001";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${U}'), ('${C}'), ('${X}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO user_profiles VALUES ('${C}', NULL, 'Ana Lim', 'co_manager', now());
  INSERT INTO user_profiles VALUES ('${X}', '${H2}', 'Joy Cruz', 'primary_manager', now());
  INSERT INTO household_managers (household_id, user_id, role) VALUES ('${H}', '${M}', 'primary_manager');
  INSERT INTO household_managers (household_id, user_id, role) VALUES ('${H2}', '${X}', 'primary_manager');
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status, created_at, started_on)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE', '2026-08-10 02:00+00', '2026-08-10');
`);

const svc = async (sql, params) => {
  await as(null);
  return one(sql, params);
};
const pay = (kind, plan, cycle, addons = []) =>
  svc(`SELECT billing_create_payment($1, $2, $3, $4, $5::jsonb) AS p`, [
    M,
    kind,
    plan,
    cycle,
    JSON.stringify(addons),
  ]).then((r) => r.p);
let invoiceN = 0;
const invoiceFor = async (payment) => {
  const id = `inv_${++invoiceN}`;
  await svc(
    `SELECT billing_attach_invoice($1, $2, 'https://checkout-staging.xendit.co/x', now() + interval '1 day')`,
    [payment.id, id],
  );
  return id;
};
const apply = async (invoice) =>
  (await svc(`SELECT billing_apply_invoice($1::jsonb) AS o`, [JSON.stringify(invoice)])).o;
const paid = (id, pesos, extra = {}) => ({
  id,
  status: "PAID",
  paid_amount: pesos,
  amount: pesos,
  currency: "PHP",
  payment_channel: "GCASH",
  ...extra,
});

const events = async () => {
  await as(null);
  return q(
    `SELECT kind, mrr_before::int AS b, mrr_after::int AS a, from_cycle, to_cycle
       FROM billing_subscription_events WHERE manager_id = $1 ORDER BY id`,
    [M],
  );
};
const last = async () => (await events()).at(-1);
const upd = async (set, params = []) => {
  await as(null);
  await q(`UPDATE billing_subscriptions SET ${set} WHERE manager_id = $1`, [M, ...params]);
};

// --- Nobody but the server reads it ---------------------------------------------
await as(M);
await expectError(
  "a manager can't read the history",
  () => q(`SELECT * FROM billing_subscription_events`),
  /permission denied/,
);
await expectError(
  "or price MRR directly",
  () => q(`SELECT billing_mrr(NULL, 'monthly', '[]')`),
  /permission denied/,
);

// --- A paid plan through a real payment: started ----------------------------------
const p1 = await pay("plan", "normal", "monthly");
await apply(paid(await invoiceFor(p1), 199));
let e = await last();
check(
  "Normal monthly paid: started, 0 -> 19900",
  e.kind === "started" && e.b === 0 && e.a === 19900,
  e,
);

// --- Changes --------------------------------------------------------------------
await upd(`plan_version_id = billing_current_version('premium')`);
e = await last();
check(
  "to Premium: plan_changed, 19900 -> 39900",
  e.kind === "plan_changed" && e.b === 19900 && e.a === 39900,
  e,
);
await upd(`cycle = 'annual', current_period_end = now() + interval '1 year'`);
e = await last();
check(
  "to yearly: a year over 12 (399000 / 12 = 33250)",
  e.kind === "plan_changed" && e.b === 39900 && e.a === 33250,
  e,
);
await upd(`addons = '[{"addonId": "extra_household", "quantity": 1}]'`);
e = await last();
check(
  "an extra household on yearly: + 10000 a month",
  e.kind === "plan_changed" && e.a === 43250,
  e,
);
await upd(`cancel_at_period_end = true`);
e = await last();
check(
  "cancel set: logged, MRR unchanged while it runs",
  e.kind === "cancel_set" && e.b === 43250 && e.a === 43250,
  e,
);
await upd(`cancel_at_period_end = false`);
check("cancel undone: logged", (await last()).kind === "cancel_undone");

// --- Only dates moving (test tools) isn't a change -------------------------------
const n = (await events()).length;
await upd(`current_period_end = current_period_end - interval '3 days'`);
check("only the renewal date moving logs nothing", (await events()).length === n);

// --- A renewal on the same plan: renewed ------------------------------------------
await upd(`current_period_start = now(), current_period_end = now() + interval '1 year'`);
e = await last();
check(
  "a new period on the same plan: renewed",
  e.kind === "renewed" && e.b === e.a && e.a === 43250,
  e,
);
await as(null);
const ends = (
  await q(
    `SELECT from_period_end < to_period_end AS later FROM billing_subscription_events
      WHERE manager_id = $1 ORDER BY id DESC LIMIT 1`,
    [M],
  )
)[0];
check("and it records the renewal date before and after", ends.later === true, ends);

// --- Back after it ran out: new, not a change of plan ----------------------------
await upd(
  `cancel_at_period_end = true, current_period_start = now() - interval '13 months',
   current_period_end = now() - interval '1 month'`,
);
const lapsed = await last();
check(
  "moving dates back is no renewal; the cancel is what's logged, counting 0 once it has ended",
  lapsed.kind === "cancel_set" && lapsed.a === 0,
  lapsed,
);
await upd(
  `plan_version_id = billing_current_version('normal'), cycle = 'monthly', addons = '[]',
   cancel_at_period_end = false, current_period_start = now(), current_period_end = now() + interval '1 month'`,
);
e = await last();
check(
  "buying again after it ended: started, 0 -> 19900",
  e.kind === "started" && e.b === 0 && e.a === 19900,
  e,
);

// --- A cancelled plan that ended two days ago (inside grace) counts 0 too ------
await upd(
  `cancel_at_period_end = true, current_period_start = now() - interval '32 days',
   current_period_end = now() - interval '2 days'`,
);
await upd(
  `cancel_at_period_end = false, current_period_start = now(),
   current_period_end = now() + interval '1 month'`,
);
e = await last();
check(
  "buying again two days after a cancelled plan ended: started, not a renewal",
  e.kind === "started" && e.b === 0 && e.a === 19900,
  e,
);

// --- Restricted (past grace) counts 0 too ----------------------------------------
await upd(
  `current_period_start = now() - interval '40 days', current_period_end = now() - interval '10 days'`,
);
await upd(`current_period_start = now(), current_period_end = now() + interval '1 month'`);
e = await last();
check(
  "paying after grace ran out counts as started again",
  e.kind === "started" && e.b === 0 && e.a === 19900,
  e,
);

// --- Free counts nothing --------------------------------------------------------
await as(null);
check(
  "Free is 0",
  (await one(`SELECT billing_mrr(billing_current_version('free'), 'monthly', '[]')::int AS m`))
    .m === 0,
);
check(
  "a version that can't be priced counts 0 instead of failing",
  (await one(`SELECT billing_mrr(gen_random_uuid(), 'monthly', '[]')::int AS m`)).m === 0,
);

// --- AI calls a day outlive the 48-hour purge ----------------------------------------
await as(null);
await q(`INSERT INTO ai_calls (user_id, fn) SELECT $1, 'generate-sop' FROM generate_series(1, 3)`, [
  M,
]);
await q(`INSERT INTO ai_calls (user_id, fn) VALUES ($1, 'parse-scheduler')`, [M]);
await q(`DELETE FROM ai_calls`);
const days = await q(`SELECT fn, calls FROM ai_call_days ORDER BY fn`);
check(
  "each call is counted on its day, and the count stays after ai_calls is purged",
  days.length === 2 && days[0].fn === "generate-sop" && days[0].calls === 3 && days[1].calls === 1,
  days,
);
await as(M);
await expectError(
  "a manager can't read the daily counts",
  () => q(`SELECT * FROM ai_call_days`),
  /permission denied/,
);

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
