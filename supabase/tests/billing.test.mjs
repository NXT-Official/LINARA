// Runs add-billing.sql against a real Postgres (PGlite) as an attacker would:
// nobody but the server key starts or settles a payment, the amount comes from
// the catalog, a replayed or short Xendit callback changes nothing, and the
// plan's features and limits hold in the database for every caller.
//
//   node supabase/tests/billing.test.mjs
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
const mine = async (uid = M) => {
  await as(uid);
  return (await one(`SELECT my_billing() AS b`)).b;
};
const addHelper = async (household, name, userId = null) => {
  await as(null);
  return q(
    `INSERT INTO helper_profiles (user_id, household_id, name, station, monthly_rate, payday_interval, status, started_on)
     VALUES ($1, $2, $3, 'Kitchen', 8000, 'monthly', 'PENDING_CLAIM', '2026-10-01') RETURNING id`,
    [userId, household, name],
  );
};
const setPeriodEnd = async (sql) => {
  await as(null);
  await q(`UPDATE billing_subscriptions SET current_period_end = ${sql} WHERE manager_id = $1`, [
    M,
  ]);
};

// --- Nobody can reach the tables or the server-key functions ------------------
await as(M);
for (const t of [
  "billing_plans",
  "billing_plan_versions",
  "billing_subscriptions",
  "billing_payments",
  "billing_events",
]) {
  await expectError(
    `a signed-in manager can't read ${t}`,
    () => q(`SELECT * FROM ${t}`),
    /permission denied/,
  );
}
await expectError(
  "or write a subscription for themselves",
  () =>
    q(
      `INSERT INTO billing_subscriptions (manager_id, plan_version_id, cycle)
       SELECT $1, id, 'monthly' FROM billing_plan_versions LIMIT 1`,
      [M],
    ),
  /permission denied/,
);
await expectError(
  "or start a payment with their own amount",
  () => q(`SELECT billing_create_payment($1, 'plan', 'premium', 'monthly', '[]')`, [M]),
  /permission denied/,
);
await expectError(
  "or mark an invoice paid",
  () => q(`SELECT billing_apply_invoice('{"id": "inv_x", "status": "PAID", "paid_amount": 1}')`),
  /permission denied/,
);
await expectError(
  "or read the plan math directly",
  () => q(`SELECT billing_usage($1)`, [M]),
  /permission denied/,
);
await db.exec("RESET ROLE; SET ROLE anon");
check(
  "signed out, the catalog is readable (landing page)",
  (await one(`SELECT jsonb_array_length(billing_catalog() -> 'plans') AS n`)).n === 3,
);
await expectError("but not anyone's billing", () => q(`SELECT my_billing()`), /permission denied/);

await db.exec("RESET ROLE; SET ROLE service_role");
check(
  "the server key (the Edge Functions) can start a payment",
  (
    await one(
      `SELECT billing_create_payment($1, 'plan', 'normal', 'monthly', '[]') ->> 'amount' AS a`,
      [M],
    )
  ).a === "19900",
);
await db.exec("RESET ROLE");
await q(`DELETE FROM billing_payments`);

// --- Starts on Free -------------------------------------------------------------
let b = await mine();
check(
  "no subscription is Free",
  b.subscription.planId === "free" && b.subscription.status === "active",
  b.subscription,
);
check(
  "Free's limits and usage",
  JSON.stringify(b.limits) === JSON.stringify({ households: 1, kasambahay: 1, co_managers: 0 }) &&
    b.usage.kasambahay === 1 &&
    b.usage.households === 1,
  { limits: b.limits, usage: b.usage },
);
check(
  "the catalog's placeholder prices are marked so",
  b.catalog.plans.map((p) => `${p.id}:${p.pricePlaceholder}`).join() ===
    "free:false,normal:true,premium:true",
);
check(
  "a kasambahay's rights are on every plan",
  b.catalog.plans.every(
    (p) => p.features.time_off && p.features.after_hours && p.features.work_record,
  ),
);
await expectError("a helper has no plan to manage", () => mine(U), /primary manager/);

