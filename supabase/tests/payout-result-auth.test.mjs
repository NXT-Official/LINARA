// Runs fix-payout-result-auth.sql against a real Postgres (PGlite). Security
// test, 2026-11-03: record_payout_attempt_result had no caller check and anon
// could execute it, so anyone holding an attempt id could mark a payout paid,
// or failed (which releases its vales and leave). Every case below is an
// attack that must fail, plus the callers that must keep working: the
// household's managers (the web app's reconcile) and the service-role webhook.
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
const claims = async (role) =>
  db.query("SELECT set_config('request.jwt.claims', $1, false)", [
    role ? JSON.stringify({ role }) : "",
  ]);
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
const asOwner = async (fn) => {
  await db.exec("RESET ROLE");
  try {
    return await fn();
  } finally {
    await db.exec("SET ROLE authenticated");
  }
};
const RECORD = `SELECT * FROM record_payout_attempt_result($1, $2, null, $3)`;
const state = async (attemptId) =>
  asOwner(() =>
    one(
      `SELECT pa.status AS attempt, p.payout_status AS payslip,
              (SELECT count(*)::int FROM vales v WHERE v.settled_in_payslip_id = p.id) AS vales
         FROM payout_attempts pa JOIN payslips p ON p.id = pa.payslip_id WHERE pa.id = $1`,
      [attemptId],
    ),
  );

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
await db.exec(`ALTER TABLE payslips DROP COLUMN payout_reference_id`);
await db.exec(readFileSync(`${REPO}/add-employment-end.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-pay-periods.sql`, "utf8"));
// As unpaid-leave-pay.test.mjs: what add-leave.sql and the payout function read,
// plus household_managers as add-household-managers.sql has it live.
await db.exec(`
  ALTER TABLE helper_profiles ADD COLUMN break_start TIME, ADD COLUMN break_end TIME;
  ALTER TABLE rest_off_requests ADD COLUMN start_time TIME, ADD COLUMN end_time TIME;
  ALTER TABLE payout_attempts ADD COLUMN psp_payout_id TEXT, ADD COLUMN failure_reason TEXT,
    ADD COLUMN resolved_at TIMESTAMPTZ;
  CREATE FUNCTION public.household_today() RETURNS DATE LANGUAGE sql STABLE AS
  $$ SELECT '2026-10-02'::date $$;
  GRANT EXECUTE ON FUNCTION public.household_today() TO authenticated;
  CREATE TABLE public.household_managers (
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('primary_manager', 'co_manager', 'remote_admin')),
    PRIMARY KEY (household_id, user_id)
  );
`);
await db.exec(readFileSync(`${REPO}/add-leave.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-unpaid-leave-pay.sql`, "utf8"));
// What Supabase grants on every new function, which the fix must take back.
await db.exec(
  `GRANT EXECUTE ON FUNCTION public.record_payout_attempt_result(UUID, TEXT, TEXT, TEXT) TO PUBLIC, anon`,
);
await db.exec(readFileSync(`${REPO}/fix-payout-result-auth.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/fix-payout-result-auth.sql`, "utf8"));
console.log("migration applied twice");

const M = "00000000-0000-0000-0000-00000000000a"; // primary manager, H
const U = "00000000-0000-0000-0000-00000000000b"; // Marites, the helper
const M2 = "00000000-0000-0000-0000-00000000000c"; // primary manager, H2 (attacker)
const RA = "00000000-0000-0000-0000-00000000000d"; // remote admin of H
const CO = "00000000-0000-0000-0000-00000000000e"; // was co-manager of H, removed
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const HP = "20000000-0000-0000-0000-000000000001";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${U}'), ('${M2}'), ('${RA}'), ('${CO}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO user_profiles VALUES ('${RA}', '${H}', 'Lito Reyes', 'remote_admin', now());
  -- Still says co_manager on the profile, but no longer in household_managers.
  INSERT INTO user_profiles VALUES ('${CO}', '${H}', 'Old Co', 'co_manager', now());
  INSERT INTO household_managers VALUES ('${H}', '${M}', 'primary_manager'),
    ('${H2}', '${M2}', 'primary_manager'), ('${H}', '${RA}', 'remote_admin');
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status, created_at, started_on, weekly_rest_day)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE', '2026-08-01 02:00+00', '2026-08-01', 0);
  INSERT INTO vales (helper_id, amount, status) VALUES ('${HP}', 500, 'approved');
