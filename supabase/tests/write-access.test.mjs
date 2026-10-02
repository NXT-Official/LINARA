// Runs fix-helper-write-access.sql against a real Postgres (PGlite) and acts
// as the API's `authenticated` role: a helper's login can read what it read
// before but write only her vale request and her own availability; managers
// can still write; another household's manager can't. KNOWN_GAPS C72.
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
/** An UPDATE or DELETE that RLS hides changes nothing and raises nothing: count the rows. */
const changes = async (sql, params) => (await q(`${sql} RETURNING 1`, params)).length;

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
// Columns the apps write that base-schema.sql doesn't carry.
await db.exec(`
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false;
`);
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));
console.log("migration applied twice");

const M = "00000000-0000-0000-0000-00000000000a"; // manager, household H
const U = "00000000-0000-0000-0000-00000000000b"; // helper account
const M2 = "00000000-0000-0000-0000-00000000000c"; // manager, household H2
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const HP = "20000000-0000-0000-0000-000000000001";
const HP_OTHER = "20000000-0000-0000-0000-000000000002";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${U}'), ('${M2}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE'),
           ('${HP_OTHER}', NULL, '${H}', 'Rosa', 'Cook', 7000, 'semi_monthly', 'ACTIVE');
  INSERT INTO vales (helper_id, amount, status) VALUES ('${HP}', 500, 'pending');
  INSERT INTO ledger_entries (helper_id, duration_minutes) VALUES ('${HP}', 60);
  INSERT INTO payslips (helper_id, cutoff_start, cutoff_end, base_pay, statutory_employee_share, net_pay, payout_channel_code)
    VALUES ('${HP}', '2026-09-01', '2026-09-15', 4000, 200, 3800, 'PH_GCASH');
  INSERT INTO rest_off_requests (helper_id, rest_date, minutes) VALUES ('${HP}', '2026-10-05', 60);

  -- Stands in for the claim / notice / end-employment functions: SECURITY
  -- DEFINER, so it runs as its owner, and the helper guard must let it through.
  CREATE FUNCTION public.definer_sets_rate(p_id UUID, p_rate NUMERIC) RETURNS VOID
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS
  $$ UPDATE public.helper_profiles SET monthly_rate = p_rate WHERE id = p_id $$;
  GRANT EXECUTE ON FUNCTION public.definer_sets_rate(UUID, NUMERIC) TO authenticated;
