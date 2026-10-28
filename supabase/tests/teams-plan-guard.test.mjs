// Runs add-teams-plan-guard.sql against a real Postgres (PGlite): without a
// plan that has Teams and labels nothing new can be made or assigned, and
// what's already there stays usable.
//
//   node supabase/tests/teams-plan-guard.test.mjs
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
  "add-teams-and-labels.sql",
  "add-teams-plan-guard.sql",
  "add-teams-plan-guard.sql",
  "add-billing-plan-changes.sql",
  "add-billing-plan-changes.sql",
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

// Puts M (primary manager of H) on a plan, or back on Free (no subscription).
const onPlan = async (planId) => {
  await as(null);
  await q(`DELETE FROM billing_subscriptions WHERE manager_id = $1`, [M]);
  if (planId) {
    await q(
      `INSERT INTO billing_subscriptions (manager_id, plan_version_id, cycle, status,
                                          current_period_start, current_period_end)
       VALUES ($1, billing_current_version($2), 'monthly', 'active', now(), now() + interval '1 month')`,
      [M, planId],
    );
  }
};
const svcq = async (sql, params) => {
  await as(null);
  return q(sql, params);
};

// --- On Free: nothing new -----------------------------------------------------
await onPlan(null);
await expectError(
  "Free: a new team is refused",
  () => svcq(`INSERT INTO household_teams (household_id, name) VALUES ($1, 'On Free')`, [H]),
  /Teams and labels isn't on this household's plan/,
);
await expectError(
  "Free: a new label is refused",
  () => svcq(`INSERT INTO household_labels (household_id, name) VALUES ($1, 'On Free')`, [H]),
  /Teams and labels isn't on this household's plan/,
);

// --- On Premium: allowed --------------------------------------------------------
await onPlan("premium");
const team = (
  await svcq(
    `INSERT INTO household_teams (household_id, name) VALUES ($1, 'Kitchen') RETURNING id`,
    [H],
  )
)[0].id;
const team2 = (
  await svcq(
    `INSERT INTO household_teams (household_id, name) VALUES ($1, 'Garden') RETURNING id`,
    [H],
  )
)[0].id;
const label = (
  await svcq(
    `INSERT INTO household_labels (household_id, name) VALUES ($1, 'Stay-in') RETURNING id`,
    [H],
  )
)[0].id;
const label2 = (
  await svcq(
    `INSERT INTO household_labels (household_id, name) VALUES ($1, 'Driver') RETURNING id`,
    [H],
  )
)[0].id;
check("Premium: teams and labels can be made", !!team && !!label);
await svcq(`UPDATE helper_profiles SET team_id = $1 WHERE id = $2`, [team, HP]);
await svcq(`INSERT INTO helper_labels (helper_id, label_id) VALUES ($1, $2)`, [HP, label]);
check(
  "and someone put on a team and given a label",
  (await svcq(`SELECT team_id FROM helper_profiles WHERE id = $1`, [HP]))[0].team_id === team,
);

// --- Back on Free: what's there stays, nothing new ------------------------------
await onPlan(null);
check(
  "back on Free the teams are still there",
  (await svcq(`SELECT count(*)::int AS n FROM household_teams WHERE household_id = $1`, [H]))[0]
    .n === 2,
);
await svcq(`UPDATE household_teams SET name = 'Kusina' WHERE id = $1`, [team]);
check("a team can still be renamed", true);
await expectError(
  "moving someone to another team is refused",
  () => svcq(`UPDATE helper_profiles SET team_id = $1 WHERE id = $2`, [team2, HP]),
  /Teams and labels isn't on this household's plan/,
);
await expectError(
  "giving someone another label is refused",
  () => svcq(`INSERT INTO helper_labels (helper_id, label_id) VALUES ($1, $2)`, [HP, label2]),
  /Teams and labels isn't on this household's plan/,
);
await svcq(`UPDATE helper_profiles SET name = 'Marites S.' WHERE id = $1`, [HP]);
check("editing her other details still works (her team unchanged)", true);
await svcq(`UPDATE helper_profiles SET team_id = NULL WHERE id = $1`, [HP]);
check(
  "taking her off the team still works",
  (await svcq(`SELECT team_id FROM helper_profiles WHERE id = $1`, [HP]))[0].team_id === null,
);
await svcq(`DELETE FROM helper_labels WHERE helper_id = $1`, [HP]);
await svcq(`DELETE FROM household_labels WHERE id = $1`, [label]);
await svcq(`DELETE FROM household_teams WHERE id = $1`, [team2]);
check("removing labels and teams still works", true);

// --- Normal doesn't include it either ---------------------------------------------
await onPlan("normal");
await expectError(
  "Normal: a new team is refused too",
  () => svcq(`INSERT INTO household_teams (household_id, name) VALUES ($1, 'Laundry')`, [H]),
  /Teams and labels isn't on this household's plan/,
);

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
