// Runs add-unpaid-leave-pay.sql against a real Postgres (PGlite) on top of
// the pay-period and leave migrations, and walks what it exists for: unpaid
// leave coming off the payslip for the cutoff it ends in, once, released
// again when a payout fails or a record is withdrawn, and out of 13th-month
// pay. LEAVE_PLAN.md step 5.
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
const settledIn = async (leaveId) =>
  (await one(`SELECT settled_in_payslip_id FROM leave_requests WHERE id = $1`, [leaveId]))
    .settled_in_payslip_id;

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
await db.exec(readFileSync(`${REPO}/add-employment-end.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-pay-periods.sql`, "utf8"));
// What add-leave.sql and record_payout_attempt_result read beyond those, as in
// leave.test.mjs, plus the attempt columns add-payout-attempts.sql has live.
await db.exec(`
  ALTER TABLE helper_profiles ADD COLUMN break_start TIME, ADD COLUMN break_end TIME;
  ALTER TABLE rest_off_requests ADD COLUMN start_time TIME, ADD COLUMN end_time TIME;
  ALTER TABLE payout_attempts ADD COLUMN psp_payout_id TEXT, ADD COLUMN failure_reason TEXT,
    ADD COLUMN resolved_at TIMESTAMPTZ;
  CREATE FUNCTION public.household_today() RETURNS DATE LANGUAGE sql STABLE AS
  $$ SELECT '2026-10-02'::date $$;
  GRANT EXECUTE ON FUNCTION public.household_today() TO authenticated;
`);
await db.exec(readFileSync(`${REPO}/add-leave.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-unpaid-leave-pay.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-unpaid-leave-pay.sql`, "utf8"));
console.log("migrations applied (unpaid-leave pay twice)");

const M = "00000000-0000-0000-0000-00000000000a"; // manager, household H
const U = "00000000-0000-0000-0000-00000000000b"; // Marites's account
const M2 = "00000000-0000-0000-0000-00000000000c"; // manager, household H2
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const HP = "20000000-0000-0000-0000-000000000001"; // Marites, ₱8,000, Sundays off
const HP_ROSA = "20000000-0000-0000-0000-000000000002"; // Rosa, ₱7,000, left Sep 10
const L_SEP3 = "30000000-0000-0000-0000-000000000001";
const L_SPAN = "30000000-0000-0000-0000-000000000002";
const L_PENDING = "30000000-0000-0000-0000-000000000003";
const L_SIL = "30000000-0000-0000-0000-000000000004";
const L_LATER = "30000000-0000-0000-0000-000000000005";
const L_ROSA = "30000000-0000-0000-0000-000000000006";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${U}'), ('${M2}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status, created_at, started_on, weekly_rest_day)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE', '2026-08-01 02:00+00', '2026-08-01', 0),
           ('${HP_ROSA}', NULL, '${H}', 'Rosa', 'Cook', 7000, 'semi_monthly', 'ACTIVE', '2026-08-01 02:00+00', '2026-08-01', 0);
  INSERT INTO vales (helper_id, amount, status) VALUES ('${HP}', 500, 'approved');
  -- Thu-Fri Sep 3-4 (2 days); Mon-Thu Sep 14-17 across the 15th (4 days);
  -- one still pending, a paid SIL day, and unpaid leave in October.
  INSERT INTO leave_requests (id, helper_id, kind, reason, start_date, end_date, days, status) VALUES
    ('${L_SEP3}', '${HP}', 'unpaid', 'family', '2026-09-03', '2026-09-04', 2, 'approved'),
    ('${L_SPAN}', '${HP}', 'unpaid', 'vacation', '2026-09-14', '2026-09-17', 4, 'approved'),
    ('${L_PENDING}', '${HP}', 'unpaid', 'other', '2026-09-08', '2026-09-08', 1, 'pending'),
    ('${L_SIL}', '${HP}', 'sil', 'sick', '2026-09-09', '2026-09-09', 1, 'approved'),
    ('${L_LATER}', '${HP}', 'unpaid', 'vacation', '2026-10-20', '2026-10-20', 1, 'approved'),
    -- Rosa: Wed Sep 9 to Sat Sep 12, but her last day was the 10th.
    ('${L_ROSA}', '${HP_ROSA}', 'unpaid', 'family', '2026-09-09', '2026-09-12', 4, 'approved');