`);

await db.exec(`SET ROLE authenticated`);

// --- Her login --------------------------------------------------------------
await as(U);
check(
  "she still reads her household",
  (await q(`SELECT id FROM helper_profiles`)).length === 2 &&
    (await q(`SELECT id FROM vales`)).length === 1 &&
    (await q(`SELECT id FROM ledger_entries`)).length === 1 &&
    (await q(`SELECT id FROM payslips`)).length === 1 &&
    (await q(`SELECT id FROM rest_off_requests`)).length === 1,
);
check(
  "she can't make herself a manager",
  (await changes(`UPDATE user_profiles SET user_type = 'primary_manager' WHERE id = $1`, [U])) ===
    0,
);
await expectError(
  "she can't raise her own rate",
  () => q(`UPDATE helper_profiles SET monthly_rate = 99999 WHERE id = $1`, [HP]),
  /Only your availability/,
);
check(
  "she can set her own availability",
  (await changes(
    `UPDATE helper_profiles SET manual_status = 'available', manual_available_until = now() + interval '1 hour' WHERE id = $1`,
    [HP],
  )) === 1,
);
check(
  "but not someone else's",
  (await changes(`UPDATE helper_profiles SET manual_status = 'available' WHERE id = $1`, [
    HP_OTHER,
  ])) === 0,
);
await expectError(
  "she can't add a helper",
  () =>
    q(
      `INSERT INTO helper_profiles (household_id, name, station, monthly_rate, payday_interval) VALUES ($1, 'X', 'Cook', 1, 'monthly')`,
      [H],
    ),
  /row-level security/,
);
check(
  "a function running as its owner still updates her row",
  await q(`SELECT definer_sets_rate($1, 8100)`, [HP]).then(() => true),
);

await q(
  `INSERT INTO vales (helper_id, amount, reason, status) VALUES ($1, 300, 'Gamot', 'pending')`,
  [HP],
);
check("she can ask for a vale", (await q(`SELECT id FROM vales`)).length === 2);
await expectError(
  "but not one that's already approved",
  () => q(`INSERT INTO vales (helper_id, amount, status) VALUES ($1, 300, 'approved')`, [HP]),
  /row-level security/,
);
await expectError(
  "or one for someone else",
  () => q(`INSERT INTO vales (helper_id, amount, status) VALUES ($1, 300, 'pending')`, [HP_OTHER]),
  /row-level security/,
);
check(
  "she can't approve her own vale",
  (await changes(`UPDATE vales SET status = 'approved' WHERE helper_id = $1`, [HP])) === 0,
);
await expectError(
  "she can't add ledger minutes",
  () => q(`INSERT INTO ledger_entries (helper_id, duration_minutes) VALUES ($1, 600)`, [HP]),
  /row-level security/,
);
check(
  "or change them",
  (await changes(`UPDATE ledger_entries SET duration_minutes = 600 WHERE helper_id = $1`, [HP])) ===
    0,
);
check(
  "she can't edit a payslip",
  (await changes(`UPDATE payslips SET net_pay = 99999 WHERE helper_id = $1`, [HP])) === 0,
);
check(
  "she can't approve her own rest off",
  (await changes(`UPDATE rest_off_requests SET status = 'approved' WHERE helper_id = $1`, [HP])) ===
    0,
);
check(
  "she can't close the board",
  (await changes(`UPDATE households SET board_closed = true WHERE id = $1`, [H])) === 0,
);

// --- A manager --------------------------------------------------------------
await as(M);
check(
  "a manager approves a vale",
  (await changes(
    `UPDATE vales SET status = 'approved', approved_by = $2 WHERE helper_id = $1 AND status = 'pending'`,
    [HP, M],
  )) === 2,
);
check(
  "a manager adjusts the ledger",
  (await changes(`UPDATE ledger_entries SET adjust_minutes = 15 WHERE helper_id = $1`, [HP])) === 1,
);
await q(`INSERT INTO ledger_entries (helper_id, duration_minutes) VALUES ($1, 30)`, [HP]);
check("a manager records ledger minutes", (await q(`SELECT id FROM ledger_entries`)).length === 2);
check(
  "a manager edits a helper's rate",
  (await changes(`UPDATE helper_profiles SET monthly_rate = 8500 WHERE id = $1`, [HP])) === 1,
);
await q(
  `INSERT INTO helper_profiles (household_id, name, station, monthly_rate, payday_interval) VALUES ($1, 'New', 'Cook', 7000, 'monthly')`,
  [H],
);
check("a manager invites a helper", (await q(`SELECT id FROM helper_profiles`)).length === 3);
check(
  "a manager closes the board",
  (await changes(`UPDATE households SET board_closed = true WHERE id = $1`, [H])) === 1,
);

// --- Another household's manager ----------------------------------------------
await as(M2);
check(
  "another household's manager changes nothing here",
  (await changes(`UPDATE vales SET status = 'declined' WHERE helper_id = $1`, [HP])) === 0 &&
    (await changes(`UPDATE helper_profiles SET monthly_rate = 1 WHERE id = $1`, [HP])) === 0,
);
await expectError(
  "or adds ledger minutes for a helper not hers",
  () => q(`INSERT INTO ledger_entries (helper_id, duration_minutes) VALUES ($1, 600)`, [HP]),
  /row-level security/,
);

await db.exec(`RESET ROLE`);
check(
  "her rate is what managers and functions set, not what she tried",
  Number(
    (await one(`SELECT monthly_rate FROM helper_profiles WHERE id = $1`, [HP])).monthly_rate,
  ) === 8500,
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
