// Runs add-remote-admin-pay.sql against a real Postgres (PGlite), on top of
// the pay functions it widens: a remote admin can now pay (the check every
// payout and "Paid outside Linara" goes through) and take back an off-app
// record; a helper still can't; nothing else in the functions changed.
// KNOWN_GAPS O34.
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
const bodyOf = async (fn) =>
  (await one(`SELECT pg_get_functiondef($1::regprocedure) AS d`, [fn])).d;

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
await db.exec(`ALTER TABLE payslips DROP COLUMN payout_reference_id`);
await db.exec(readFileSync(`${REPO}/add-employment-end.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-pay-periods.sql`, "utf8"));
const before = {
  target: await bodyOf("public.pay_target(uuid, date, text)"),
  withdraw: await bodyOf("public.withdraw_offapp_payslip(uuid)"),
};
await db.exec(readFileSync(`${REPO}/add-remote-admin-pay.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-remote-admin-pay.sql`, "utf8"));
console.log("migration applied twice");

const strip = (d) => d.replace("NOT IN ('primary_manager', 'co_manager', 'remote_admin')", "X");
const after = {
  target: await bodyOf("public.pay_target(uuid, date, text)"),
  withdraw: await bodyOf("public.withdraw_offapp_payslip(uuid)"),
};
check(
  "only the role list changed, in both functions",
  strip(after.target) === before.target.replace("NOT IN ('primary_manager', 'co_manager')", "X") &&
    strip(after.withdraw) ===
      before.withdraw.replace("NOT IN ('primary_manager', 'co_manager')", "X") &&
    after.target !== before.target,
);

const R = "00000000-0000-0000-0000-00000000000d"; // remote admin, household H
const U = "00000000-0000-0000-0000-00000000000b"; // helper account
const H = "10000000-0000-0000-0000-000000000001";
const HP = "20000000-0000-0000-0000-000000000001";

await db.exec(`
  INSERT INTO auth.users VALUES ('${R}'), ('${U}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household');
  INSERT INTO user_profiles VALUES ('${R}', '${H}', 'Lola Fe', 'remote_admin', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status, created_at, started_on)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE', '2026-08-10 02:00+00', '2026-08-10');
`);
await db.exec(`SET ROLE authenticated`);

await as(R);
check(
  "a remote admin gets past the pay check",
  (await q(`SELECT * FROM pay_target($1, '2026-09-01', 'regular')`, [HP])).length === 1,
);
const paid = await one(
  `SELECT * FROM record_offapp_payslip($1, 4000, 187.5, 'CASH', '2026-09-16', 'sent from Dubai', '2026-09-01')`,
  [HP],
);
check("and records a payment made outside Linara", Number(paid.net_pay) > 0, paid);
await q(`SELECT withdraw_offapp_payslip($1)`, [paid.payslip_id]);
check(
  "and takes it back",
  (await q(`SELECT id FROM payslips WHERE id = $1`, [paid.payslip_id])).length === 0,
);

await as(U);
await expectError(
  "a helper still can't pay herself",
  () => q(`SELECT * FROM pay_target($1, '2026-09-01', 'regular')`, [HP]),
  /only managers can pay/,
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
