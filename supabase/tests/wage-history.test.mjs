// Runs add-wage-history.sql against a real Postgres (PGlite) on top of the
// pay-period and unpaid-leave migrations, and walks what it exists for: a
// wage change starts at this cutoff or the next, and every closed period,
// paid or not, keeps the wage it had (KNOWN_GAPS.md O50).
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
const ymd = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
await db.exec(`ALTER TABLE payslips DROP COLUMN payout_reference_id`);
await db.exec(readFileSync(`${REPO}/add-employment-end.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-pay-periods.sql`, "utf8"));
// What add-leave.sql and add-unpaid-leave-pay.sql read beyond those, as in
// unpaid-leave-pay.test.mjs.
await db.exec(`
  ALTER TABLE helper_profiles ADD COLUMN break_start TIME, ADD COLUMN break_end TIME;
  ALTER TABLE rest_off_requests ADD COLUMN start_time TIME, ADD COLUMN end_time TIME;
  ALTER TABLE payout_attempts ADD COLUMN psp_payout_id TEXT, ADD COLUMN failure_reason TEXT,
    ADD COLUMN resolved_at TIMESTAMPTZ;
  CREATE FUNCTION public.household_today() RETURNS DATE LANGUAGE sql STABLE AS
  $$ SELECT (now() AT TIME ZONE 'Asia/Manila')::date $$;
  GRANT EXECUTE ON FUNCTION public.household_today() TO authenticated;
`);
await db.exec(readFileSync(`${REPO}/add-leave.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-unpaid-leave-pay.sql`, "utf8"));

const M = "00000000-0000-0000-0000-00000000000a"; // primary manager, household H
const C = "00000000-0000-0000-0000-00000000000d"; // co-manager, household H
const U = "00000000-0000-0000-0000-00000000000b"; // Marites's account
const M2 = "00000000-0000-0000-0000-00000000000c"; // manager, household H2
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const HP = "20000000-0000-0000-0000-000000000001"; // Marites, ₱8,000 since Aug 1
const HP_NEW = "20000000-0000-0000-0000-000000000002"; // an invite, added later

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${C}'), ('${U}'), ('${M2}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${C}', '${H}', 'Lia Reyes', 'co_manager', now());
  INSERT INTO user_profiles VALUES ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status, created_at, started_on, weekly_rest_day)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE', '2026-08-01 02:00+00', '2026-08-01', 0);
  -- Thu-Fri Sep 3-4: unpaid leave that comes off Sep 1-15.
  INSERT INTO leave_requests (helper_id, kind, reason, start_date, end_date, days, status)
    VALUES ('${HP}', 'unpaid', 'family', '2026-09-03', '2026-09-04', 2, 'approved');
