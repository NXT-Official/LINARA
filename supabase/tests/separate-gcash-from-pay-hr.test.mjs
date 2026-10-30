// Runs separate-gcash-from-pay-hr.sql after add-pay-hr-switch.sql against a
// real Postgres (PGlite): with staff_pay_hr off, a helper can still save and
// change where she's paid (it's not part of pay & HR), while payslips, vales
// and wage changes stay refused, and nobody else can write her account.
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
  "separate-gcash-from-pay-hr.sql",
  "separate-gcash-from-pay-hr.sql",
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

const saveGcash = `INSERT INTO helper_payout_accounts (user_id, method, account_name, account_number) VALUES ($1, 'PH_GCASH', 'Marites Santos', '09171234567')`;

check(
  "the switch is off",
  (await one(`SELECT enabled FROM app_switches WHERE key = 'staff_pay_hr'`)).enabled === false,
);

// --- Where she's paid: allowed while off -----------------------------------
await as(U);
check("off: she can save her GCash number", (await changes(saveGcash, [U])) === 1);
check(
  "off: she can change it",
  (await changes(
    `UPDATE helper_payout_accounts SET account_number = '09181234567' WHERE user_id = $1`,
    [U],
  )) === 1,
);
await as(M);
check(
  "off: her manager reads the new number",
  (await one(`SELECT account_number FROM helper_payout_accounts WHERE user_id = $1`, [U]))
    ?.account_number === "09181234567",
);
check(
  "her manager still can't change it (RLS, not the switch)",
  (await changes(
    `UPDATE helper_payout_accounts SET account_number = '09000000000' WHERE user_id = $1`,
    [U],
  )) === 0,
);

// --- Pay & HR itself: still refused while off ------------------------------
await as(null);
await expectError(
  "off: a payslip is still refused",
  () =>
    q(
      `INSERT INTO payslips (helper_id, cutoff_start, cutoff_end, base_pay, statutory_employee_share, net_pay, payout_provider, payout_channel_code, payout_status)
       VALUES ($1, '2026-08-16', '2026-08-31', 4000, 0, 4000, 'manual', 'PH_GCASH', 'succeeded')`,
      [HP],
    ),
  OFF,
);
await as(U);
await expectError(
  "off: a vale is still refused",
  () => q(`INSERT INTO vales (helper_id, amount, reason) VALUES ($1, 500, 'gamot')`, [HP]),
  OFF,
);
await as(null);
await expectError(
  "off: a wage change is still refused",
  () => q(`UPDATE helper_profiles SET monthly_rate = 9000 WHERE id = $1`, [HP]),
  OFF,
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
