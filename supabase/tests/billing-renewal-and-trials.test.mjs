// Runs add-billing-renewal-and-trials.sql against a real Postgres (PGlite) as
// an attacker would: a late payment must not start a fresh period (grace
// would be free), and a trial must be given once, from Free, to someone who
// has never paid, never on top of what's owed, and must end in Free, not grace.
//
//   node supabase/tests/billing-renewal-and-trials.test.mjs
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
// Through the server key (the billing_* functions are internal).
const srv = async (sql, params) => {
  await as(null);
  return one(sql, params);
};
const svc = async (sql, params) => {
  await as(null);
  return q(sql, params);
};
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
  "add-billing-idempotency.sql",
  "add-teams-and-labels.sql",
  "add-teams-plan-guard.sql",
  "add-billing-plan-changes.sql",
  "add-billing-pause.sql",
  "add-billing-renewal-and-trials.sql",
  "add-billing-renewal-and-trials.sql",
]) {
  await db.exec(readFileSync(`${REPO}/${file}`, "utf8"));
}
await db.exec(`GRANT ALL ON public.app_switches TO authenticated`);
console.log("migrations applied (add-billing-renewal-and-trials.sql twice)");

const M = "00000000-0000-0000-0000-00000000000a"; // primary of H
const C = "00000000-0000-0000-0000-00000000000c"; // co-manager of H, owns nothing
const P = "00000000-0000-0000-0000-00000000000e"; // primary of H2, has paid before
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";

const sub = async (who = M) => (await srv(`SELECT billing_subscription_json($1) AS s`, [who])).s;
const endOf = async (who = M) =>
  (
    await srv(`SELECT current_period_end AS e FROM billing_subscriptions WHERE manager_id = $1`, [
      who,
    ])
  ).e;
// M's subscription, ending (or having ended) at endSql.
const setSub = async (
  planId,
  endSql,
  { cycle = "monthly", status = "active", cancel = false } = {},
) => {
  await svc(`DELETE FROM billing_payments WHERE manager_id = $1 AND status = 'pending'`, [M]);
  await svc(
    `INSERT INTO billing_subscriptions (manager_id, plan_version_id, cycle, status,
                                        current_period_start, current_period_end, cancel_at_period_end)
     VALUES ($1, billing_current_version($2), $3, $4, ${endSql} - interval '1 month', ${endSql}, $5)
     ON CONFLICT (manager_id) DO UPDATE SET plan_version_id = EXCLUDED.plan_version_id,
       cycle = EXCLUDED.cycle, addons = '[]', status = EXCLUDED.status,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end`,
    [M, planId, cycle, status, cancel],
  );
};
let invoiceN = 0;
/** Pays for a plan as Xendit would: opens the payment, pays it in full, applies it. */
const payPlan = async (planId, cycle, who = M) => {
  const p = (
    await srv(`SELECT billing_create_payment($1, 'plan', $2, $3, '[]'::jsonb) AS p`, [
      who,
      planId,
      cycle,
    ])
  ).p;
  const id = `inv_${++invoiceN}`;
  await svc(`SELECT billing_attach_invoice($1, $2, 'https://x', now() + interval '1 day')`, [
    p.id,
    id,
  ]);
  const pesos = p.amount / 100;
  const o = (
    await srv(`SELECT billing_apply_invoice($1::jsonb) AS o`, [
      JSON.stringify({ id, status: "PAID", amount: pesos, paid_amount: pesos, currency: "PHP" }),
    ])
  ).o;
  return { payment: p, outcome: o };
};
const at = (v) => new Date(v).getTime();
const near = (a, b, ms = 5_000) => Math.abs(at(a) - at(b)) <= ms;
/** Postgres's own month arithmetic, so the test doesn't reimplement it. */
const plus = async (iso, months) =>
  (await srv(`SELECT ($1::timestamptz + make_interval(months => $2)) AS t`, [iso, months])).t;
const startTrial = async (planId, who = M) => {
  await as(who);
  return (await one(`SELECT billing_start_trial($1) AS s`, [planId])).s;
};
const trialAvailable = async (who = M) => {
  await as(who);
  return (await one(`SELECT my_billing() AS b`)).b.trialAvailable;
};