await expectError(
  "Free: a second kasambahay doesn't fit",
  () => addHelper(H, "Second"),
  /The Free plan allows 1 kasambahay, and you have 1\./,
);
await as(M);
await expectError(
  "Free: no co-manager invite",
  () => q(`SELECT * FROM create_manager_invite('co_manager')`),
  /The Free plan doesn't include co-managers\./,
);
await expectError(
  "Free: no remote admin",
  () => q(`SELECT * FROM create_manager_invite('remote_admin')`),
  /Remote admin isn't on/,
);
await expectError(
  "Free: no new pantry item, even with the server key",
  () => svc(`INSERT INTO pantry_items (household_id, name) VALUES ($1, 'Bigas')`, [H]),
  /Pantry and groceries isn't on/,
);
await as(M);
await expectError(
  "Free: a second household doesn't fit",
  () => q(`SELECT * FROM create_household('Beach house')`),
  /allows 1 household, and you have 1/,
);

// --- What can't be bought --------------------------------------------------------
await expectError(
  "Free costs nothing to pay for",
  () => pay("plan", "free", "monthly"),
  /Nothing to pay/,
);
await expectError("an unknown plan", () => pay("plan", "gold", "monthly"), /isn't offered/);
await expectError(
  "a cycle that isn't sold",
  () => pay("plan", "normal", "one_time"),
  /isn't sold that way/,
);
await expectError("a made-up cycle", () => pay("plan", "normal", "weekly"), /monthly or yearly/);
await expectError(
  "11 of an add-on",
  () => pay("plan", "normal", "monthly", [{ addonId: "extra_kasambahay", quantity: 11 }]),
  /0 to 10/,
);
await expectError(
  "a negative add-on",
  () => pay("plan", "normal", "monthly", [{ addonId: "extra_kasambahay", quantity: -1 }]),
  /0 to 10/,
);
await expectError(
  "a fractional add-on",
  () => pay("plan", "normal", "monthly", [{ addonId: "extra_kasambahay", quantity: 1.5 }]),
  /0 to 10/,
);
await expectError(
  "a quantity as a string",
  () => pay("plan", "normal", "monthly", [{ addonId: "extra_kasambahay", quantity: "1" }]),
  /0 to 10/,
);
await expectError(
  "the same add-on twice",
  () =>
    pay("plan", "normal", "monthly", [
      { addonId: "extra_kasambahay", quantity: 1 },
      { addonId: "extra_kasambahay", quantity: 1 },
    ]),
  /twice/,
);
await expectError(
  "an unknown add-on",
  () => pay("plan", "normal", "monthly", [{ addonId: "free_money", quantity: 1 }]),
  /isn't offered/,
);
await expectError(
  "add-ons on Free",
  () => pay("addons", null, null, [{ addonId: "extra_kasambahay", quantity: 1 }]),
  /paid monthly or yearly/,
);
await expectError(
  "a helper account can't start a payment",
  () => svc(`SELECT billing_create_payment($1, 'plan', 'normal', 'monthly', '[]')`, [U]),
  /primary manager/,
);
await as(null);
await q(`UPDATE billing_plans SET status = 'hidden' WHERE id = 'premium'`);
await expectError(
  "a hidden plan can't be bought",
  () => pay("plan", "premium", "monthly"),
  /isn't offered/,
);
await q(`UPDATE billing_plans SET status = 'published' WHERE id = 'premium'`);

// --- Paying for Normal -----------------------------------------------------------
const p1 = await pay("plan", "normal", "monthly", [{ addonId: "extra_kasambahay", quantity: 0 }]);
check("Normal monthly is ₱199, worked out here", p1.amount === 19900, p1);
const inv1 = await invoiceFor(p1);
await expectError(
  "an invoice can't be attached twice",
  () => svc(`SELECT billing_attach_invoice($1, 'inv_other', 'https://x', now())`, [p1.id]),
  /can't take an invoice/,
);
check("a pending payment changes nothing yet", (await mine()).subscription.planId === "free");
check(
  "an unknown invoice is logged, not applied",
  (await apply(paid("inv_nope", 199))) === "unknown",
);
check("a short payment goes to review", (await apply(paid(inv1, 1))) === "review");
check("and the plan doesn't change", (await mine()).subscription.planId === "free");
check("the same short payment again is a duplicate", (await apply(paid(inv1, 1))) === "duplicate");

const p2 = await pay("plan", "normal", "monthly");
const inv2 = await invoiceFor(p2);
check("in dollars: refused", (await apply(paid(inv2, 199, { currency: "USD" }))) === "review");
const p3 = await pay("plan", "normal", "monthly");
const inv3 = await invoiceFor(p3);
check(
  "a pending invoice that isn't paid yet is ignored",
  (await apply({ id: inv3, status: "PENDING", amount: 199 })) === "ignored",
);
check("paid in full: applied", (await apply(paid(inv3, 199))) === "applied");
b = await mine();
check(
  "now on Normal, monthly, active, renewing in a month",
  b.subscription.planId === "normal" &&
    b.subscription.status === "active" &&
    Math.round((Date.parse(b.subscription.periodEnd) - Date.now()) / 86400000) >= 28,
  b.subscription,
);
check("the callback again changes nothing", (await apply(paid(inv3, 199))) === "duplicate");
check(
  "SETTLED after PAID is the same payment",
  (await apply({ ...paid(inv3, 199), status: "SETTLED" })) === "duplicate",
);
check(
  "an EXPIRED after it's paid doesn't undo it",
  (await apply({ id: inv3, status: "EXPIRED" })) === "ignored",
);
b = await mine();
check(
  "still Normal, payment still paid",
  b.subscription.planId === "normal" && b.payments.find((p) => p.id === p3.id).status === "paid",
);
check(
  "one event logged per invoice and status (pending, paid, expired)",
  (
    await svc(`SELECT count(*)::int AS n FROM billing_events WHERE event_key LIKE $1`, [
      `invoice:${inv3}:%`,
    ])
  ).n === 3,
);
check(
  "the first callback's outcome stays on record, not overwritten by the replay",
  (await svc(`SELECT outcome FROM billing_events WHERE event_key = $1`, [`invoice:${inv3}:PAID`]))
    .outcome === "applied",
);
await as(null);
await q(`DELETE FROM billing_events WHERE event_key = $1`, [`invoice:${inv3}:PAID`]);
const periodBefore = (await mine()).subscription.periodEnd;
check(
  "with its log row gone, a replay still doesn't apply twice",
  (await apply(paid(inv3, 199))) === "duplicate",
);
check("and the renewal date doesn't move", (await mine()).subscription.periodEnd === periodBefore);
await expectError(
  "paying for the plan you have",
  () => pay("plan", "normal", "monthly"),
  /already have/,
);

// Expired, then paid late: Xendit can still take it.
const p4 = await pay("plan", "normal", "annual");
const inv4 = await invoiceFor(p4);
check("yearly Normal is ₱1,990", p4.amount === 199000);
check("an unpaid page expires", (await apply({ id: inv4, status: "EXPIRED" })) === "expired");
check(
  "the payment shows as expired",
  (await mine()).payments.find((p) => p.id === p4.id).status === "expired",
);
check("paid after it expired: still applied", (await apply(paid(inv4, 1990))) === "applied");
check("now yearly", (await mine()).subscription.cycle === "annual");

// --- Limits on Normal: 3 kasambahay, 1 co-manager, no remote admin -----------------
await addHelper(H, "Second");
await addHelper(H, "Third");
await expectError(
  "Normal: a 4th kasambahay doesn't fit",
  () => addHelper(H, "Fourth"),
  /The Normal plan allows 3 kasambahay, and you have 3\./,
);
check(
  "Pantry is on: a pantry item can be added",
  (
    await svc(
      `INSERT INTO pantry_items (household_id, name) VALUES ($1, 'Bigas') RETURNING 1 AS x`,
      [H],
    )
  ).x === 1,
);
await as(M);
const invite = await one(`SELECT * FROM create_manager_invite('co_manager')`);
await expectError(
  "Normal: a second co-manager invite doesn't fit",
  () => q(`SELECT * FROM create_manager_invite('co_manager')`),
  /allows 1 co-manager, and you have 1\./,
);
await expectError(
  "Normal: still no remote admin",
  () => q(`SELECT * FROM create_manager_invite('remote_admin')`),
  /Remote admin isn't on/,
);
await as(C);
const claimed = await q(`SELECT * FROM claim_manager_invite($1)`, [invite.code]);
check("claiming the invite at the last place works (it's the same place)", claimed.length === 1);
b = await mine();
check("one co-manager in use", b.usage.co_managers === 1, b.usage);
await as(C);
let hp = await one(`SELECT my_household_plan() AS p`);
check(
  "the co-manager gets the owner's plan",
  hp.p.planId === "normal" && hp.p.features.pantry === true,
  hp.p,
);
await as(U);
hp = await one(`SELECT my_household_plan() AS p`);
check(
  "the helper reads the household's plan, with no prices",
  hp.p.planId === "normal" &&
    hp.p.features.pantry === true &&
    hp.p.features.staff_pay_hr === false &&
    !JSON.stringify(hp.p).includes("price"),
  hp.p,
);

// --- Add-ons ---------------------------------------------------------------------
await expectError(
  "add-ons with nothing changed",
  () => pay("addons", null, null, []),
  /Nothing changed/,
);
const a1 = await pay("addons", null, null, [{ addonId: "extra_kasambahay", quantity: 1 }]);
check("one more kasambahay on a yearly plan is twelve months of ₱50", a1.amount === 60000, a1);
const ainv = await invoiceFor(a1);
check("paid", (await apply(paid(ainv, 600))) === "applied");
b = await mine();
check(
  "the limit goes to 4, the plan and its renewal stay",
  b.limits.kasambahay === 4 &&
    b.subscription.planId === "normal" &&
    b.subscription.cycle === "annual",
);
check("a 4th kasambahay fits now", (await addHelper(H, "Fourth")).length === 1);
await expectError(
  "but not a 5th",
  () => addHelper(H, "Fifth"),
  /allows 4 kasambahay, and you have 4/,
);
await as(M);
await expectError(
  "removing can't add",
  () => q(`SELECT billing_remove_addons('[{"addonId": "extra_kasambahay", "quantity": 2}]')`),
  /pay for them first/,
);
await expectError(
  "removing nothing",
  () => q(`SELECT billing_remove_addons('[{"addonId": "extra_kasambahay", "quantity": 1}]')`),
  /Nothing changed/,
);

// Add-ons paid after the plan changed: kept for review, not stacked on the wrong plan.
const a2 = await pay("addons", null, null, [{ addonId: "extra_kasambahay", quantity: 2 }]);
const a2inv = await invoiceFor(a2);
const replace = await pay("plan", "premium", "monthly");
check(
  "a different purchase while add-ons are open: close that page first",
  replace.supersede?.id === a2.id && replace.supersede?.invoiceId === a2inv && !replace.id,
  replace,
);
await svc(`SELECT billing_cancel_payment($1)`, [a2.id]);
const p5 = await pay("plan", "premium", "monthly");
check("Premium monthly ₱399", (await apply(paid(await invoiceFor(p5), 399))) === "applied");
check("the old add-on payment goes to review", (await apply(paid(a2inv, 600))) === "review");
b = await mine();
check(
  "Premium, with the add-ons Premium was bought with (none)",
  b.subscription.planId === "premium" && b.subscription.addons.length === 0,
  b.subscription,
);

// --- Premium: households, remote admin, the same person in two households ----------
await as(M);
check(
  "Premium: remote admin invite",
  (await q(`SELECT * FROM create_manager_invite('remote_admin')`)).length === 1,
);
const second = await one(`SELECT * FROM create_household('Beach house')`);
check("Premium: a second household", !!second.household_id);
await as(null);
const H3 = (
  await one(
    `SELECT household_id FROM household_managers WHERE user_id = $1 AND household_id <> $2`,
    [M, H],
  )
).household_id;
await addHelper(H3, "Marites again", U);
b = await mine();
check("the same kasambahay in two households counts once", b.usage.kasambahay === 4, b.usage);

// --- Over the limits after moving to Free -------------------------------------------
await as(M);
await q(`SELECT billing_change_to_free()`);
await expectError("Free twice", () => q(`SELECT billing_change_to_free()`), /already have/);
b = await mine();
check(
  "on Free now; nothing removed",
  b.subscription.planId === "free" && b.usage.kasambahay === 4 && b.usage.households === 2,
);
await expectError(
  "a selection with someone else's household",
  () => q(`SELECT billing_save_selection($1, '{}')`, [[H2]]),
  /isn't there/,
);
await expectError(
  "a selection with two households on Free",
  () => q(`SELECT billing_save_selection($1, '{}')`, [[H, H3]]),
  /up to 1 households/,
);
await expectError(
  "a selection with nothing",
  () => q(`SELECT billing_save_selection('{}', '{}')`),
  /at least one/,
);
await expectError(
  "a household picked twice",
  () => q(`SELECT billing_save_selection($1, '{}')`, [[H, H]]),
  /twice/,
);
await q(`SELECT billing_save_selection($1, $2)`, [[H], [HP]]);
check(
  "a valid selection is saved",
  JSON.stringify((await mine()).selection) ===
    JSON.stringify({ households: [H], kasambahay: [HP] }),
);

// --- Grace and restricted -------------------------------------------------------------
const p6 = await pay("plan", "normal", "monthly");
await apply(paid(await invoiceFor(p6), 199));
await setPeriodEnd(`now() - interval '2 days'`);
b = await mine();
check(
  "two days past the renewal: past_due (grace)",
  b.subscription.status === "past_due",
  b.subscription.status,
);
await expectError(
  "no add-ons while owed",
  () => pay("addons", null, null, [{ addonId: "extra_kasambahay", quantity: 1 }]),
  /Pay what's owed/,
);
await setPeriodEnd(`now() - interval '8 days'`);
check("past the 7 days: restricted", (await mine()).subscription.status === "restricted");
await expectError("restricted: nothing new added", () => addHelper(H, "Sixth"), /overdue/);
const p7 = await pay("plan", "normal", "monthly");
check("paying what's owed on the same plan is allowed", p7.amount === 19900);
await apply(paid(await invoiceFor(p7), 199));
check("paid: active again", (await mine()).subscription.status === "active");

// Cancelled at period end: Free once the period is over.
await as(null);
await q(
  `UPDATE billing_subscriptions SET cancel_at_period_end = true, current_period_end = now() - interval '1 minute' WHERE manager_id = $1`,
  [M],
);
check("a cancelled plan is Free after its period", (await mine()).subscription.planId === "free");

// --- One open payment, and never paid twice -------------------------------------------
const q1 = await pay("plan", "premium", "monthly");
const q1inv = await invoiceFor(q1);
const again = await pay("plan", "premium", "monthly");
check(
  "the same purchase again: the page that's open, not a new one",
  again.reuse === true && again.id === q1.id && /xendit/.test(again.invoiceUrl),
  again,
);
check(
  "a double tap leaves one open payment",
  (
    await svc(
      `SELECT count(*)::int AS n FROM billing_payments WHERE manager_id = $1 AND status = 'pending'`,
      [M],
    )
  ).n === 1,
);
await expectError(
  "a second open payment can't be written in at all",
  () =>
    svc(
      `INSERT INTO billing_payments (manager_id, kind, plan_version_id, cycle, amount)
         SELECT $1, 'plan', plan_version_id, 'monthly', 1 FROM billing_payments WHERE id = $2`,
      [M, q1.id],
    ),
  /billing_payments_one_open|duplicate key/,
);
const swap = await pay("plan", "normal", "monthly");
check(
  "a different purchase: close the open page first",
  swap.supersede?.id === q1.id && swap.supersede?.invoiceId === q1inv,
);
check(
  "closing it once works",
  (await svc(`SELECT billing_cancel_payment($1) AS ok`, [q1.id])).ok === true,
);
check(
  "closing it again changes nothing",
  (await svc(`SELECT billing_cancel_payment($1) AS ok`, [q1.id])).ok === false,
);
const q2 = await pay("plan", "normal", "monthly");
const q2inv = await invoiceFor(q2);
check(
  "the replaced page, paid anyway: kept for a refund, not applied",
  (await apply(paid(q1inv, 399))) === "review",
);
b = await mine();
check("so the plan isn't Premium", b.subscription.planId !== "premium", b.subscription.planId);
check(
  "and it says why",
  /Refund it in Xendit/.test(b.payments.find((p) => p.id === q1.id).failureReason),
);
check("its callback again: a duplicate", (await apply(paid(q1inv, 399))) === "duplicate");
check("the newer page pays as normal", (await apply(paid(q2inv, 199))) === "applied");
check("on Normal", (await mine()).subscription.planId === "normal");

// A page that never got made: refused for a moment, then given up on.
const q3 = await pay("plan", "premium", "annual");
await expectError(
  "while a page is being opened",
  () => pay("plan", "premium", "annual"),
  /being opened/,
);
await as(null);
await q(`UPDATE billing_payments SET created_at = now() - interval '3 minutes' WHERE id = $1`, [
  q3.id,
]);
const q3b = await pay("plan", "premium", "annual");
check("after two minutes it's given up on and a new one starts", !!q3b.id && q3b.id !== q3.id);
check(
  "the stuck one is marked failed",
  (await svc(`SELECT status FROM billing_payments WHERE id = $1`, [q3.id])).status === "failed",
);
const q3inv = await invoiceFor(q3b);
check(
  "Xendit says the page expired",
  (await apply({ id: q3inv, status: "EXPIRED" })) === "expired",
);
const q4 = await pay("plan", "premium", "annual");
check("the same purchase after it expired: a new page", !!q4.id && !q4.reuse && q4.id !== q3b.id);
await apply(paid(await invoiceFor(q4), 3990));
check("paid: Premium yearly", (await mine()).subscription.planId === "premium");
check(
  "the expired page paid late, after the newer one: kept for a refund, not applied twice",
  (await apply(paid(q3inv, 3990))) === "review",
);

// A page past its expiry that Xendit never told us about is cleared on the next try.
const q5 = await pay("addons", null, null, [{ addonId: "extra_kasambahay", quantity: 1 }]);
await invoiceFor(q5);
await as(null);
await q(`UPDATE billing_payments SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
  q5.id,
]);
const q5b = await pay("addons", null, null, [{ addonId: "extra_kasambahay", quantity: 1 }]);
check("a page past its expiry isn't reused", !!q5b.id && q5b.id !== q5.id && !q5b.reuse);

// --- The catalog itself -------------------------------------------------------------
await as(null);
await expectError(
  "a published version can't be edited",
  () => q(`UPDATE billing_plan_versions SET price_monthly = 1 WHERE plan_id = 'normal'`),
  /can't change/,
);
await expectError(
  "a version can't leave out her leave and rest days",
  () =>
    q(`INSERT INTO billing_plan_versions (plan_id, version, name, price_monthly, features, limits)
           SELECT plan_id, 2, name, 100, features || '{"time_off": false}', limits
             FROM billing_plan_versions WHERE plan_id = 'normal'`),
  /check constraint/,
);
await expectError(
  "or invent a feature",
  () =>
    q(`INSERT INTO billing_plan_versions (plan_id, version, name, price_monthly, features, limits)
           SELECT plan_id, 2, name, 100, features || '{"ai_magic": true}', limits
             FROM billing_plan_versions WHERE plan_id = 'normal'`),
  /check constraint/,
);
await expectError(
  "or set a negative limit",
  () =>
    q(`INSERT INTO billing_plan_versions (plan_id, version, name, price_monthly, features, limits)
           SELECT plan_id, 2, name, 100, features, limits || '{"kasambahay": -1}'
             FROM billing_plan_versions WHERE plan_id = 'normal'`),
  /check constraint/,
);

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
