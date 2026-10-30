// Runs add-billing-pause.sql against a real Postgres (PGlite) as an attacker
// would: a plan left unpaid past grace must not keep its paid features, and a
// household over its limits (restricted, downgraded, add-ons removed) must not
// keep using what wasn't picked to stay active, whether or not anything was
// picked. A kasambahay's own rights and what's already there must stay.
//
//   node supabase/tests/billing-pause.test.mjs
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
// Reads through the server key (the billing_* checks are internal).
const srv = async (sql, params) => {
  await as(null);
  return one(sql, params);
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
const expectOk = async (label, fn) => {
  try {
    await fn();
    check(label, true);
  } catch (e) {
    check(label, false, e.message);
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
                      ADD COLUMN emergency BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN routine_id TEXT;
  ALTER TABLE tickets ALTER COLUMN helper_id DROP NOT NULL;
  ALTER TABLE quick_utos ADD COLUMN emergency BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE appointments ADD COLUMN scheduled_time TIMESTAMPTZ NOT NULL DEFAULT now();
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
  "add-billing-pause.sql",
]) {
  await db.exec(readFileSync(`${REPO}/${file}`, "utf8"));
}
await db.exec(`GRANT ALL ON public.app_switches TO authenticated`);
console.log("migrations applied (add-billing-pause.sql twice)");

const M = "00000000-0000-0000-0000-00000000000a"; // manager, primary of H (older) and H3 (newer)
const U = "00000000-0000-0000-0000-00000000000b"; // helper account, works in H and H3
const H = "10000000-0000-0000-0000-000000000001";
const H3 = "10000000-0000-0000-0000-000000000003";
const HP = "20000000-0000-0000-0000-000000000001"; // U in H, the longest there
const HP2 = "20000000-0000-0000-0000-000000000002"; // invite in H, newer
const HP3 = "20000000-0000-0000-0000-000000000003"; // invite in H3, newest
const HP4 = "20000000-0000-0000-0000-000000000004"; // U again, in H3

const svc = async (sql, params) => {
  await as(null);
  return q(sql, params);
};
// M's subscription: plan, status-making period end, add-ons.
const setSub = async (planId, endSql, { addons = "[]", cancel = false } = {}) => {
  await svc(
    `INSERT INTO billing_subscriptions (manager_id, plan_version_id, cycle, addons, status,
                                        current_period_start, current_period_end, cancel_at_period_end)
     VALUES ($1, billing_current_version($2), 'monthly', $3::jsonb, 'active',
             ${endSql} - interval '1 month', ${endSql}, $4)
     ON CONFLICT (manager_id) DO UPDATE SET plan_version_id = EXCLUDED.plan_version_id,
       cycle = 'monthly', addons = EXCLUDED.addons, status = 'active',
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end`,
    [M, planId, addons, cancel],
  );
};
const status = async () =>
  (await srv(`SELECT billing_subscription_json($1) ->> 'status' AS s`, [M])).s;
const pickNothing = () => svc(`DELETE FROM billing_active_selection WHERE manager_id = $1`, [M]);
const addTask = (household, helper, extra = "") =>
  svc(
    `INSERT INTO tickets (household_id, title, helper_id${extra ? ", routine_id" : ""})
     VALUES ($1, 'Sweep', $2${extra ? ", $3" : ""})`,
    extra ? [household, helper, extra] : [household, helper],
  );
const sendUtos = (helper) =>
  svc(
    `INSERT INTO quick_utos (sender_name, recipient_id, content) VALUES ('Sir Ben', $1, 'Kain na')`,
    [helper],
  ).catch(async (e) => {
    // Older test schema: no sender_name column.
    if (!/sender_name/.test(e.message)) throw e;
    return svc(`INSERT INTO quick_utos (recipient_id, content) VALUES ($1, 'Kain na')`, [helper]);
  });
const addPantry = (household) =>
  svc(`INSERT INTO pantry_items (household_id, name) VALUES ($1, 'Rice')`, [household]);
const addAppointment = (household) =>
  svc(`INSERT INTO appointments (household_id, title) VALUES ($1, 'Doctor')`, [household]);

// Premium while setting up, so two households and four staff fit.
await svc(`INSERT INTO auth.users VALUES ('${M}'), ('${U}')`);
await svc(
  `INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H3}', 'Batangas House')`,
);
await svc(`INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now()),
                                           ('${U}', '${H}', 'Marites Santos', 'helper', now())`);
await setSub("premium", "now() + interval '20 days'");
await svc(`INSERT INTO household_managers (household_id, user_id, role, added_at) VALUES
  ('${H}', '${M}', 'primary_manager', '2026-01-01'), ('${H3}', '${M}', 'primary_manager', '2026-06-01')`);
await svc(`INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status, created_at) VALUES
  ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE', '2026-02-01'),
  ('${HP2}', NULL, '${H}', 'Lorna', 'Cook', 8000, 'semi_monthly', 'PENDING_CLAIM', '2026-03-01'),
  ('${HP3}', NULL, '${H3}', 'Nena', 'Laundry', 8000, 'semi_monthly', 'PENDING_CLAIM', '2026-07-01'),
  ('${HP4}', '${U}', '${H3}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE', '2026-07-02')`);
await svc(`INSERT INTO tickets (id, household_id, title, helper_id) VALUES
  ('30000000-0000-0000-0000-000000000001', '${H3}', 'Water the plants', NULL),
  ('30000000-0000-0000-0000-000000000002', '${H}', 'Fold clothes', '${HP}')`);
const T_H3 = "30000000-0000-0000-0000-000000000001";
const T_H = "30000000-0000-0000-0000-000000000002";

// --- Paid and running: nothing paused -----------------------------------------------
check("premium, running: active", (await status()) === "active");
await expectOk("premium: a task in the newer household", () => addTask(H3, HP3));
await expectOk("premium: Quick Utos to the newest invite", () => sendUtos(HP2));
await expectOk("premium: pantry in either household", () => addPantry(H3));

// --- Grace (past due): nothing changes yet --------------------------------------------
await setSub("premium", "now() - interval '2 days'");
check("2 days late: past due", (await status()) === "past_due");
check(
  "past due: still has Pantry",
  (await srv(`SELECT billing_household_has($1, 'pantry') AS p`, [H])).p === true,
);
await expectOk("past due: the newer household still takes a task", () => addTask(H3, null));

// --- Restricted: Free until it's paid -----------------------------------------------
await setSub("premium", "now() - interval '365 days'");
check("a year late: restricted", (await status()) === "restricted");
await as(M);
const billing = (await one(`SELECT my_billing() AS b`)).b;
check(
  "restricted: the limits are Free's",
  JSON.stringify(billing.limits) ===
    JSON.stringify({ households: 1, kasambahay: 1, co_managers: 0 }),
  billing.limits,
);
check("restricted: still shows the plan they're on", billing.subscription.planId === "premium");
for (const key of ["pantry", "teams_labels", "remote_admin"]) {
  check(
    `restricted: ${key} is off`,
    (await srv(`SELECT billing_household_has($1, $2) AS p`, [H, key])).p === false,
  );
}
for (const key of ["time_off", "after_hours", "work_record", "tasks"]) {
  check(
    `restricted: ${key} stays on (Free and every-plan features)`,
    (await srv(`SELECT billing_household_has($1, $2) AS p`, [H, key])).p === true,
  );
}
await expectError("restricted: no new pantry item", () => addPantry(H), /isn't on/);
await as(U);
const helperPlan = (await one(`SELECT my_household_plan() AS h`)).h;
check("restricted: her app sees Pantry off too", helperPlan.features.pantry === false);

// Nothing picked: the oldest household and the person there longest stay.
await expectError(
  "restricted, nothing picked: the newer household takes no task",
  () => addTask(H3, null),
  /household is paused/,
);
await expectError(
  "restricted: no appointment in the paused household",
  () => addAppointment(H3),
  /household is paused/,
);
await expectError(
  "restricted: no Quick Utos into the paused household",
  () => sendUtos(HP3),
  /household is paused/,
);
await expectOk("restricted: the kept household takes an unassigned task", () => addTask(H, null));
await expectOk("restricted: the longest-there kasambahay still gets tasks", () => addTask(H, HP));
await expectError(
  "restricted: a newer kasambahay gets no new task",
  () => addTask(H, HP2),
  /kasambahay is paused/,
);
await expectError("restricted: and no Quick Utos", () => sendUtos(HP2), /kasambahay is paused/);
await expectError(
  "restricted: an existing task can't be handed to her",
  () => svc(`UPDATE tickets SET helper_id = $1 WHERE id = $2`, [HP2, T_H]),
  /kasambahay is paused/,
);
await expectError(
  "restricted: her shift can't be moved",
  () => svc(`UPDATE helper_profiles SET shift_start = '06:00' WHERE id = $1`, [HP2]),
  /kasambahay is paused/,
);
await expectError(
  "restricted: nor her rest day",
  () => svc(`UPDATE helper_profiles SET weekly_rest_day = 3 WHERE id = $1`, [HP2]),
  /kasambahay is paused/,
);
await expectError(
  "restricted: no new staff invite into the paused household",
  () =>
    svc(
      `INSERT INTO helper_profiles (household_id, name, station, monthly_rate, payday_interval)
       VALUES ($1, 'New', 'Yaya', 8000, 'monthly')`,
      [H3],
    ),
  /household is paused|overdue/,
);

// What's there stays, and her rights never pause.
await expectOk("restricted: a paused household's task can still be edited", () =>
  svc(`UPDATE tickets SET title = 'Water the orchids' WHERE id = $1`, [T_H3]),
);
await expectOk("restricted: and taken off someone", () =>
  svc(`UPDATE tickets SET helper_id = NULL WHERE id = $1`, [T_H]),
);
await expectOk("restricted: a repeating task already set up keeps coming", () =>
  addTask(H3, null, T_H3),
);
await expectError(
  "restricted: a NEW repeating task is still new",
  () =>
    svc(
      `INSERT INTO tickets (id, household_id, title, routine_id)
       VALUES ('30000000-0000-0000-0000-0000000000aa', $1, 'Mop', '30000000-0000-0000-0000-0000000000aa')`,
      [H3],
    ),
  /household is paused/,
);
await expectOk("restricted: a paused kasambahay still asks for rest off", () =>
  svc(
    `INSERT INTO rest_off_requests (helper_id, rest_date, minutes) VALUES ($1, current_date + 3, 120)`,
    [HP4],
  ),
);
await expectOk("restricted: her rest owed is still logged", () =>
  svc(`INSERT INTO ledger_entries (helper_id, duration_minutes) VALUES ($1, 60)`, [HP4]),
);
await expectOk("restricted: an employment can still be ended", () =>
  svc(`UPDATE helper_profiles SET status = 'INACTIVE' WHERE id = $1`, [HP3]),
);

// The person there longest is the one kept; Lorna, newer, is paused.
check(
  "restricted: the person there longest is kept",
  (await srv(`SELECT billing_helper_paused($1) AS p`, [HP])).p === false,
);

// Picking: the manager keeps the newer household and Marites there.
await as(M);
await expectError(
  "restricted: can't keep two households on Free",
  () => q(`SELECT billing_save_selection($1, $2)`, [[H, H3], [HP4]]),
  /up to 1 household/,
);
await expectError(
  "restricted: can't keep two kasambahay on Free",
  () => q(`SELECT billing_save_selection($1, $2)`, [[H], [HP, HP2]]),
  /up to 1 kasambahay/,
);
await expectError(
  "restricted: can't keep a kasambahay of a household that's paused",
  () => q(`SELECT billing_save_selection($1, $2)`, [[H3], [HP2]]),
  /households that stay active/,
);
await expectOk("restricted: picks the newer household and Marites there", () =>
  q(`SELECT billing_save_selection($1, $2)`, [[H3], [HP4]]),
);
await expectOk("picked: the newer household takes a task for her", () => addTask(H3, HP4));
await expectError(
  "picked: the older one is paused now",
  () => addTask(H, null),
  /household is paused/,
);
await expectError("picked: and Lorna with it", () => sendUtos(HP2), /paused/);

// Nobody picked in the kept household: its longest-there person fills the
// place, not someone in a paused household.
await as(M);
await expectOk("picks the newer household alone", () =>
  q(`SELECT billing_save_selection($1, $2)`, [[H3], []]),
);
check(
  "picked nobody: the kept household's own staff fill the place",
  (await srv(`SELECT billing_helper_paused($1) AS p`, [HP4])).p === false,
);

// A pick the limits shrank under can't keep more than the limit.
await svc(
  `UPDATE billing_active_selection SET households = $2, kasambahay = $3 WHERE manager_id = $1`,
  [M, [H, H3], [HP2, HP]],
);
await expectError(
  "a stale pick of two households: only the first stays",
  () => addTask(H3, null),
  /household is paused/,
);
await expectOk("a stale pick of two kasambahay: the first stays", () => sendUtos(HP2));
await expectError(
  "a stale pick of two kasambahay: the second doesn't",
  () => addTask(H, HP),
  /kasambahay is paused/,
);

// Picks naming things that aren't the owner's can't widen anything.
await svc(`UPDATE billing_active_selection SET households = $2 WHERE manager_id = $1`, [
  M,
  ["10000000-0000-0000-0000-0000000000ff"],
]);
await expectOk("a pick of a stranger's household falls back to the oldest", () => addTask(H, null));
await expectError(
  "and the newer one is still paused",
  () => addTask(H3, null),
  /household is paused/,
);

// The guards are internal.
await as(M);
await expectError(
  "a manager can't ask what's paused directly",
  () => q(`SELECT billing_household_paused($1)`, [H]),
  /permission denied/,
);
await expectError(
  "nor clear a pause by calling the check",
  () => q(`SELECT billing_assert_active($1, NULL)`, [H]),
  /permission denied/,
);

// --- Downgrade: Free after a cancelled plan ran out ---------------------------------
await pickNothing();
await setSub("premium", "now() - interval '1 day'", { cancel: true });
check(
  "cancelled and ended: on Free",
  (await srv(`SELECT billing_subscription_json($1) ->> 'planId' AS p`, [M])).p === "free",
);
await expectError(
  "downgraded: the newer household is paused the same way",
  () => addTask(H3, null),
  /household is paused/,
);

// --- Add-ons: removing one pauses what it paid for ------------------------------------
await setSub("normal", "now() + interval '20 days'", {
  addons: '[{"addonId": "extra_household", "quantity": 1}]',
});
await expectOk("Normal + an extra household: both households take tasks", () => addTask(H3, null));
await setSub("normal", "now() + interval '20 days'");
await expectError(
  "the extra household removed: the newer one pauses",
  () => addTask(H3, null),
  /household is paused/,
);
await setSub("normal", "now() - interval '30 days'", {
  addons: '[{"addonId": "extra_household", "quantity": 1}]',
});
await expectError(
  "restricted with the add-on: unpaid add-ons don't count",
  () => addTask(H3, null),
  /household is paused/,
);

// --- Paying what's owed brings everything back ----------------------------------------
await setSub("premium", "now() - interval '30 days'");
await as(null);
const p = (
  await srv(`SELECT billing_create_payment($1, 'plan', 'premium', 'monthly', '[]'::jsonb) AS p`, [
    M,
  ])
).p;
check("restricted: what's owed is priced on Premium", p.amount === 39900, p);
await svc(`SELECT billing_attach_invoice($1, 'inv_pause', 'https://x', now() + interval '1 day')`, [
  p.id,
]);
const outcome = (
  await one(`SELECT billing_apply_invoice($1::jsonb) AS o`, [
    JSON.stringify({
      id: "inv_pause",
      status: "PAID",
      amount: 399,
      paid_amount: 399,
      currency: "PHP",
    }),
  ])
).o;
check("paid: applied", outcome === "applied", outcome);
check(
  "paid: Pantry is back",
  (await srv(`SELECT billing_household_has($1, 'pantry') AS p`, [H])).p === true,
);
await expectOk("paid: the newer household takes tasks again", () => addTask(H3, HP4));
await expectOk("paid: everyone gets Quick Utos again", () => sendUtos(HP2));

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