`);

await db.exec(readFileSync(`${REPO}/add-wage-history.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-wage-history.sql`, "utf8"));
console.log("migrations applied (wage history twice)");

const rows = await q(
  `SELECT effective_from, monthly_rate FROM helper_wage_rates WHERE helper_id = $1`,
  [HP],
);
check(
  "her wage today is filled in once, from her first day",
  rows.length === 1 &&
    ymd(rows[0].effective_from) === "2026-08-01" &&
    Number(rows[0].monthly_rate) === 8000,
  rows,
);

const bounds = await one(
  `SELECT cutoff_start, cutoff_end FROM cutoff_bounds_for((now() AT TIME ZONE 'Asia/Manila')::date, 'semi_monthly')`,
);
const thisCutoff = ymd(bounds.cutoff_start);
const nextCutoff = ymd((await one(`SELECT ($1::date + 1) AS d`, [ymd(bounds.cutoff_end)])).d);

const periods = async () =>
  (await q(`SELECT full_start, is_current, monthly_rate FROM helper_pay_periods($1)`, [HP])).map(
    (p) => ({ start: ymd(p.full_start), current: p.is_current, rate: Number(p.monthly_rate) }),
  );
const closedRates = async () => [
  ...new Set((await periods()).filter((p) => !p.current).map((p) => p.rate)),
];
const currentRate = async () => (await periods()).find((p) => p.current)?.rate;

await db.exec(`SET ROLE authenticated`);
await as(M);

// --- A raise from the next cutoff ------------------------------------------------
let set = await one(`SELECT * FROM set_helper_wage($1, 9000, $2)`, [HP, nextCutoff]);
check("a raise can start at the next cutoff", ymd(set.effective_from) === nextCutoff, set);
check(
  "closed periods keep ₱8,000",
  JSON.stringify(await closedRates()) === "[8000]",
  await closedRates(),
);
check("the open one too, until the next cutoff", (await currentRate()) === 8000);
check(
  "the next cutoff is at ₱9,000",
  Number((await one(`SELECT helper_rate_on($1, $2) AS r`, [HP, nextCutoff])).r) === 9000,
);
check(
  "her profile shows the newest agreed wage",
  Number(
    (await one(`SELECT monthly_rate FROM helper_profiles WHERE id = $1`, [HP])).monthly_rate,
  ) === 9000,
);

// --- Changed again, from this cutoff --------------------------------------------
await as(C);
set = await one(`SELECT * FROM set_helper_wage($1, 10000)`, [HP]);
check(
  "a co-manager can too; no date means this cutoff",
  ymd(set.effective_from) === thisCutoff,
  set,
);
check("the open period is now ₱10,000", (await currentRate()) === 10000);
check(
  "closed ones still ₱8,000",
  JSON.stringify(await closedRates()) === "[8000]",
  await closedRates(),
);
check(
  "the change planned for next cutoff gave way",
  Number((await one(`SELECT helper_rate_on($1, $2) AS r`, [HP, nextCutoff])).r) === 10000,
);

const leave = await one(`SELECT * FROM unpaid_leave_due($1, '2026-09-15')`, [HP]);
check(
  "September's unpaid leave is at September's wage: 2 x 8000 x 12 / 365",
  Number(leave.deduction) === 526.03,
  leave,
);

await expectError(
  "a wage can't start on a closed period",
  () => q(`SELECT * FROM set_helper_wage($1, 12000, '2026-09-01')`, [HP]),
  /this cutoff .* or the next one/,
);
await expectError(
  "nor be zero",
  () => q(`SELECT * FROM set_helper_wage($1, 0)`, [HP]),
  /Enter the monthly wage/,
);

// --- Who can't --------------------------------------------------------------------
await as(M2);
await expectError(
  "another household's manager can't",
  () => q(`SELECT * FROM set_helper_wage($1, 1, $2)`, [HP, nextCutoff]),
  /Only this household/,
);
check(
  "nor read her wages",
  (await q(`SELECT * FROM helper_wage_rates WHERE helper_id = $1`, [HP])).length === 0,
);
await as(U);
await expectError(
  "she can't set her own",
  () => q(`SELECT * FROM set_helper_wage($1, 50000, $2)`, [HP, nextCutoff]),
  /Only this household/,
);
check(
  "but she sees her wage on each period",
  (await currentRate()) === 10000 && JSON.stringify(await closedRates()) === "[8000]",
);
await expectError(
  "and can't write the history directly",
  () =>
    q(
      `INSERT INTO helper_wage_rates (helper_id, effective_from, monthly_rate) VALUES ($1, '2026-08-01', 99999)`,
      [HP],
    ),
  /permission denied/,
);

// --- Once this cutoff is paid --------------------------------------------------------
await db.exec(`RESET ROLE`);
await db.exec(`INSERT INTO payslips (helper_id, cutoff_start, cutoff_end, base_pay, statutory_employee_share, net_pay, payout_channel_code, payout_status)
  VALUES ('${HP}', '${thisCutoff}', '${ymd(bounds.cutoff_end)}', 5000, 200, 4800, 'CASH', 'succeeded')`);
await db.exec(`SET ROLE authenticated`);
await as(M);
await expectError(
  "a paid cutoff can't be re-priced",
  () => q(`SELECT * FROM set_helper_wage($1, 11000)`, [HP]),
  /already paid/,
);
set = await one(`SELECT * FROM set_helper_wage($1, 11000, $2)`, [HP, nextCutoff]);
check("the next cutoff still can", ymd(set.effective_from) === nextCutoff, set);

// --- A write around set_helper_wage ---------------------------------------------------
await db.exec(`RESET ROLE`);
await db.exec(`UPDATE helper_profiles SET monthly_rate = 7000 WHERE id = '${HP}'`);
await db.exec(`SET ROLE authenticated`);
check(
  "is kept as a change from the open cutoff, not a rewrite of the past",
  (await currentRate()) === 7000 && JSON.stringify(await closedRates()) === "[8000]",
  await periods(),
);
await db.exec(`RESET ROLE`);

// --- An invite, before she claims it -----------------------------------------------------
await db.exec(`INSERT INTO helper_profiles (id, household_id, name, station, monthly_rate, payday_interval, status, invite_code)
  VALUES ('${HP_NEW}', '${H}', 'Rosa', 'Cook', 7500, 'semi_monthly', 'PENDING_CLAIM', 'ROSA01')`);
await db.exec(`SET ROLE authenticated`);
await as(M);
let invite = await q(`SELECT monthly_rate FROM helper_wage_rates WHERE helper_id = $1`, [HP_NEW]);
check(
  "a new helper gets her first wage",
  invite.length === 1 && Number(invite[0].monthly_rate) === 7500,
  invite,
);
await q(`SELECT * FROM set_helper_wage($1, 7800)`, [HP_NEW]);
invite = await q(`SELECT monthly_rate FROM helper_wage_rates WHERE helper_id = $1`, [HP_NEW]);
check(
  "changing an unclaimed invite's wage just replaces it",
  invite.length === 1 && Number(invite[0].monthly_rate) === 7800,
  invite,
);
await db.exec(`RESET ROLE`);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
