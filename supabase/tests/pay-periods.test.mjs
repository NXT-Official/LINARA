// Runs the employment and pay-period migrations against a real Postgres
// (PGlite, in-process) and walks the scenarios they exist for. The schema
// they sit on is a hand-kept minimal copy (base-schema.sql) of what they touch
// -- update it when a migration here starts depending on something new.
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
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`);
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
await db.exec(readFileSync(`${REPO}/add-employment-end.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-pay-periods.sql`, "utf8"));
console.log("migrations applied");

const M = "00000000-0000-0000-0000-00000000000a"; // manager, household H
const U = "00000000-0000-0000-0000-00000000000b"; // helper account
const M2 = "00000000-0000-0000-0000-00000000000c"; // manager, household H2
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const HP = "20000000-0000-0000-0000-000000000001";
const HP_OTHER = "20000000-0000-0000-0000-000000000002";
const HP2 = "20000000-0000-0000-0000-000000000003";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${U}'), ('${M2}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status, created_at, started_on)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE', '2026-08-10 02:00+00', '2026-08-10');
  INSERT INTO helper_profiles (id, household_id, name, station, monthly_rate, payday_interval, status, created_at)
    VALUES ('${HP_OTHER}', '${H}', 'Rosa', 'Cook', 7000, 'semi_monthly', 'ACTIVE', '2026-07-01');
  INSERT INTO tickets (household_id, title, helper_id, status, created_by) VALUES
    ('${H}', 'Laundry', '${HP}', 'todo', '${U}'), ('${H}', 'Dishes', '${HP}', 'done', '${U}'),
    ('${H}', 'Blocked one', '${HP}', 'blocked', '${M}');
  INSERT INTO vales (helper_id, amount, status) VALUES ('${HP}', 500, 'approved'), ('${HP}', 300, 'pending');
  INSERT INTO helper_notes (helper_id, text) VALUES ('${HP}', 'my private note');
`);

// --- Pay periods ------------------------------------------------------------
await as(M);
let periods = await q(`SELECT * FROM helper_pay_periods($1)`, [HP]);
check("five periods since Aug 10", periods.length === 5, periods.map((p) => [p.full_start, p.worked_start]));
check("first period starts on her first day", String(periods[0].worked_start).startsWith("2026-08-10") || periods[0].worked_start?.toISOString?.().startsWith("2026-08-10"), periods[0].worked_start);
check("last period is current", periods[4].is_current === true);

// A legacy payslip keyed on the FULL Aug 1-15 bounds still settles the period.
await db.exec(`INSERT INTO payslips (helper_id, cutoff_start, cutoff_end, base_pay, statutory_employee_share, net_pay, payout_channel_code, payout_status)
  VALUES ('${HP}', '2026-08-01', '2026-08-15', 4000, 187.5, 3812.5, 'PH_GCASH', 'succeeded')`);
periods = await q(`SELECT * FROM helper_pay_periods($1)`, [HP]);
check("legacy full-bounds payslip settles the partial first period", periods[0].payslip_id !== null);

// --- Pay a missed period outside Linara ---------------------------------------
const cash = await one(
  `SELECT * FROM record_offapp_payslip($1, 4000, 187.5, 'CASH', '2026-09-16', 'handed over', '2026-09-01')`,
  [HP],
);
check("cash payment recorded for Sep 1-15 with the vale taken", Number(cash.net_pay) === 3312.5, cash);
const vale = await one(`SELECT settled_in_payslip_id FROM vales WHERE amount = 500`);
check("approved vale settled by the cash record", vale.settled_in_payslip_id === cash.payslip_id);
await expectError("same period can't be paid again by GCash",
  () => q(`SELECT * FROM initiate_payslip($1, 4000, 187.5, 'PH_GCASH', '2026-09-01')`, [HP]), /already exists/);
await expectError("future-dated cash payment refused",
  () => q(`SELECT * FROM record_offapp_payslip($1, 4000, 187.5, 'CASH', '2027-01-01', null, '2026-09-16')`, [HP]), /today or earlier/);
await expectError("Xendit can't be told to pay by CASH",
  () => q(`SELECT * FROM initiate_payslip($1, 4000, 187.5, 'CASH', '2026-09-16')`, [HP]), /GCash or Maya/);

