// Runs add-billing-plan-changes.sql against a real Postgres (PGlite) as an
// attacker would: while a paid period runs a plan only goes up, an upgrade
// pays only what's left of the gap and keeps the renewal date, a downgrade or
// a move to Free waits for a cancel to run out, and a prorated payment is
// never applied to a period it wasn't priced for.
//
//   node supabase/tests/billing-plan-changes.test.mjs
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
]) {
  await db.exec(readFileSync(`${REPO}/${file}`, "utf8"));
}
// Supabase grants every new public table to authenticated by default; only RLS
// stands between a signed-in user and app_switches.
await db.exec(`GRANT ALL ON public.app_switches TO authenticated`);
console.log("migrations applied (each twice)");

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
const mine = async (uid = M) => {
  await as(uid);
  return (await one(`SELECT my_billing() AS b`)).b;
};
const setPeriodEnd = async (sql) => {
  await as(null);
  await q(`UPDATE billing_subscriptions SET current_period_end = ${sql} WHERE manager_id = $1`, [
    M,
  ]);
};

const sub = async () => (await svc(`SELECT billing_subscription_json($1) AS s`, [M])).s;
const payRow = (id) => svc(`SELECT * FROM billing_payments WHERE id = $1`, [id]);
const asM = async (fn) => {
  await as(M);
  return (await one(`SELECT ${fn}() AS r`)).r;
};
const payAndApply = async (p, pesos = p.amount / 100) => apply(paid(await invoiceFor(p), pesos));
const clearOpen = async () => {
  await as(null);
  await q(
    `UPDATE billing_payments SET status = 'cancelled' WHERE manager_id = $1 AND status = 'pending'`,
    [M],
  );
};
// Puts M on a plan with a period of the given shape, as a payment would have.
const setPlan = async (planId, cycle, startSql, endSql, status = "active") => {
  await clearOpen();
  await as(null);
  await q(
    `UPDATE billing_subscriptions
        SET plan_version_id = billing_current_version($2), cycle = $3, addons = '[]',
            status = $4, cancel_at_period_end = false,
            current_period_start = ${startSql}, current_period_end = ${endSql}
      WHERE manager_id = $1`,
    [M, planId, cycle, status],
  );
};
const near = (a, b, slack = 2) => Math.abs(Number(a) - Number(b)) <= slack;
const openCount = async () =>
  Number(
    (
      await svc(
        `SELECT count(*) AS n FROM billing_payments WHERE manager_id = $1 AND status = 'pending'`,
        [M],
      )
    ).n,
  );

// --- Who can reach the new functions --------------------------------------------
await as(M);
await expectError(
  "a manager can't price a change directly (server key only)",
  () => q(`SELECT billing_quote($1, 'premium', 'monthly', '[]')`, [M]),
  /permission denied/,
);
await db.exec("RESET ROLE; SET ROLE anon");
await expectError(
  "signed out, nobody can cancel a plan",
  () => q(`SELECT billing_cancel_plan()`),
  /permission denied/,
);
await as(C);
await expectError(
  "a co-manager can't cancel the owner's plan",
  () => q(`SELECT billing_cancel_plan()`),
  /primary manager/,
);
await expectError("nothing to cancel on Free", () => asM("billing_cancel_plan"), /no paid plan/);

// --- From Free: full price, a new period --------------------------------------
let p = await pay("plan", "normal", "monthly");
check("from Free, Normal monthly is its full price", p.amount === 19900, p.amount);
check("and isn't prorated", (await payRow(p.id)).priced_against === null);
check("paying it applies it", (await payAndApply(p)) === "applied");
check("now on Normal, monthly", (await sub()).planId === "normal");

