// Runs add-ticket-ledger.sql against a real Postgres (PGlite): a task finished
// off her shift, by the helper herself, gets one after-hours ledger entry
// classified like the web's classify(); one finished on shift gets none; and
// unticking it takes the entry away again.
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
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
};

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
// Columns and tables the live schema has that base-schema.sql doesn't carry.
await db.exec(`
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE helper_profiles ADD COLUMN break_start TIME, ADD COLUMN break_end TIME;
  ALTER TABLE rest_off_requests ADD COLUMN start_time TIME, ADD COLUMN end_time TIME;
  ALTER TABLE tickets ADD COLUMN actual_end TIMESTAMPTZ,
    ADD COLUMN is_after_hours BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN emergency BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE ledger_entries
    ADD COLUMN source_type TEXT,
    ADD COLUMN associated_ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    ADD COLUMN title TEXT NOT NULL DEFAULT '',
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'task',
    ADD COLUMN resolved BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN resolved_at TIMESTAMPTZ,
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  CREATE TABLE public.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID NOT NULL REFERENCES helper_profiles(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  );
`);
// The helper may not write ledger_entries herself; the trigger still must.
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-ticket-ledger.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-ticket-ledger.sql`, "utf8"));
console.log("migrations applied (ticket ledger twice)");

const M = "00000000-0000-0000-0000-00000000000a"; // manager
const U = "00000000-0000-0000-0000-00000000000b"; // helper account
const H = "10000000-0000-0000-0000-000000000001";
const HP = "20000000-0000-0000-0000-000000000001";

// Shift 07:00-19:00, break 12:00-13:00, rest day Sunday; Manila time (+08).
// Thu 24 Sep 2026 is a working day; Sun 27 Sep is her rest day. All in the
// past: the trigger clamps a future actual_end to now.
await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${U}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval,
                               status, shift_start, shift_end, break_start, break_end, weekly_rest_day)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly',
            'ACTIVE', '07:00', '19:00', '12:00', '13:00', 0);
  INSERT INTO rest_off_requests (helper_id, rest_date, minutes, status, start_time, end_time)
    VALUES ('${HP}', '2026-09-25', 120, 'approved', '14:00', '16:00');
  INSERT INTO leave_requests (helper_id, start_date, end_date, status)
    VALUES ('${HP}', '2026-09-28', '2026-09-29', 'approved'),
           ('${HP}', '2026-09-30', '2026-09-30', 'pending');
`);