`);

await db.exec(`SET ROLE authenticated`);
await as(M);
const pay = await one(`SELECT * FROM initiate_payslip($1, 4000, 187.5, 'PH_GCASH', '2026-09-16')`, [
  HP,
]);
const A = pay.attempt_id;
const before = await state(A);
check(
  "setup: a pending payout holding the vale",
  before.vales === 1 && before.attempt !== "succeeded",
  before,
);

// --- Grants ---------------------------------------------------------------------
const FN = "public.record_payout_attempt_result(uuid, text, text, text)";
const priv = await asOwner(() =>
  one(
    `SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
            has_function_privilege('authenticated', $1, 'EXECUTE') AS authed,
            EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                     WHERE p.oid = $1::regprocedure AND a.grantee = 0) AS public`,
    [FN],
  ),
);
check("anon can't execute it", priv.anon === false, priv);
check("PUBLIC has no grant", priv.public === false, priv);
check("signed-in users still can (the web reconcile)", priv.authed === true, priv);

// --- Attacks: each must fail and change nothing --------------------------------
for (const [label, uid] of [
  ["a manager of another household", M2],
  ["the helper herself", U],
  ["a removed co-manager whose profile still says co_manager", CO],
]) {
  await as(uid);
  await expectError(
    `${label} can't mark it succeeded`,
    () => q(RECORD, [A, "succeeded", null]),
    /forbidden/i,
  );
  await expectError(
    `${label} can't mark it failed`,
    () => q(RECORD, [A, "failed", "x"]),
    /forbidden/i,
  );
}
check(
  "after the attacks, nothing changed",
  JSON.stringify(await state(A)) === JSON.stringify(before),
  await state(A),
);

await as(M2);
await expectError(
  "an unknown attempt id reads as forbidden, not 'not found' (no id oracle)",
  () => q(RECORD, ["99999999-0000-0000-0000-000000000000", "failed", "x"]),
  /forbidden/i,
);

// A request without a user id but with an anon or user JWT: refused, should a grant ever come back.
await as(null);
for (const role of ["anon", "authenticated"]) {
  await claims(role);
  await expectError(
    `a ${role} JWT with no user is refused`,
    () => q(RECORD, [A, "succeeded", null]),
    /forbidden/i,
  );
}
await claims(null);
check(
  "still nothing changed",
  JSON.stringify(await state(A)) === JSON.stringify(before),
  await state(A),
);

// --- Callers that must keep working ---------------------------------------------
await as(M);
await expectError(
  "bad status still rejected first",
  () => q(RECORD, [A, "paid", null]),
  /invalid attempt status/i,
);
let r = await one(RECORD, [A, "accepted", null]);
check("the household's manager records 'accepted'", r.payslip_status === "processing", r);

await as(RA);
r = await one(RECORD, [A, "failed", "Invalid account"]);
check("a remote admin of the household records 'failed'", r.payslip_status === "failed", r);
check("and a failed payout still releases the vale", (await state(A)).vales === 0, await state(A));

// The service-role webhook: no user, service_role JWT.
await as(M);
const pay2 = await one(
  `SELECT * FROM initiate_payslip($1, 4000, 187.5, 'PH_GCASH', '2026-09-16')`,
  [HP],
);
await as(null);
await claims("service_role");
r = await one(RECORD, [pay2.attempt_id, "succeeded", null]);
check("the service-role webhook records 'succeeded'", r.payslip_status === "succeeded", r);
await expectError(
  "the webhook still hears 'not found' for an unknown attempt",
  () => q(RECORD, ["99999999-0000-0000-0000-000000000000", "failed", "x"]),
  /not found/i,
);
await claims(null);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