// --- Pay a missed period through Xendit --------------------------------------
const xendit = await one(`SELECT * FROM initiate_payslip($1, 4000, 187.5, 'PH_GCASH', '2026-09-16')`, [HP]);
check("GCash payout created for the missed Sep 16-30", Boolean(xendit.attempt_id), { start: xendit.cutoff_start, end: xendit.cutoff_end });
await db.exec(`UPDATE payslips SET payout_status = 'succeeded' WHERE id = '${xendit.payslip_id}'`);

// --- Her confirmation --------------------------------------------------------
await as(M);
await expectError("manager can't confirm on her behalf",
  () => q(`SELECT acknowledge_offapp_payslip($1, true)`, [cash.payslip_id]), /not found/);
await as(U);
const disputed = await one(`SELECT acknowledge_offapp_payslip($1, false, 'kulang ng 500') AS s`, [cash.payslip_id]);
check("she can dispute a cash record", disputed.s === "disputed");
await as(M);
await q(`SELECT withdraw_offapp_payslip($1)`, [cash.payslip_id]);
const released = await one(`SELECT settled_in_payslip_id FROM vales WHERE amount = 500`);
check("withdrawing the disputed record releases its vale", released.settled_in_payslip_id === null);
const again = await one(`SELECT * FROM record_offapp_payslip($1, 4000, 187.5, 'BANK_TRANSFER', '2026-09-17', null, '2026-09-01')`, [HP]);
await as(U);
await q(`SELECT acknowledge_offapp_payslip($1, true)`, [again.payslip_id]);
await as(M);
await expectError("a confirmed record can't be withdrawn",
  () => q(`SELECT withdraw_offapp_payslip($1)`, [again.payslip_id]), /confirmed/);

// Aug 16-31 is left unpaid on purpose.
periods = await q(`SELECT * FROM helper_pay_periods($1)`, [HP]);
const unpaid = periods.filter((p) => !p.payslip_id && !p.is_current);
check("exactly one missed period left (Aug 16-31)", unpaid.length === 1, unpaid.map((p) => p.full_start));

// --- Her notice, then ending ---------------------------------------------------
await as(U);
await expectError("notice can't be in the past",
  () => q(`SELECT give_notice($1, '2026-01-01')`, [HP]), /today or later/);
await q(`SELECT give_notice($1, (now() AT TIME ZONE 'Asia/Manila')::date, 'Uuwi sa probinsya')`, [HP]);
const notice = await one(`SELECT notice_last_day, notice_note FROM helper_profiles WHERE id = $1`, [HP]);
check("notice recorded", notice.notice_note === "Uuwi sa probinsya");

await as(M);
const preview = await one(`SELECT employment_end_preview($1, (now() AT TIME ZONE 'Asia/Manila')::date) AS p`, [HP]);
check("preview counts the missed period", preview.p.unpaid_periods === 1, preview.p);
check("preview has no problem", preview.p.problem === null, preview.p.problem);
const ended = await one(`SELECT end_helper_employment($1, (now() AT TIME ZONE 'Asia/Manila')::date, $2) AS r`, [HP, HP_OTHER]);
check("two open tasks moved to Rosa", ended.r.tasks_moved === 2, ended.r);
const after = await one(`SELECT status, notice_last_day FROM helper_profiles WHERE id = $1`, [HP]);
check("INACTIVE and the notice cleared", after.status === "INACTIVE" && after.notice_last_day === null, after);
check("pending vale declined", (await one(`SELECT status FROM vales WHERE amount = 300`)).status === "declined");
check("her account detached", (await one(`SELECT household_id FROM user_profiles WHERE id = $1`, [U])).household_id === null);

// Final pay, then the missed period, still payable after she left.
const finalPay = await one(`SELECT * FROM initiate_payslip($1, 266.67, 12.5, 'PH_GCASH')`, [HP]);
check("final pay targets the shortened final cutoff", Boolean(finalPay.payslip_id), { start: finalPay.cutoff_start, end: finalPay.cutoff_end });
const missed = await one(`SELECT * FROM record_offapp_payslip($1, 4000, 187.5, 'CASH', '2026-09-01', null, '2026-08-16')`, [HP]);
check("a missed period is still payable after she left", Boolean(missed.payslip_id));