// --- Upgrade with 20 of 30 days left: the gap for the time left, same renewal -----
await setPlan("normal", "monthly", "now() - interval '10 days'", "now() + interval '20 days'");
const end = (await sub()).periodEnd;
p = await pay("plan", "premium", "monthly");
// (39900 - 19900) x 20/30 = 13333.33, rounded up.
check(
  "Normal to Premium with 20 of 30 days left costs the gap for 20 days",
  near(p.amount, 13334),
  p.amount,
);
let row = await payRow(p.id);
check(
  "it keeps the period and remembers which one",
  row.keeps_period === true &&
    new Date(row.priced_against).toISOString() === new Date(end).toISOString(),
  row,
);
let inv = await invoiceFor(p);
// Time passes between the two clicks, so the prorated price has moved; it's
// still the same purchase.
await as(null);
await q(
  `UPDATE billing_subscriptions SET current_period_start = current_period_start - interval '5 days'
    WHERE manager_id = $1`,
  [M],
);
const again = await pay("plan", "premium", "monthly");
check(
  "asking again a moment later returns the same page, not a second one",
  again.reuse === true && again.id === p.id,
  again,
);
check("paying it applies it", (await apply(paid(inv, p.amount / 100))) === "applied");
let s = await sub();
check("now on Premium", s.planId === "premium" && s.cycle === "monthly");
check(
  "the renewal date didn't move",
  new Date(s.periodEnd).getTime() === new Date(end).getTime(),
  s.periodEnd,
);
check(
  "a replayed callback changes nothing",
  (await apply(paid(inv, p.amount / 100))) === "duplicate",
);

// --- Down is refused while the period runs ------------------------------------
await expectError(
  "Premium to Normal is refused",
  () => pay("plan", "normal", "monthly"),
  /lower plan, cancel this one\. You keep it until \w{3} \d{1,2}, \d{4}/,
);
await expectError(
  "Premium to Free is refused",
  () => pay("plan", "free", "monthly"),
  /lower plan, cancel this one/,
);
await expectError(
  "moving to Free now is refused, pointing at cancel",
  () => asM("billing_change_to_free"),
  /cancel your plan/,
);
await expectError(
  "the same plan again is refused",
  () => pay("plan", "premium", "monthly"),
  /already have/,
);
await expectError(
  "add-ons through Change plan are sent to Add-ons",
  () => pay("plan", "premium", "monthly", [{ addonId: "extra_household", quantity: 1 }]),
  /use Add-ons/,
);
check("none of those opened a payment", (await openCount()) === 0);
check("and the plan is still Premium", (await sub()).planId === "premium");

// --- A higher plan that costs no more than the add-ons: remove them first -------
await setPlan("normal", "monthly", "now() - interval '10 days'", "now() + interval '20 days'");
await as(null);
await q(
  `UPDATE billing_subscriptions SET addons = '[{"addonId": "extra_household", "quantity": 2}]'
    WHERE manager_id = $1`,
  [M],
);
// Normal with 2 extra households is PHP 399, the same as Premium.
await expectError(
  "Premium for no more than Normal plus its add-ons: remove the add-ons first",
  () => pay("plan", "premium", "monthly"),
  /Remove the add-ons you won't need first/,
);
check("that opened no payment", (await openCount()) === 0);

// --- Monthly to yearly: the year less what's unused, the year starts when paid ---
await setPlan("premium", "monthly", "now() - interval '10 days'", "now() + interval '20 days'");
p = await pay("plan", "premium", "annual");
// 399000 - floor(39900 x 20/30 = 26600) = 372400.
check(
  "Premium monthly to yearly costs the year less the unused 20 days",
  near(p.amount, 372400),
  p.amount,
);
check(
  "it starts a new period instead of keeping this one",
  (await payRow(p.id)).keeps_period === false,
);
check("paying it applies it", (await payAndApply(p)) === "applied");
s = await sub();
check(
  "now Premium yearly, renewing about a year from now",
  s.cycle === "annual" && new Date(s.periodEnd) > new Date(Date.now() + 360 * 864e5),
  s,
);
await expectError(
  "yearly to monthly is a downgrade",
  () => pay("plan", "premium", "monthly"),
  /lower plan/,
);
await expectError(
  "a cheaper plan on yearly is too",
  () => pay("plan", "normal", "annual"),
  /lower plan/,
);
await expectError("and cheaper and monthly", () => pay("plan", "normal", "monthly"), /lower plan/);

