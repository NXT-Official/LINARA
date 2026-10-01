// The nightly Quick Utos purge (add-nightly-utos-purge.sql) and account
// deletion (add-account-deletion.sql), against PGlite on base-schema.sql.
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

const read = (f) => readFileSync(`${REPO}/${f}`, "utf8");
await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
await db.exec(read("add-employment-end.sql"));
await db.exec(read("add-pay-periods.sql"));
// PGlite has no pg_cron: apply the function, not the schedule.
await db.exec(read("add-nightly-utos-purge.sql").split("-- @schedule")[0]);
await db.exec(read("add-account-deletion.sql"));
await db.exec(read("add-unassigned-tasks.sql"));
console.log("migrations applied");

const M = "00000000-0000-0000-0000-00000000000a"; // manager, Manila household
const U = "00000000-0000-0000-0000-00000000000b"; // helper, employed by M
const M2 = "00000000-0000-0000-0000-00000000000c"; // manager, Dubai household, nobody ever hired
const U2 = "00000000-0000-0000-0000-00000000000d"; // helper, left M's household
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const HP = "20000000-0000-0000-0000-000000000001";
const HP2 = "20000000-0000-0000-0000-000000000002";
const HP_INVITE = "20000000-0000-0000-0000-000000000003";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${U}'), ('${M2}'), ('${U2}');
  INSERT INTO households (id, name, timezone) VALUES ('${H}', 'Reyes Household', 'Asia/Manila'),
    ('${H2}', 'Cruz Household', 'Asia/Dubai');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO user_profiles VALUES ('${U2}', NULL, 'Rosa Dela Cruz', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE'),
           ('${HP2}', '${U2}', '${H}', 'Rosa', 'Cook', 7000, 'semi_monthly', 'INACTIVE');
  INSERT INTO helper_profiles (id, household_id, name, station, monthly_rate, payday_interval, status, invite_code)
    VALUES ('${HP_INVITE}', '${H}', 'New one', 'House', 7000, 'monthly', 'PENDING_CLAIM', 'ABC123');
  INSERT INTO tickets (household_id, title, helper_id, status, created_by) VALUES
    ('${H}', 'Laundry', '${HP2}', 'done', '${U2}'), ('${H}', 'Dishes', '${HP}', 'todo', '${M}');
  INSERT INTO payslips (helper_id, cutoff_start, cutoff_end, base_pay, statutory_employee_share, net_pay, payout_channel_code, payout_status, requested_by)
    VALUES ('${HP2}', '2026-08-01', '2026-08-15', 3500, 150, 3350, 'PH_GCASH', 'succeeded', '${M}');
  INSERT INTO helper_notes (helper_id, text) VALUES ('${HP2}', 'Rosa''s note'), ('${HP}', 'Marites'' note');
  INSERT INTO appointments (household_id, title) VALUES ('${H}', 'Pediatrician');
`);

// --- Unassigned tasks ---------------------------------------------------------------
await db.exec(
  `INSERT INTO tickets (household_id, title, helper_id) VALUES ('${H}', 'Wash the car', NULL)`,
);
check(
  "a task can have no helper yet",
  (await q(`SELECT 1 FROM tickets WHERE helper_id IS NULL`)).length === 1,
);
await db.exec(`UPDATE tickets SET helper_id = '${HP}' WHERE title = 'Wash the car'`);
check(
  "and be assigned later",
  (await one(`SELECT helper_id FROM tickets WHERE title = 'Wash the car'`)).helper_id === HP,
);

// --- Nightly utos purge -------------------------------------------------------------
// Each household's midnight is its own: a uto from just before Manila's midnight
// is stale in Manila; one from just after Dubai's midnight is today's in Dubai.
const manilaMidnight = (
  await one(
    `SELECT date_trunc('day', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila' AS t`,
  )
).t;
await db.exec(`
  INSERT INTO quick_utos (recipient_id, content, created_at) VALUES
    ('${HP}', 'yesterday', '${manilaMidnight.toISOString()}'::timestamptz - interval '1 minute'),
    ('${HP}', 'today', '${manilaMidnight.toISOString()}'::timestamptz + interval '1 minute'),
    ('${HP}', 'just now', now());
`);
const purged = (await one(`SELECT purge_stale_quick_utos() AS n`)).n;
const left = (await q(`SELECT content FROM quick_utos ORDER BY content`)).map((r) => r.content);
check("purges the uto from before the household's midnight", purged === 1, purged);
check("keeps today's", left.join() === "just now,today", left);
check(
  "running it again deletes nothing",
  (await one(`SELECT purge_stale_quick_utos() AS n`)).n === 0,
);

await as(M);
await db.exec(`SET ROLE authenticated`);
await expectError(
  "an app user can't run the purge",
  () => q(`SELECT purge_stale_quick_utos()`),
  /permission denied/,
);
await expectError(
  "or process a deletion",
  () => q(`SELECT process_account_deletion($1)`, [U2]),
  /permission denied/,
);
await db.exec(`RESET ROLE`);