let n = 0;
const task = async (title, extra = {}) => {
  n++;
  const id = `40000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  await q(
    `INSERT INTO tickets (id, household_id, title, helper_id, status, is_after_hours, emergency)
     VALUES ($1, $2, $3, $4, 'todo', $5, $6)`,
    [id, H, title, HP, extra.afterHours ?? false, extra.emergency ?? false],
  );
  return id;
};

// Finish as the helper herself, from her phone: status, start and end in one update.
const finish = async (id, start, end) => {
  await db.exec(`SET ROLE authenticated`);
  await as(U);
  await q(`UPDATE tickets SET status = 'done', actual_start = $2, actual_end = $3 WHERE id = $1`, [
    id,
    start,
    end,
  ]);
  await db.exec(`RESET ROLE`);
};
const entriesFor = async (id) =>
  q(
    `SELECT source_type, duration_minutes, title, kind, resolved FROM ledger_entries
      WHERE associated_ticket_id = $1`,
    [id],
  );

// --- On shift: nothing owed ----------------------------------------------------
let id = await task("Laundry");
await finish(id, "2026-09-24 09:30+08", "2026-09-24 10:00+08");
check("on-shift work makes no entry", (await entriesFor(id)).length === 0);

// --- Off shift, each classification -----------------------------------------------
id = await task("Dinner dishes");
await finish(id, "2026-09-24 19:30+08", "2026-09-24 20:00+08");
let e = await entriesFor(id);
check(
  "after her shift: overtime, minutes from start to end",
  e.length === 1 &&
    e[0].source_type === "overtime" &&
    e[0].duration_minutes === 30 &&
    e[0].title === "Dinner dishes" &&
    e[0].kind === "task" &&
    e[0].resolved === true,
  e,
);

id = await task("Fold towels");
await finish(id, "2026-09-24 12:10+08", "2026-09-24 12:40+08");
e = await entriesFor(id);
check("during her break: rest_break_work", e[0]?.source_type === "rest_break_work", e);

id = await task("Water the plants");
await finish(id, "2026-09-27 09:00+08", "2026-09-27 09:20+08");
e = await entriesFor(id);
check("on her rest day: rest_day_work", e[0]?.source_type === "rest_day_work", e);

id = await task("Late snack", { emergency: true });
await finish(id, "2026-09-24 10:00+08", "2026-09-24 10:15+08");
e = await entriesFor(id);
check("an emergency counts even on shift", e[0]?.source_type === "emergency", e);

id = await task("Iron the barong", { afterHours: true });
await finish(id, "2026-09-24 10:00+08", "2026-09-24 10:45+08");
e = await entriesFor(id);
check("a task sent off-hours counts even on shift", e[0]?.source_type === "overtime", e);

id = await task("Pick up medicine");
await finish(id, "2026-09-25 14:30+08", "2026-09-25 15:00+08");
e = await entriesFor(id);
check("inside approved rest off: overtime", e[0]?.source_type === "overtime", e);

id = await task("Clean the fridge");
await finish(id, "2026-09-28 09:00+08", "2026-09-28 10:00+08");
e = await entriesFor(id);
check("on approved leave: overtime", e[0]?.source_type === "overtime", e);

id = await task("Sweep the porch");
await finish(id, "2026-09-30 09:00+08", "2026-09-30 09:30+08");
check("pending leave doesn't count as off", (await entriesFor(id)).length === 0);

id = await task("Lock the gate");
await finish(id, "2026-09-24 22:00+08", "2026-09-24 22:30+08");
e = await entriesFor(id);
check("quiet hours: overtime", e[0]?.source_type === "overtime", e);

// --- Never pressed Start: five minutes, like the web -------------------------------
id = await task("Take out the trash");
await finish(id, null, "2026-09-24 21:00+08");
e = await entriesFor(id);
check("ticked off without Start: five minutes", e[0]?.duration_minutes === 5, e);

// --- Untick, tick again ----------------------------------------------------------
await db.exec(`SET ROLE authenticated`);
await as(U);
await q(`UPDATE tickets SET status = 'in_progress', actual_end = NULL WHERE id = $1`, [id]);
await db.exec(`RESET ROLE`);
check("unticking removes its entry", (await entriesFor(id)).length === 0);

await finish(id, null, "2026-09-24 21:10+08");
check("ticking again makes exactly one entry", (await entriesFor(id)).length === 1);

await db.exec(`SET ROLE authenticated`);
await as(U);
await q(`UPDATE tickets SET status = 'done' WHERE id = $1`, [id]);
await q(`UPDATE tickets SET title = 'Take out the trash (both bins)' WHERE id = $1`, [id]);
await db.exec(`RESET ROLE`);
check("done -> done and other edits add nothing", (await entriesFor(id)).length === 1);

// --- A manager closing it on the web is the same rule ---------------------------
id = await task("Wipe the windows");
await db.exec(`SET ROLE authenticated`);
await as(M);
await q(
  `UPDATE tickets SET status = 'done', actual_start = '2026-09-24 19:00+08',
                      actual_end = '2026-09-24 19:20+08' WHERE id = $1`,
  [id],
);
await db.exec(`RESET ROLE`);
e = await entriesFor(id);
check("a manager's Done counts the same way", e[0]?.source_type === "overtime", e);

// --- A clock in the future is clamped to now --------------------------------------
id = await task("Far-future clock");
await finish(id, null, "2099-01-01 21:00+08");
e = await q(
  `SELECT created_at <= now() AS ok FROM ledger_entries WHERE associated_ticket_id = $1`,
  [id],
);
check("an actual_end in the future is never trusted", e.length === 0 || e[0].ok === true, e);

// --- She still can't write the ledger herself --------------------------------------
await db.exec(`SET ROLE authenticated`);
await as(U);
let refused = false;
try {
  await q(
    `INSERT INTO ledger_entries (helper_id, duration_minutes, source_type) VALUES ($1, 600, 'overtime')`,
    [HP],
  );
} catch {
  refused = true;
}
await db.exec(`RESET ROLE`);
check("a direct insert from her session is still refused", refused);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
