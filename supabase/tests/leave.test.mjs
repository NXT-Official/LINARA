// Runs add-leave.sql against a real Postgres (PGlite, in-process) and walks
// the rules it exists for: balances, overlaps, who may do what, and that a
// helper's session can't write the table directly. The schema under it is
// base-schema.sql plus the few columns and functions this migration reads.
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

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
// What add-leave.sql reads beyond base-schema.sql: started_on (add-pay-periods),
// break times (add-shift-break-columns), rest-off windows, and
// household_today() (add-household-timezone-and-cutoffs), pinned for the test.
await db.exec(`
  ALTER TABLE helper_profiles ADD COLUMN started_on DATE, ADD COLUMN break_start TIME, ADD COLUMN break_end TIME;
  ALTER TABLE rest_off_requests ADD COLUMN start_time TIME, ADD COLUMN end_time TIME;
  CREATE FUNCTION public.household_today() RETURNS DATE LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(NULLIF(current_setting('test.today', true), ''), '2026-10-02')::date $$;
  GRANT EXECUTE ON FUNCTION public.household_today() TO authenticated;
`);
await db.exec(readFileSync(`${REPO}/add-leave.sql`, "utf8"));
// Re-running must be harmless.
await db.exec(readFileSync(`${REPO}/add-leave.sql`, "utf8"));
console.log("migration applied twice");

const M = "00000000-0000-0000-0000-00000000000a"; // manager, household H
const U = "00000000-0000-0000-0000-00000000000b"; // helper with a year of service
const U2 = "00000000-0000-0000-0000-00000000000d"; // helper in her first year
const M2 = "00000000-0000-0000-0000-00000000000c"; // manager, household H2
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const HP = "20000000-0000-0000-0000-000000000001";
const HP_NEW = "20000000-0000-0000-0000-000000000002";

// Thursday 2026-10-02 is "today". Sundays are rest days. 8 to 5 with a
// 12-1 break: 480 minutes a day.
await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${U}'), ('${U2}'), ('${M2}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO user_profiles VALUES ('${U2}', '${H}', 'Rosa Lim', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status,
                               shift_start, shift_end, break_start, break_end, weekly_rest_day, started_on)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE',
            '08:00', '17:00', '12:00', '13:00', 0, '2025-06-01'),
           ('${HP_NEW}', '${U2}', '${H}', 'Rosa', 'Cook', 7000, 'semi_monthly', 'ACTIVE',
            '08:00', '17:00', NULL, NULL, 0, '2026-08-10');
  INSERT INTO ledger_entries (helper_id, duration_minutes) VALUES ('${HP}', 1000);
