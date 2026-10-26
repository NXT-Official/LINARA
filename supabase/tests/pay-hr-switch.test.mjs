// Runs add-pay-hr-switch.sql against a real Postgres (PGlite): while
// staff_pay_hr is off, no payslip, vale, vale approval, payout account or wage
// change gets in by any path (her own token, a manager's, the server key),
// while reads, declining a vale, settling a payout already sent and other
// helper_profiles edits keep working. Each refusal is first shown to succeed
// with the switch on, so it's the switch refusing, not RLS.
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
const changes = async (sql, params) => (await q(`${sql} RETURNING 1`, params)).length;
const setSwitch = async (on) => {
  await as(null);
  await q(`UPDATE app_switches SET enabled = $1 WHERE key = 'staff_pay_hr'`, [on]);
};
const OFF = /temporarily disabled/;

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
await db.exec(`
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
  "add-pay-hr-switch.sql",
  "add-pay-hr-switch.sql",
]) {
  await db.exec(readFileSync(`${REPO}/${file}`, "utf8"));
}
// Supabase grants every new public table to authenticated by default; only RLS
// stands between a signed-in user and app_switches.
await db.exec(`GRANT ALL ON public.app_switches TO authenticated`);
console.log("migrations applied (this one twice)");

const M = "00000000-0000-0000-0000-00000000000a"; // manager, household H
const U = "00000000-0000-0000-0000-00000000000b"; // helper account, works in H
const H = "10000000-0000-0000-0000-000000000001";
const HP = "20000000-0000-0000-0000-000000000001";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${U}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO household_managers (household_id, user_id, role) VALUES ('${H}', '${M}', 'primary_manager');
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status, created_at, started_on)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE', '2026-08-10 02:00+00', '2026-08-10');
`);

// --- The switch itself --------------------------------------------------------
check(
  "it starts off",
  (await one(`SELECT enabled FROM app_switches WHERE key = 'staff_pay_hr'`)).enabled === false,
);
await as(U);
check(
  "a signed-in user can read it",
  (await one(`SELECT enabled FROM app_switches WHERE key = 'staff_pay_hr'`))?.enabled === false,
);
check(
  "but can't turn it on",
  (await changes(`UPDATE app_switches SET enabled = true WHERE key = 'staff_pay_hr'`)) === 0,
);
check(
  "or delete it",
  (await changes(`DELETE FROM app_switches WHERE key = 'staff_pay_hr'`)) === 0,
);
await expectError(
  "or add a second row",
  () => q(`INSERT INTO app_switches (key, enabled) VALUES ('staff_pay_hr_2', true)`),
  /row-level security/,
);

// --- Her vale request ---------------------------------------------------------
await setSwitch(true);
await as(U);
check(
  "on: she can ask for a vale",
  (await changes(`INSERT INTO vales (helper_id, amount, reason) VALUES ($1, 500, 'gamot')`, [
    HP,
  ])) === 1,
);
await setSwitch(false);
await as(U);
await expectError(
  "off: her vale request is refused",
  () => q(`INSERT INTO vales (helper_id, amount, reason) VALUES ($1, 300, 'pamasahe')`, [HP]),
  OFF,
);
await as(null);
check(
  "off: her earlier request is still on record",
  Number((await one(`SELECT count(*) AS n FROM vales WHERE helper_id = $1`, [HP])).n) === 1,
);

// --- Deciding a vale ----------------------------------------------------------
await expectError(
  "off: approving a vale is refused, even with the server key",
  () => q(`UPDATE vales SET status = 'approved' WHERE helper_id = $1`, [HP]),
  OFF,
);
check(
  "off: declining one still works (ending an employment declines them)",
  (await changes(`UPDATE vales SET status = 'declined' WHERE helper_id = $1`, [HP])) === 1,
);
await expectError(
  "off: a declined vale can't be flipped to approved either",
  () => q(`UPDATE vales SET status = 'approved' WHERE helper_id = $1`, [HP]),
  OFF,
);