// --- A prorated payment is only applied to the period it was priced for --------
await setPlan("normal", "monthly", "now() - interval '10 days'", "now() + interval '20 days'");
p = await pay("plan", "premium", "monthly");
inv = await invoiceFor(p);
await as(null);
await q(
  `UPDATE billing_subscriptions SET current_period_end = current_period_end + interval '1 month'
    WHERE manager_id = $1`,
  [M],
);
check(
  "paid after the period renewed: kept for review, not applied",
  (await apply(paid(inv, p.amount / 100))) === "review",
);
check("the plan stayed Normal", (await sub()).planId === "normal");
check("and the payment says why", /period changed/.test((await payRow(p.id)).failure_reason));

await setPlan("normal", "monthly", "now() - interval '10 days'", "now() + interval '20 days'");
p = await pay("plan", "premium", "monthly");
inv = await invoiceFor(p);
await setPeriodEnd("now() - interval '1 day'");
check(
  "paid after the period ran out: kept for review",
  (await apply(paid(inv, p.amount / 100))) === "review",
);
check("the plan stayed Normal", (await sub()).planId === "normal");

await setPlan("normal", "monthly", "now() - interval '10 days'", "now() + interval '20 days'");
p = await pay("plan", "premium", "monthly");
check(
  "an upgrade paid short is kept for review",
  (await payAndApply(p, p.amount / 100 - 1)) === "review",
);
check("the plan stayed Normal", (await sub()).planId === "normal");

// --- Cancel and keep ----------------------------------------------------------
await setPlan("normal", "monthly", "now() - interval '10 days'", "now() + interval '20 days'");
s = await asM("billing_cancel_plan");
check(
  "cancelling sets it to end at the renewal date, nothing else",
  s.cancelAtPeriodEnd === true && s.planId === "normal" && s.status === "active",
  s,
);
await expectError(
  "cancelling twice says when it ends",
  () => asM("billing_cancel_plan"),
  /already ends on/,
);
s = await asM("billing_resume_plan");
check("keeping it undoes the cancel", s.cancelAtPeriodEnd === false && s.planId === "normal");
await expectError(
  "keeping one that isn't ending is refused",
  () => asM("billing_resume_plan"),
  /isn't set to end/,
);

await asM("billing_cancel_plan");
p = await pay("plan", "premium", "monthly");
check("cancelled, an upgrade is still allowed", p.amount > 0);
check("paying it applies it", (await payAndApply(p)) === "applied");
s = await sub();
check(
  "and paying for more clears the cancel",
  s.planId === "premium" && s.cancelAtPeriodEnd === false,
  s,
);

await asM("billing_cancel_plan");
await setPeriodEnd("now() - interval '1 minute'");
check("once a cancelled period runs out it's Free", (await sub()).planId === "free");
await expectError(
  "and there's nothing left to keep",
  () => asM("billing_resume_plan"),
  /isn't set to end/,
);
p = await pay("plan", "normal", "monthly");
check(
  "from there a lower plan is a fresh full-price purchase",
  p.amount === 19900 && (await payRow(p.id)).priced_against === null,
  p,
);
await clearOpen();

// --- Past due: nothing is running, so any plan, and Free is allowed -------------
await setPlan("premium", "monthly", "now() - interval '32 days'", "now() - interval '2 days'");
check("two days past the renewal it's past due", (await sub()).status === "past_due");
p = await pay("plan", "normal", "monthly");
check("past due, a lower plan is allowed at full price", p.amount === 19900, p.amount);
await clearOpen();
s = await asM("billing_change_to_free");
check("past due, moving to Free now is allowed", s.planId === "free");

// --- A trial isn't a paid period ------------------------------------------------
await setPlan(
  "premium",
  "monthly",
  "now() - interval '2 days'",
  "now() + interval '12 days'",
  "trialing",
);
s = await asM("billing_change_to_free");
check("in a trial, moving to Free now is allowed (nothing was paid)", s.planId === "free");

// --- The last hour of a period: never less than Xendit's card minimum -----------
await setPlan(
  "normal",
  "monthly",
  "now() - interval '30 days' + interval '1 hour'",
  "now() + interval '1 hour'",
);
p = await pay("plan", "premium", "monthly");
check("an upgrade in the last hour costs the PHP 20 minimum", p.amount === 2000, p.amount);
await clearOpen();

// --- The subscription json carries the period start for the web's math ---------
await setPlan("normal", "monthly", "now() - interval '10 days'", "now() + interval '20 days'");
check("my_billing shows when the period started", (await mine()).subscription.periodStart !== null);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