`);

// --- Building blocks --------------------------------------------------------
await as(M);
check(
  "pay_days_per_year defaults to 365",
  (await one(`SELECT pay_days_per_year FROM helper_profiles WHERE id = $1`, [HP]))
    .pay_days_per_year === 365,
);
await expectError(
  "pay_days_per_year only takes 261, 313 or 365",
  () => q(`UPDATE helper_profiles SET pay_days_per_year = 300 WHERE id = $1`, [HP]),
  /pay_days_per_year_check/,
);
check(
  "Mon to Sun is six working days",
  (await one(`SELECT leave_working_days($1, '2026-10-05', '2026-10-11') AS d`, [HP])).d === 6,
);
check(
  "a day off in kind costs her shift minus her break",
  (await one(`SELECT leave_minutes_per_day($1) AS m`, [HP])).m === 480,
);
check(
  "five SIL days in her second service year",
  (await one(`SELECT sil_balance_days($1) AS d`, [HP])).d === 5,
);
check(
  "no SIL in her first year",
  (await one(`SELECT sil_balance_days($1) AS d`, [HP_NEW])).d === 0,
);
await as(M2);
check(
  "another household can't read her rest days",
  (await one(`SELECT leave_working_days($1, '2026-10-05', '2026-10-11') AS d`, [HP])).d === 0,
);

// --- She asks; the manager decides -----------------------------------------
await as(U);
const sil = await one(
  `SELECT * FROM request_leave($1, 'sil', 'vacation', '2026-10-05', '2026-10-07', 'Uuwi sa probinsya')`,
  [HP],
);
check("a SIL request counts working days", sil.requested_days === 3, sil);
check(
  "a pending request doesn't spend the balance",
  (await one(`SELECT sil_balance_days($1) AS d`, [HP])).d === 5,
);
await expectError(
  "she can't queue more SIL than she has",
  () => q(`SELECT * FROM request_leave($1, 'sil', 'sick', '2026-10-12', '2026-10-14')`, [HP]),
  /Not enough service incentive leave: 2 days left/,
);
await expectError(
  "requests can't overlap",
  () => q(`SELECT * FROM request_leave($1, 'unpaid', 'other', '2026-10-06', '2026-10-06')`, [HP]),
  /overlaps pending leave/,
);
await expectError(
  "the past isn't requestable",
  () => q(`SELECT * FROM request_leave($1, 'unpaid', 'other', '2026-10-01', '2026-10-01')`, [HP]),
  /already passed/,
);
await expectError(
  "a range of only rest days has nothing to take",
  () => q(`SELECT * FROM request_leave($1, 'unpaid', 'other', '2026-10-04', '2026-10-04')`, [HP]),
  /all rest days/,
);
await expectError(
  "SIL can't cross into a new service year",
  () => q(`SELECT * FROM request_leave($1, 'sil', 'vacation', '2027-05-31', '2027-06-02')`, [HP]),
  /new service year starts on 2027-06-01/,
);
await as(U2);
await expectError(
  "SIL waits for her first year",
  () =>
    q(`SELECT * FROM request_leave($1, 'sil', 'vacation', '2026-10-05', '2026-10-05')`, [HP_NEW]),
  /after one year of service \(from 2027-08-10\)/,
);
await expectError(
  "she can't ask on someone else's behalf",
  () => q(`SELECT * FROM request_leave($1, 'unpaid', 'other', '2026-10-20', '2026-10-20')`, [HP]),
  /Only she can ask/,
);
await expectError(
  "no shift hours set means no day off in kind",
  async () => {
    await db.exec(`UPDATE helper_profiles SET shift_end = shift_start WHERE id = '${HP_NEW}'`);
    await q(`SELECT * FROM request_leave($1, 'in_kind', 'other', '2026-10-05', '2026-10-05')`, [
      HP_NEW,
    ]);
  },
  /shift hours are not set/,
);

await as(U);
await expectError(
  "a helper can't decide a request",
  () => q(`SELECT * FROM decide_leave_request($1, 'approved')`, [sil.request_id]),
  /only a manager/,
);
await as(M2);
await expectError(
  "another household's manager can't see it to decide it",
  () => q(`SELECT * FROM decide_leave_request($1, 'approved')`, [sil.request_id]),
  /not found/,
);
await as(M);
await q(`SELECT * FROM decide_leave_request($1, 'approved')`, [sil.request_id]);
check("approving spends SIL", (await one(`SELECT sil_balance_days($1) AS d`, [HP])).d === 2);
await expectError(
  "a decided request can't be decided again",
  () => q(`SELECT * FROM decide_leave_request($1, 'declined')`, [sil.request_id]),
  /already approved/,
);

// --- Days off in kind come out of rest owed ----------------------------------
await as(U);
const inKind = await one(
  `SELECT * FROM request_leave($1, 'in_kind', 'family', '2026-10-20', '2026-10-20')`,
  [HP],
);
check("a day off in kind is 480 minutes", inKind.requested_minutes === 480, inKind);
await expectError(
  "she can't queue more rest than she's owed",
  () => q(`SELECT * FROM request_leave($1, 'in_kind', 'family', '2026-10-21', '2026-10-22')`, [HP]),
  /Not enough rest owed: 1000 minutes available, 480 already requested, 960 more/,
);
await as(M);
await q(`SELECT * FROM decide_leave_request($1, 'approved')`, [inKind.request_id]);
check(
  "rest owed is one number: 1000 less the 480 taken",
  (await one(`SELECT rest_owed_balance_minutes($1) AS m`, [HP])).m === 520,
);

// --- A manager records a sick day after the fact -----------------------------
const sick = await one(
  `SELECT * FROM record_leave($1, 'unpaid', 'sick', '2026-09-28', '2026-09-29', 'Nilagnat')`,
  [HP],
);
const sickRow = await one(`SELECT status, helper_ack FROM leave_requests WHERE id = $1`, [
  sick.request_id,
]);
check(
  "recorded leave is approved at once and waits for her answer",
  sickRow.status === "approved" && sickRow.helper_ack === "pending",
  sickRow,
);
await as(U);
await expectError(
  "only a manager records leave",
  () => q(`SELECT * FROM record_leave($1, 'unpaid', 'sick', '2026-10-27', '2026-10-27')`, [HP]),
  /only a manager can record/,
);
await q(`SELECT * FROM ack_leave($1, 'confirmed')`, [sick.request_id]);
check(
  "she confirms it",
  (await one(`SELECT helper_ack FROM leave_requests WHERE id = $1`, [sick.request_id]))
    .helper_ack === "confirmed",
);
await expectError(
  "there's nothing left to confirm",
  () => q(`SELECT * FROM ack_leave($1, 'disputed')`, [sick.request_id]),
  /nothing to confirm/,
);

// --- Cancelling --------------------------------------------------------------
await expectError(
  "leave that has started can't be cancelled",
  () => q(`SELECT * FROM cancel_leave_request($1)`, [sick.request_id]),
  /already started/,
);
await q(`SELECT * FROM cancel_leave_request($1)`, [sil.request_id]);
check(
  "cancelling approved leave before it starts gives the days back",
  (await one(`SELECT sil_balance_days($1) AS d`, [HP])).d === 5,
);
await as(U2);
await expectError(
  "another helper can't cancel her leave",
  () => q(`SELECT * FROM cancel_leave_request($1)`, [inKind.request_id]),
  /only she or a manager/,
);

// --- Rest off and leave don't double up ----------------------------------------
await db.exec(`
  INSERT INTO rest_off_requests (helper_id, rest_date, start_time, end_time, minutes, status)
  VALUES ('${HP}', '2026-10-27', '13:00', '17:00', 240, 'approved');