`);

await db.exec(`SET ROLE authenticated`);
await as(M);

// --- What a cutoff takes ------------------------------------------------------
let due = await one(`SELECT * FROM unpaid_leave_due($1, '2026-09-15')`, [HP]);
check(
  "Sep 1-15 takes the leave that ended in it: 2 days at 8000 x 12 / 365",
  due.leave_days === 2 && Number(due.deduction) === 526.03,
  due,
);
due = await one(`SELECT * FROM unpaid_leave_due($1, '2026-09-30')`, [HP]);
check(
  "by Sep 30 the leave across the 15th is due too, not pending, SIL or October's",
  due.leave_days === 6,
  due,
);

// --- Paid outside Linara ------------------------------------------------------
const cash = await one(
  `SELECT * FROM record_offapp_payslip($1, 4000, 187.5, 'CASH', '2026-09-16', null, '2026-09-01')`,
  [HP],
);
check(
  "cash for Sep 1-15: 4000 - 187.5 - 500 vale - 526.03 leave",
  Number(cash.net_pay) === 2786.47,
  cash,
);
let slip = await one(
  `SELECT unpaid_leave_days, unpaid_leave_deduction FROM payslips WHERE id = $1`,
  [cash.payslip_id],
);
check(
  "the payslip keeps the days and pesos",
  slip.unpaid_leave_days === 2 && Number(slip.unpaid_leave_deduction) === 526.03,
  slip,
);
check("that leave is settled by it", (await settledIn(L_SEP3)) === cash.payslip_id);
check("the leave across the 15th waits for its own cutoff", (await settledIn(L_SPAN)) === null);

// --- Paid through Linara, then failed -----------------------------------------
const xendit = await one(
  `SELECT * FROM initiate_payslip($1, 4000, 187.5, 'PH_GCASH', '2026-09-16')`,
  [HP],
);
check(
  "Sep 16-30 takes the whole 4 days, once: 4000 - 187.5 - 1052.05",
  Number(xendit.unpaid_leave_deduction) === 1052.05 && Number(xendit.net_pay) === 2760.45,
  xendit,
);
check("settled by that payslip", (await settledIn(L_SPAN)) === xendit.payslip_id);
check("October's leave is left for October", (await settledIn(L_LATER)) === null);

await q(`SELECT * FROM record_payout_attempt_result($1, 'failed', null, 'Invalid account')`, [
  xendit.attempt_id,
]);
check("a failed payout releases its leave", (await settledIn(L_SPAN)) === null);
check("and leaves the other payslip's alone", (await settledIn(L_SEP3)) === cash.payslip_id);

const retry = await one(
  `SELECT * FROM initiate_payslip($1, 4000, 187.5, 'PH_GCASH', '2026-09-16')`,
  [HP],
);
check(
  "the retry takes it again, on the same payslip",
  retry.payslip_id === xendit.payslip_id && Number(retry.unpaid_leave_deduction) === 1052.05,
  retry,
);

// --- Withdrawn ------------------------------------------------------------------
await q(`SELECT withdraw_offapp_payslip($1)`, [cash.payslip_id]);
check("withdrawing the cash record releases its leave", (await settledIn(L_SEP3)) === null);

// --- The divisor -----------------------------------------------------------------
await q(`UPDATE helper_profiles SET pay_days_per_year = 313 WHERE id = $1`, [HP]);
due = await one(`SELECT * FROM unpaid_leave_due($1, '2026-09-15')`, [HP]);
check("a six-day week divides by 313", Number(due.deduction) === 613.42, due);
await q(`UPDATE helper_profiles SET pay_days_per_year = 365 WHERE id = $1`, [HP]);

// --- 13th month ------------------------------------------------------------------
await q(
  `SELECT * FROM record_offapp_payslip($1, 4000, 187.5, 'CASH', '2026-09-16', null, '2026-09-01')`,
  [HP],
);
await q(`SELECT * FROM record_payout_attempt_result($1, 'succeeded')`, [retry.attempt_id]);
const thirteenth = await one(`SELECT * FROM thirteenth_month_due($1, 2026)`, [HP]);
check(
  "13th month counts basic pay earned: (4000 - 526.03) + (4000 - 1052.05)",
  Number(thirteenth.basic_earned) === 6421.92,
  thirteenth,
);

// --- Final pay -------------------------------------------------------------------
await db.exec(`RESET ROLE`);
await db.exec(
  `UPDATE helper_profiles SET status = 'INACTIVE', ended_on = '2026-09-10' WHERE id = '${HP_ROSA}'`,
);
await db.exec(`SET ROLE authenticated`);
due = await one(`SELECT * FROM unpaid_leave_due($1, '2026-09-10', true)`, [HP_ROSA]);
check(
  "her final cutoff takes leave running past her last day, up to it: Sep 9-10",
  due.leave_days === 2 && Number(due.deduction) === 460.27,
  due,
);
due = await one(`SELECT * FROM unpaid_leave_due($1, '2026-09-10')`, [HP_ROSA]);
check("an ordinary cutoff ending the 10th wouldn't", due.leave_days === 0, due);
const final = await one(`SELECT * FROM initiate_payslip($1, 2333.33, 0, 'PH_GCASH')`, [HP_ROSA]);
check(
  "final pay through Linara takes it and settles it",
  Number(final.unpaid_leave_deduction) === 460.27 && (await settledIn(L_ROSA)) === final.payslip_id,
  final,
);

// --- Ending an employment previews it ----------------------------------------------
const preview = await one(`SELECT employment_end_preview($1, '2026-10-02') AS p`, [HP]);
check(
  "the end-employment preview shows what final pay would take",
  preview.p.unpaid_leave_days === 0 && Number(preview.p.base_paid_this_year) === 6421.92,
  preview.p,
);

// --- Who may ask ---------------------------------------------------------------------
await as(U);
due = await one(`SELECT * FROM unpaid_leave_due($1, '2026-10-31')`, [HP]);
check("she can see what her own pay will take", due.leave_days === 1, due);
await expectError(
  "but not call the internal list",
  () => q(`SELECT * FROM unpaid_leave_for_cutoff($1, '2026-10-31', false)`, [HP]),
  /permission denied/,
);
await as(M2);
await expectError(
  "another household's manager can't see it",
  () => q(`SELECT * FROM unpaid_leave_due($1, '2026-10-31')`, [HP]),
  /Forbidden/,
);

await db.exec(`RESET ROLE`);
console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