// --- Requesting deletion ------------------------------------------------------------
await as(U2);
await db.exec(`SET ROLE authenticated`);
const req = await one(`SELECT * FROM request_account_deletion('moving abroad')`);
check("she can request deletion", req.status === "pending" && req.user_type === "helper", req);
const again = await one(`SELECT * FROM request_account_deletion(NULL)`);
check("asking twice keeps one request", again.id === req.id);
check(
  "she can read her request",
  (await q(`SELECT id FROM account_deletion_requests`)).length === 1,
);
await expectError(
  "but can't mark it done herself",
  () => q(`UPDATE account_deletion_requests SET status = 'done'`),
  /permission denied/,
);
await db.exec(`SELECT cancel_account_deletion()`);
check(
  "she can withdraw it",
  (await one(`SELECT status FROM account_deletion_requests WHERE id = $1`, [req.id])).status ===
    "cancelled",
);
await one(`SELECT * FROM request_account_deletion(NULL)`);
await as(M);
check(
  "a manager can't see her request",
  (await q(`SELECT id FROM account_deletion_requests`)).length === 0,
);
await db.exec(`RESET ROLE`);

// --- Processing: a helper who has left -------------------------------------------------
const done = await one(`SELECT process_account_deletion($1) AS r`, [U2]);
check("processed", done.r.user_type === "helper" && done.r.private_notes_deleted === 1, done.r);
check("her login is gone", (await q(`SELECT 1 FROM auth.users WHERE id = $1`, [U2])).length === 0);
check("and her profile", (await q(`SELECT 1 FROM user_profiles WHERE id = $1`, [U2])).length === 0);
check(
  "her private notes are gone",
  (await q(`SELECT 1 FROM helper_notes WHERE helper_id = $1`, [HP2])).length === 0,
);
check(
  "Marites' notes are untouched",
  (await q(`SELECT 1 FROM helper_notes WHERE helper_id = $1`, [HP])).length === 1,
);
const emp = await one(`SELECT user_id, name FROM helper_profiles WHERE id = $1`, [HP2]);
check("the household keeps her employment record, unlinked", emp && emp.user_id === null, emp);
check(
  "and its payslips",
  (await q(`SELECT 1 FROM payslips WHERE helper_id = $1`, [HP2])).length === 1,
);
const laundry = await one(`SELECT created_by FROM tickets WHERE title = 'Laundry'`);
check("tasks she created stay, without her name", laundry && laundry.created_by === null, laundry);
const reqDone = await one(
  `SELECT status, note FROM account_deletion_requests WHERE user_id = $1 AND status = 'done'`,
  [U2],
);
check("the request is marked done, note cleared", reqDone && reqDone.note === null, reqDone);

// --- Processing refuses while someone is still employed ----------------------------------
await expectError(
  "refuses a helper still employed",
  () => q(`SELECT process_account_deletion($1)`, [U]),
  /still active/,
);
await expectError(
  "refuses the manager of a household that still employs someone",
  () => q(`SELECT process_account_deletion($1)`, [M]),
  /still employs/,
);
check(
  "nothing was deleted by the refusals",
  (await q(`SELECT 1 FROM auth.users WHERE id IN ($1, $2)`, [U, M])).length === 2,
);

// --- Processing: the last manager, once nobody works there -----------------------------
await db.exec(
  `UPDATE helper_profiles SET status = 'INACTIVE', ended_on = current_date WHERE id = '${HP}'`,
);
const mgr = await one(`SELECT process_account_deletion($1) AS r`, [M]);
check(
  "manager processed",
  mgr.r.household_data_deleted === true && mgr.r.household_deleted === false,
  mgr.r,
);
check(
  "appointments deleted",
  (await q(`SELECT 1 FROM appointments WHERE household_id = $1`, [H])).length === 0,
);
check(
  "unclaimed invite deleted",
  (await q(`SELECT 1 FROM helper_profiles WHERE id = $1`, [HP_INVITE])).length === 0,
);
check("utos deleted", (await q(`SELECT 1 FROM quick_utos`)).length === 0);
check(
  "employments kept",
  (await q(`SELECT 1 FROM helper_profiles WHERE household_id = $1`, [H])).length === 2,
);
check(
  "household kept for their history",
  (await q(`SELECT name FROM households WHERE id = $1`, [H])).length === 1,
);
check(
  "payslip keeps no 'requested by'",
  (await one(`SELECT requested_by FROM payslips WHERE helper_id = $1`, [HP2])).requested_by ===
    null,
);
check(
  "the ticket he made keeps no 'created by'",
  (await one(`SELECT created_by FROM tickets WHERE title = 'Dishes'`)).created_by === null,
);

// A manager whose household never employed anyone: the household goes too.
const m2 = await one(`SELECT process_account_deletion($1) AS r`, [M2]);
check("empty household deleted with its last manager", m2.r.household_deleted === true, m2.r);
check("gone", (await q(`SELECT 1 FROM households WHERE id = $1`, [H2])).length === 0);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