// --- 13th-month ----------------------------------------------------------------
await db.exec(`UPDATE payslips SET payout_status = 'succeeded' WHERE id = '${finalPay.payslip_id}'`);
const t13 = await one(`SELECT * FROM thirteenth_month_due($1)`, [HP]);
check("13th-month payable once she has left", t13.payable === true, t13);
const t13pay = await one(`SELECT * FROM initiate_payslip($1, 1, 1, 'PH_PAYMAYA', null, 'thirteenth_month')`, [HP]);
check("13th-month amount is Postgres's own, with nothing deducted", Number(t13pay.net_pay) === Number(t13.amount), { net: t13pay.net_pay, due: t13.amount });
await expectError("13th-month can't be paid twice",
  () => q(`SELECT * FROM record_offapp_payslip($1, 0, 0, 'CASH', '2026-09-30', null, null, 'thirteenth_month')`, [HP]), /payable/);

await db.exec(`INSERT INTO payslips (helper_id, cutoff_start, cutoff_end, base_pay, statutory_employee_share, net_pay, payout_channel_code, payout_status)
  VALUES ('${HP_OTHER}', '2026-09-01', '2026-09-15', 3500, 187.5, 3312.5, 'PH_GCASH', 'succeeded')`);
const rosa13 = await one(`SELECT * FROM thirteenth_month_due($1)`, [HP_OTHER]);
check("13th-month isn't payable before December while she's employed", rosa13.payable === false && Number(rosa13.amount) > 0, rosa13);
await expectError("so it can't be paid early",
  () => q(`SELECT * FROM initiate_payslip($1, 1, 1, 'PH_GCASH', null, 'thirteenth_month')`, [HP_OTHER]), /payable/);
await expectError("a period before she joined Linara isn't payable",
  () => q(`SELECT * FROM initiate_payslip($1, 1, 1, 'PH_GCASH', '2026-05-01')`, [HP_OTHER]), /No such pay period/);

// --- Her side after leaving -------------------------------------------------------
await as(U);
periods = await q(`SELECT * FROM helper_pay_periods($1)`, [HP]);
check("she can still read her pay periods", periods.length > 0);
await db.exec(`SET ROLE authenticated`);
const mine = await q(`SELECT id FROM payslips`);
check("she can read her old household's payslips", mine.length >= 4, mine.length);
const hh = await q(`SELECT name FROM households`);
check("and its name", hh.some((h) => h.name === "Reyes Household"));
const others = await q(`SELECT id FROM helper_profiles`);
check("but not Rosa's employment", others.length === 1, others.length);
const board = await q(`SELECT title FROM tickets`);
check("and only her own tasks, not the board", board.every((t) => t.title === "Dishes"), board);
await db.exec(`RESET ROLE`);

// --- Rejoin a new household ------------------------------------------------------
await as(M2);
await db.exec(`INSERT INTO helper_profiles (id, household_id, name, station, monthly_rate, payday_interval, status, invite_code)
  VALUES ('${HP2}', '${H2}', 'Marites', 'House', 9000, 'monthly', 'PENDING_CLAIM', 'NEW123')`);
await as(U);
const joined = await one(`SELECT * FROM join_household_with_invite('NEW123')`);
check("joined the new household", joined.helper_id === HP2 && joined.household_id === H2, joined);
await expectError("can't join a second one while employed",
  () => q(`SELECT * FROM join_household_with_invite('NEW123')`), /still employed|not found/);
await db.exec(`SET ROLE authenticated`);
const notes = await q(`SELECT text FROM helper_notes`);
check("her notes still read with two employments", notes.length === 1, notes);
await db.exec(`RESET ROLE`);

// --- Manager of the old household ---------------------------------------------------
await as(M);
await db.exec(`SET ROLE authenticated`);
const name = await q(`SELECT full_name FROM user_profiles WHERE id = $1`, [U]);
check("old manager still reads her name (for 'from [name]')", name.length === 1, name);
const notes2 = await q(`SELECT text FROM helper_notes`);
check("but never her notes", notes2.length === 0);
await db.exec(`RESET ROLE`);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