`);
await as(U);
await expectError(
  "leave can't cover a day she already has rest off",
  () => q(`SELECT * FROM request_leave($1, 'unpaid', 'other', '2026-10-26', '2026-10-28')`, [HP]),
  /approved rest off on 2026-10-27/,
);

// --- Her session can read, never write -----------------------------------------
await db.exec(`SET ROLE authenticated`);
await as(U);
check(
  "she sees her household's leave",
  (await q(`SELECT id FROM leave_requests WHERE helper_id = $1`, [HP])).length >= 3,
);
await expectError(
  "she can't approve her own leave by writing the row",
  () => q(`UPDATE leave_requests SET status = 'approved' WHERE helper_id = $1`, [HP]),
  /permission denied/,
);
await expectError(
  "she can't insert a row directly",
  () =>
    q(
      `INSERT INTO leave_requests (helper_id, kind, start_date, end_date, days, status)
       VALUES ($1, 'sil', '2026-11-02', '2026-11-06', 5, 'approved')`,
      [HP],
    ),
  /permission denied/,
);
await expectError(
  "the shared rule check isn't callable directly",
  () => q(`SELECT * FROM leave_guard($1, 'sil', '2026-11-02', '2026-11-02', NULL, false)`, [HP]),
  /permission denied/,
);
const viaRpc = await one(
  `SELECT * FROM request_leave($1, 'extra_paid', 'family', '2026-11-02', '2026-11-02')`,
  [HP],
);
check("she can still ask through the function", !!viaRpc.request_id, viaRpc);
await as(M2);
check("another household sees none of it", (await q(`SELECT id FROM leave_requests`)).length === 0);
await db.exec(`RESET ROLE`);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
