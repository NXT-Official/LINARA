// Runs staff-pay-hr-linara-team.sql against a real Postgres (PGlite). Staff
// pay & HR is the Linara team's own payroll (console D50): it must stop being
// a plan feature anywhere a household could get it, and turning it on must not
// bring back the household payslip features, which keep their own switch.
//
//   node supabase/tests/staff-pay-hr-linara-team.test.mjs
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const MIGRATION = process.env.MIGRATION ?? `${REPO}/staff-pay-hr-linara-team.sql`;
const db = new PGlite();
let failures = 0;

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

// Same base as billing-pause.test.mjs.
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
  CREATE TABLE storage.objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT NOT NULL, name TEXT NOT NULL);
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
]) {
  await db.exec(readFileSync(`${REPO}/${file}`, "utf8"));
}

const M = "00000000-0000-0000-0000-00000000000a";
const H = "10000000-0000-0000-0000-000000000001";
const HP = "20000000-0000-0000-0000-000000000001";
await db.exec(`
  INSERT INTO auth.users VALUES ('${M}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO household_managers (household_id, user_id, role) VALUES ('${H}', '${M}', 'primary_manager')
    ON CONFLICT DO NOTHING;
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status, created_at, started_on, weekly_rest_day)
    VALUES ('${HP}', NULL, '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE', now(), current_date, 0);
  INSERT INTO billing_subscriptions (manager_id, plan_version_id, cycle, addons, status,
                                     current_period_start, current_period_end)
    VALUES ('${M}', billing_current_version('premium'), 'monthly', '[]', 'active', now() - interval '1 day', now() + interval '1 month');
  -- A draft that still carries the key, as the console saved them before D50.
  INSERT INTO billing_plans (id, status, display_order, draft) VALUES ('family', 'draft', 9,
    jsonb_build_object('name', 'Family', 'features', (SELECT jsonb_object_agg(k, false) FROM unnest(billing_feature_keys()) k)));
`);

const before = await one(
  `SELECT (features ->> 'staff_pay_hr')::boolean AS v FROM billing_plan_versions WHERE plan_id = 'premium'`,
);
check("setup: Premium's version has staff_pay_hr on, as on dev", before.v === true, before);

await db.exec(readFileSync(MIGRATION, "utf8"));
await db.exec(readFileSync(MIGRATION, "utf8"));
console.log("migration applied twice");

// --- Not a plan feature -------------------------------------------------------
const keys = (await one(`SELECT billing_feature_keys() AS k`)).k;
check("billing_feature_keys() no longer lists it", !keys.includes("staff_pay_hr"), keys);
const stored = await one(`
  SELECT (SELECT count(*)::int FROM billing_plan_versions WHERE features ? 'staff_pay_hr') AS versions,
         (SELECT count(*)::int FROM billing_plans WHERE (draft -> 'features') ? 'staff_pay_hr') AS drafts,
         (SELECT bool_and(billing_valid_version(features, limits)) FROM billing_plan_versions) AS valid`);
check(
  "no stored version or draft keeps the key",
  stored.versions === 0 && stored.drafts === 0,
  stored,
);
check(
  "every stored version still passes the CHECK (dump and restore stay safe)",
  stored.valid === true,
  stored,
);
const premium = await one(
  `SELECT features ->> 'remote_admin' AS remote, published_at IS NOT NULL AS pub FROM billing_plan_versions WHERE plan_id = 'premium'`,
);
check("Premium's other features are untouched", premium.remote === "true" && premium.pub, premium);
await expectError(
  "published versions are immutable again after the fix",
  () => q(`UPDATE billing_plan_versions SET name = 'Hacked' WHERE plan_id = 'premium'`),
  /can't change/,
);
await expectError(
  "a version that still sends the key is refused",
  () =>
    q(`INSERT INTO billing_plan_versions (plan_id, version, name, description, price_monthly, trial_days, features, limits)
       SELECT plan_id, 2, name, description, price_monthly, trial_days,
              features || '{"staff_pay_hr": false}', limits
         FROM billing_plan_versions WHERE plan_id = 'premium'`),
  /check constraint/i,
);
check(
  "a household on Premium doesn't have it",
  (await one(`SELECT billing_household_has($1, 'staff_pay_hr') AS v`, [H])).v === false,
);
check(
  "and still has its real Premium features",
  (await one(`SELECT billing_household_has($1, 'remote_admin') AS v`, [H])).v === true,
);
const catalog = (await one(`SELECT billing_catalog() AS c`)).c;
check(
  "the public catalog publishes no staff_pay_hr switch",
  JSON.stringify(catalog.switches) === "{}",
  catalog.switches,
);
check(
  "nor the feature in any plan",
  catalog.plans.every((p) => !("staff_pay_hr" in p.features)),
  catalog.plans.map((p) => p.id),
);

// --- The household payslip gate is its own switch ------------------------------
const sw = await q(`SELECT key, enabled FROM app_switches ORDER BY key`);
check(
  "household_pay_hr exists and starts off, like staff_pay_hr was",
  sw.some((s) => s.key === "household_pay_hr" && s.enabled === false) &&
    sw.some((s) => s.key === "staff_pay_hr" && s.enabled === false),
  sw,
);
const addVale = () =>
  q(`INSERT INTO vales (helper_id, amount, status) VALUES ($1, 100, 'pending')`, [HP]);
await expectError("household vale still refused", addVale, /temporarily disabled/);

await q(`UPDATE app_switches SET enabled = true WHERE key = 'staff_pay_hr'`);
check(
  "turning the Linara team switch on leaves the household gate off",
  (await one(`SELECT pay_hr_enabled() AS v`)).v === false,
);
await expectError("and household vales stay refused", addVale, /temporarily disabled/);
await q(`UPDATE app_switches SET enabled = false WHERE key = 'staff_pay_hr'`);

await q(`UPDATE app_switches SET enabled = true WHERE key = 'household_pay_hr'`);
check(
  "the household gate follows its own switch",
  (await one(`SELECT pay_hr_enabled() AS v`)).v === true,
);
await q(`UPDATE app_switches SET enabled = false WHERE key = 'household_pay_hr'`);

await q(`DELETE FROM app_switches WHERE key = 'household_pay_hr'`);
check(
  "a deleted household switch still counts as off",
  (await one(`SELECT pay_hr_enabled() AS v`)).v === false,
);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