await svc(`INSERT INTO auth.users VALUES ('${M}'), ('${C}'), ('${P}')`);
await svc(
  `INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household')`,
);
await svc(`INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now()),
  ('${C}', '${H}', 'Ana Lim', 'co_manager', now()), ('${P}', '${H2}', 'Joy Cruz', 'primary_manager', now())`);
await svc(`INSERT INTO household_managers (household_id, user_id, role) VALUES
  ('${H}', '${M}', 'primary_manager'), ('${H2}', '${P}', 'primary_manager')`);
// C co-manages H (Premium has the room while this is set up).
await setSub("premium", "now() + interval '20 days'");
await svc(
  `INSERT INTO household_managers (household_id, user_id, role) VALUES ('${H}', '${C}', 'co_manager')`,
);

// --- Trials ------------------------------------------------------------------------
await svc(`DELETE FROM billing_subscriptions WHERE manager_id = $1`, [M]);
check("on Free, never paid: a trial is available", (await trialAvailable()) === true);
await expectError(
  "Free itself has no trial",
  () => startTrial("free"),
  /doesn't have a free trial/,
);
await expectError("an unknown plan has no trial", () => startTrial("gold"), /isn't offered/);
await expectError(
  "a co-manager can't start one",
  () => startTrial("premium", C),
  /primary manager/,
);

const trial = await startTrial("premium");
check("trial: Premium, trialing", trial.planId === "premium" && trial.status === "trialing", trial);
const days14 = (await srv(`SELECT now() + interval '14 days' AS t`)).t;
check("trial: ends after the plan's 14 days", near(trial.periodEnd, days14), trial.periodEnd);
check(
  "trial: the household has the plan's features",
  (await srv(`SELECT billing_household_has($1, 'pantry') AS p`, [H])).p === true,
);
check(
  "trial: and its limits",
  (await srv(`SELECT billing_limits(billing_subscription_json($1)) -> 'households' AS h`, [M]))
    .h === 3,
);
check(
  "trial: nothing was charged",
  Number((await srv(`SELECT count(*) AS n FROM billing_payments WHERE manager_id = $1`, [M])).n) ===
    0,
);
check("trial: not offered again", (await trialAvailable()) === false);
await expectError(
  "a second trial on the same plan",
  () => startTrial("premium"),
  /already had a free trial|starts from Free/,
);
await expectError(
  "nor on another plan",
  () => startTrial("normal"),
  /already had a free trial|starts from Free/,
);
await as(C);
check(
  "trial: the co-manager's household follows it",
  (await one(`SELECT my_household_plan() AS h`)).h.features.pantry === true,
);
await expectError(
  "a manager can't work out their own period",
  () => q(`SELECT billing_next_period($1, 1)`, [M]),
  /permission denied/,
);

// Paying during the trial keeps its days: the paid month starts when the trial ends.
const trialEnd = await endOf();
const kept = await payPlan("premium", "monthly");
check("paying the trial's own plan is allowed", kept.outcome === "applied", kept);
check("paid during the trial: active", (await sub()).status === "active");
check(
  "paid during the trial: a month after the trial ends, no trial day lost",
  near(await endOf(), await plus(trialEnd, 1)),
  { end: await endOf(), trialEnd },
);

// A trial that ends unpaid is Free at once, with no grace.
await svc(`DELETE FROM billing_payments WHERE manager_id = $1`, [M]);
await setSub("premium", "now() - interval '1 day'", { status: "trialing" });
const lapsedTrial = await sub();
check(
  "a trial that ran out: Free, active, not past due",
  lapsedTrial.planId === "free" && lapsedTrial.status === "active",
  lapsedTrial,
);
check(
  "a trial that ran out: Pantry is off at once",
  (await srv(`SELECT billing_household_has($1, 'pantry') AS p`, [H])).p === false,
);
check("a trial that ran out: no second trial", (await trialAvailable()) === false);

// Someone who has paid before doesn't get a first-plan trial.
await svc(
  `INSERT INTO billing_payments (manager_id, kind, plan_version_id, cycle, amount, status)
   VALUES ($1, 'plan', billing_current_version('normal'), 'monthly', 19900, 'paid')`,
  [P],
);
check("paid before: no trial offered", (await trialAvailable(P)) === false);
await expectError("paid before: a trial is refused", () => startTrial("normal", P), /first plan/);

// Owing money isn't Free: pay first.
await svc(`DELETE FROM billing_trials`);
await setSub("normal", "now() - interval '2 days'");
check("past due: no trial offered", (await trialAvailable()) === false);
await expectError(
  "past due: a trial can't wipe what's owed",
  () => startTrial("premium"),
  /starts from Free/,
);
await setSub("normal", "now() + interval '10 days'");
await expectError(
  "in a paid period: no trial on top",
  () => startTrial("premium"),
  /starts from Free/,
);

// Moving to Free ends a trial early, and it doesn't come back.
await svc(`DELETE FROM billing_subscriptions WHERE manager_id = $1`, [M]);
await startTrial("normal");
await as(M);
await one(`SELECT billing_change_to_free() AS s`);
check("moved to Free during a trial: on Free", (await sub()).planId === "free");
await expectError(
  "and the trial can't be started again",
  () => startTrial("normal"),
  /already had a free trial/,
);
await svc(`DELETE FROM billing_trials`);

// A plan the console set to no trial.
await svc(`INSERT INTO billing_plans (id, status, display_order) VALUES ('basic', 'published', 4)`);
await svc(`INSERT INTO billing_plan_versions (plan_id, version, name, price_monthly, trial_days, features, limits, published_at)
  SELECT 'basic', 1, 'Basic', 9900, 0, features, limits, now() FROM billing_plan_versions
   WHERE id = billing_current_version('normal')`);
await expectError(
  "a plan with 0 trial days has no trial",
  () => startTrial("basic"),
  /doesn't have a free trial/,
);

// --- A late payment keeps the renewal date ----------------------------------------
await setSub("premium", "now() - interval '3 days'");
check("3 days late: past due", (await sub()).status === "past_due");
let oldEnd = await endOf();
const late = await payPlan("premium", "monthly");
check("past due, paid: applied", late.outcome === "applied", late);
check(
  "past due, paid: the month runs from the old renewal date, not today",
  near((await sub()).periodStart, oldEnd) && near(await endOf(), await plus(oldEnd, 1)),
  { start: (await sub()).periodStart, end: await endOf(), oldEnd },
);

await setSub("premium", "now() - interval '20 days'");
check("20 days late: restricted", (await sub()).status === "restricted");
oldEnd = await endOf();
await payPlan("premium", "monthly");
check(
  "restricted, paid: still from the old renewal date",
  near(await endOf(), await plus(oldEnd, 1)),
  { end: await endOf(), oldEnd },
);
check("restricted, paid: active again", (await sub()).status === "active");

await setSub("premium", "now() - interval '100 days'");
oldEnd = await endOf();
await payPlan("premium", "monthly");
const after100 = await sub();
check(
  "100 days late: the new period covers today",
  at(after100.periodStart) <= Date.now() + 5_000 && at(after100.periodEnd) > Date.now(),
  after100,
);
check(
  "100 days late: three whole months on from the renewal date, the same day",
  near(after100.periodStart, await plus(oldEnd, 3)) &&
    near(after100.periodEnd, await plus(oldEnd, 4)),
  { after100, oldEnd },
);
check(
  "100 days late: one month is charged",
  (
    await srv(
      `SELECT amount FROM billing_payments WHERE manager_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [M],
    )
  ).amount === 39900,
);

await setSub("normal", "now() - interval '5 days'");
oldEnd = await endOf();
await payPlan("normal", "annual");
check(
  "late on monthly, paying yearly: the year runs from the old renewal date",
  near(await endOf(), await plus(oldEnd, 12)),
);

await setSub("normal", "now() - interval '5 days'");
oldEnd = await endOf();
await payPlan("premium", "monthly");
check(
  "late, paying a different plan: from the old renewal date too (no way around it)",
  near(await endOf(), await plus(oldEnd, 1)),
);

// Not late: from today, as before.
await svc(`DELETE FROM billing_subscriptions WHERE manager_id = $1`, [M]);
await payPlan("normal", "monthly");
check("from Free: from today", near((await sub()).periodStart, new Date(), 10_000));
await setSub("premium", "now() - interval '3 days'", { cancel: true });
check("a cancelled plan that ran out is Free", (await sub()).planId === "free");
await payPlan("normal", "monthly");
check(
  "after a cancelled plan ran out: from today, not the old date",
  near((await sub()).periodStart, new Date(), 10_000),
);

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
