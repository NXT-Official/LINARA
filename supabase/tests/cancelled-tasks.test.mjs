// Runs add-cancelled-tasks.sql against a real Postgres (PGlite) on top of the
// migrations it follows: cancelling keeps the task with who and when,
// restoring clears that, and ending an employment neither counts nor hands on
// a cancelled task.
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
await db.exec(readFileSync(`${REPO}/add-employment-end.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-pay-periods.sql`, "utf8"));
// As in unpaid-leave-pay.test.mjs, plus the CHECK the live tickets table has.
await db.exec(`
  ALTER TABLE helper_profiles ADD COLUMN break_start TIME, ADD COLUMN break_end TIME;
  ALTER TABLE rest_off_requests ADD COLUMN start_time TIME, ADD COLUMN end_time TIME;
  ALTER TABLE payout_attempts ADD COLUMN psp_payout_id TEXT, ADD COLUMN failure_reason TEXT,
    ADD COLUMN resolved_at TIMESTAMPTZ;
  ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
    CHECK (status IN ('todo', 'in_progress', 'done', 'blocked'));
  CREATE FUNCTION public.household_today() RETURNS DATE LANGUAGE sql STABLE AS
  $$ SELECT '2026-10-02'::date $$;
  GRANT EXECUTE ON FUNCTION public.household_today() TO authenticated;
`);
await db.exec(readFileSync(`${REPO}/add-leave.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-unpaid-leave-pay.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-cancelled-tasks.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-cancelled-tasks.sql`, "utf8"));
console.log("migrations applied (cancelled tasks twice)");

const M = "00000000-0000-0000-0000-00000000000a"; // manager
const H = "10000000-0000-0000-0000-000000000001";
const HP = "20000000-0000-0000-0000-000000000001"; // Marites, leaving
const HP_ROSA = "20000000-0000-0000-0000-000000000002"; // Rosa, takes over
const T_OPEN = "40000000-0000-0000-0000-000000000001";
const T_CANCELLED = "40000000-0000-0000-0000-000000000002";
const T_DONE = "40000000-0000-0000-0000-000000000003";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO helper_profiles (id, household_id, name, station, monthly_rate, payday_interval, status, created_at, started_on)
    VALUES ('${HP}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE', '2026-08-01 02:00+00', '2026-08-01'),
           ('${HP_ROSA}', '${H}', 'Rosa', 'Cook', 7000, 'semi_monthly', 'ACTIVE', '2026-08-01 02:00+00', '2026-08-01');
  INSERT INTO tickets (id, household_id, title, helper_id, status) VALUES
    ('${T_OPEN}', '${H}', 'Laundry', '${HP}', 'todo'),
    ('${T_CANCELLED}', '${H}', 'Iron the curtains', '${HP}', 'blocked'),
    ('${T_DONE}', '${H}', 'Dishes', '${HP}', 'done');
`);

await db.exec(`SET ROLE authenticated`);
await as(M);

// --- Cancel and restore ---------------------------------------------------------
await q(`UPDATE tickets SET status = 'cancelled' WHERE id = $1`, [T_CANCELLED]);
let t = await one(
  `SELECT status, cancelled_at, cancelled_by, cancelled_by_name FROM tickets WHERE id = $1`,
  [T_CANCELLED],
);
check(
  "cancelling keeps the task, with who and when",
  t.status === "cancelled" &&
    t.cancelled_at !== null &&
    t.cancelled_by === M &&
    t.cancelled_by_name === "Ben Reyes",
  t,
);

await q(`UPDATE tickets SET status = 'todo' WHERE id = $1`, [T_CANCELLED]);
t = await one(`SELECT status, cancelled_at, cancelled_by_name FROM tickets WHERE id = $1`, [
  T_CANCELLED,
]);
check(
  "restoring clears the stamp",
  t.status === "todo" && t.cancelled_at === null && t.cancelled_by_name === null,
  t,
);
await q(`UPDATE tickets SET status = 'cancelled' WHERE id = $1`, [T_CANCELLED]);

await q(`UPDATE tickets SET title = 'Iron the long curtains' WHERE id = $1`, [T_CANCELLED]);
t = await one(`SELECT cancelled_by_name FROM tickets WHERE id = $1`, [T_CANCELLED]);
check("editing a cancelled task keeps its stamp", t.cancelled_by_name === "Ben Reyes", t);

await expectError(
  "an unknown status is still refused",
  () => q(`UPDATE tickets SET status = 'gone' WHERE id = $1`, [T_OPEN]),
  /tickets_status_check/,
);

// --- Ending an employment ----------------------------------------------------------
const preview = await one(`SELECT employment_end_preview($1, '2026-10-02') AS p`, [HP]);
check("the preview counts only the open task", preview.p.open_tasks === 1, preview.p.open_tasks);

const ended = await one(`SELECT end_helper_employment($1, '2026-10-02', $2) AS r`, [HP, HP_ROSA]);
check("one task moves to Rosa", ended.r.tasks_moved === 1, ended.r);
const after = await q(`SELECT id, helper_id, status FROM tickets ORDER BY id`);
const byId = Object.fromEntries(after.map((r) => [r.id, r]));
check(
  "the cancelled task stays hers and cancelled; the done one stays",
  byId[T_CANCELLED].helper_id === HP &&
    byId[T_CANCELLED].status === "cancelled" &&
    byId[T_DONE].helper_id === HP &&
    byId[T_OPEN].helper_id === HP_ROSA,
  after,
);

await db.exec(`RESET ROLE`);
console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