// --- Where she's paid ---------------------------------------------------------
await as(U);
await expectError(
  "off: she can't save a GCash number",
  () =>
    q(
      `INSERT INTO helper_payout_accounts (user_id, method, account_name, account_number) VALUES ($1, 'PH_GCASH', 'Marites Santos', '09171234567')`,
      [U],
    ),
  OFF,
);
await setSwitch(true);
await as(U);
check(
  "on: she can",
  (await changes(
    `INSERT INTO helper_payout_accounts (user_id, method, account_name, account_number) VALUES ($1, 'PH_GCASH', 'Marites Santos', '09171234567')`,
    [U],
  )) === 1,
);
await setSwitch(false);
await as(U);
await expectError(
  "off: she can't change it",
  () => q(`UPDATE helper_payout_accounts SET account_number = '09181234567' WHERE user_id = $1`, [U]),
  OFF,
);
await as(M);
check(
  "off: her manager still reads it",
  (await one(`SELECT account_number FROM helper_payout_accounts WHERE user_id = $1`, [U]))
    ?.account_number === "09171234567",
);

// --- Payslips -----------------------------------------------------------------
const payslip = `INSERT INTO payslips (helper_id, cutoff_start, cutoff_end, base_pay, statutory_employee_share, net_pay, payout_provider, payout_channel_code, payout_status)
  VALUES ($1, $2, $3, 4000, 0, 4000, 'manual', 'PH_GCASH', 'succeeded')`;
await as(null);
await expectError(
  "off: a payslip is refused, even with the server key",
  () => q(payslip, [HP, "2026-08-16", "2026-08-31"]),
  OFF,
);
await expectError(
  "off: record_offapp_payslip refuses for the manager",
  async () => {
    await as(M);
    await q(
      `SELECT * FROM record_offapp_payslip($1, 4000, 0, 'PH_GCASH', '2026-09-01', NULL, '2026-08-16', 'regular')`,
      [HP],
    );
  },
  OFF,
);
await setSwitch(true);
check("on: a payslip goes in", (await changes(payslip, [HP, "2026-08-16", "2026-08-31"])) === 1);
await setSwitch(false);
check(
  "off: a payout already sent can still be settled (the Xendit webhook)",
  (await changes(`UPDATE payslips SET confirmed_at = now() WHERE helper_id = $1`, [HP])) === 1,
);

// --- Her wage -----------------------------------------------------------------
await expectError(
  "off: changing her wage is refused, even with the server key",
  () => q(`UPDATE helper_profiles SET monthly_rate = 9000 WHERE id = $1`, [HP]),
  OFF,
);
check(
  "off: other edits to her profile still work",
  (await changes(`UPDATE helper_profiles SET station = 'Cook' WHERE id = $1`, [HP])) === 1,
);
check(
  "off: setting the same wage again isn't a change",
  (await changes(`UPDATE helper_profiles SET monthly_rate = 8000 WHERE id = $1`, [HP])) === 1,
);
check(
  "off: a new invite still gets its first wage",
  (await changes(
    `INSERT INTO helper_profiles (id, household_id, name, station, monthly_rate, payday_interval, status, created_at)
     VALUES ('20000000-0000-0000-0000-000000000002', $1, 'Joy', 'Cook', 7000, 'semi_monthly', 'PENDING_CLAIM', now())`,
    [H],
  )) === 1,
);

// --- Fail closed, and re-running keeps the setting ----------------------------
await q(`DELETE FROM app_switches WHERE key = 'staff_pay_hr'`);
await expectError(
  "with the switch row deleted, pay stays off",
  () => q(`UPDATE helper_profiles SET monthly_rate = 9000 WHERE id = $1`, [HP]),
  OFF,
);
await db.exec(readFileSync(`${REPO}/add-pay-hr-switch.sql`, "utf8"));
await setSwitch(true);
await db.exec(readFileSync(`${REPO}/add-pay-hr-switch.sql`, "utf8"));
check(
  "re-running the migration doesn't turn a switched-on pay back off",
  (await one(`SELECT enabled FROM app_switches WHERE key = 'staff_pay_hr'`)).enabled === true,
);
check(
  "on again: her wage can change",
  (await changes(`UPDATE helper_profiles SET monthly_rate = 9000 WHERE id = $1`, [HP])) === 1,
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
