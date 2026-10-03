// Runs add-direct-gcash-pay.sql against a real Postgres (PGlite): she saves
// where she wants to be paid and only she can change it; managers of a
// household she works in read it (another household's can't); her QR image
// folder is hers alone to write; and "I've sent it" by GCash records a
// payment made outside Linara. KNOWN_GAPS O35.
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
const changes = async (sql, params) => (await q(`${sql} RETURNING 1`, params)).length;

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

  -- Supabase Storage, as far as these policies use it.
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
  "add-direct-gcash-pay.sql",
]) {
  await db.exec(readFileSync(`${REPO}/${file}`, "utf8"));
}
console.log("migrations applied (this one twice)");

const M = "00000000-0000-0000-0000-00000000000a"; // manager, household H
const U = "00000000-0000-0000-0000-00000000000b"; // helper account, works in H
const M2 = "00000000-0000-0000-0000-00000000000c"; // manager, household H2
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const HP = "20000000-0000-0000-0000-000000000001";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${U}'), ('${M2}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO household_managers (household_id, user_id, role) VALUES ('${H}', '${M}', 'primary_manager'), ('${H2}', '${M2}', 'primary_manager');
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status, created_at, started_on)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE', '2026-08-10 02:00+00', '2026-08-10');
`);
await db.exec(`SET ROLE authenticated`);

// --- Hers -------------------------------------------------------------------
await as(U);
check(
  "she saves her GCash",
  (await changes(
    `INSERT INTO helper_payout_accounts (user_id, method, account_name, account_number) VALUES ($1, 'PH_GCASH', 'Marites Santos', '09171234567')`,
    [U],
  )) === 1,
);
await expectError(
  "a number that isn't 09 and nine digits is refused",
  () =>
    q(`UPDATE helper_payout_accounts SET account_number = '9171234567' WHERE user_id = $1`, [U]),
  /check constraint/,
);
check(
  "she changes it to Maya",
  (await changes(
    `UPDATE helper_payout_accounts SET method = 'PH_PAYMAYA', account_number = '09181234567' WHERE user_id = $1`,
    [U],
  )) === 1,
);
check(
  "she uploads her QR to her own folder",
  (await changes(
    `INSERT INTO storage.objects (bucket_id, name) VALUES ('household-evidence', $1)`,
    [`payout/${U}/qr.jpg`],
  )) === 1,
);
await expectError(
  "but not into someone else's",
  () =>
    q(`INSERT INTO storage.objects (bucket_id, name) VALUES ('household-evidence', $1)`, [
      `payout/${M}/qr.jpg`,
    ]),
  /row-level security/,
);

// --- Her household's manager ------------------------------------------------
await as(M);
check(
  "her manager reads where to pay her",
  (await one(`SELECT account_number FROM helper_payout_accounts WHERE user_id = $1`, [U]))
    ?.account_number === "09181234567",
);
check(
  "and sees her QR",
  (await q(`SELECT name FROM storage.objects WHERE name = $1`, [`payout/${U}/qr.jpg`])).length ===
    1,
);
check(
  "but can't change her number",
  (await changes(
    `UPDATE helper_payout_accounts SET account_number = '09990000000' WHERE user_id = $1`,
    [U],
  )) === 0,
);
check(
  "or replace her QR",
  (await changes(`UPDATE storage.objects SET name = name WHERE name = $1`, [
    `payout/${U}/qr.jpg`,
  ])) === 0 &&
    (await changes(`DELETE FROM storage.objects WHERE name = $1`, [`payout/${U}/qr.jpg`])) === 0,
);
await expectError(
  "or save one in her name",
  () =>
    q(
      `INSERT INTO helper_payout_accounts (user_id, method, account_name, account_number) VALUES ($1, 'PH_GCASH', 'X', '09990000000') ON CONFLICT (user_id) DO UPDATE SET account_number = EXCLUDED.account_number`,
      [U],
    ),
  /row-level security/,
);
const paid = await one(
  `SELECT * FROM record_offapp_payslip($1, 4000, 187.5, 'PH_GCASH', '2026-09-16', 'GCash ref 1234567890123', '2026-09-01')`,
  [HP],
);
const row = await one(
  `SELECT payout_provider, payout_channel_code, helper_ack FROM payslips WHERE id = $1`,
  [paid.payslip_id],
);
check(
  "\"I've sent it\" by GCash records a payment she's asked to confirm",
  row.payout_provider === "manual" &&
    row.payout_channel_code === "PH_GCASH" &&
    row.helper_ack === "pending",
  row,
);
await expectError(
  "an unknown method is still refused",
  () =>
    q(
      `SELECT * FROM record_offapp_payslip($1, 4000, 187.5, 'CRYPTO', '2026-09-16', null, '2026-08-16')`,
      [HP],
    ),
  /Unknown payment method/,
);

// --- Another household's manager --------------------------------------------
await as(M2);
check(
  "another household's manager sees nothing of hers",
  (await q(`SELECT 1 FROM helper_payout_accounts`)).length === 0 &&
    (await q(`SELECT 1 FROM storage.objects WHERE name LIKE 'payout/%'`)).length === 0,
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
