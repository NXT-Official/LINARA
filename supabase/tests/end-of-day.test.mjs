// Runs add-end-of-day-holds.sql against a real Postgres (PGlite): while the
// day is ended, whatever lands on it waits, from any writer; a held task moved
// to a later day is let go; her own moves aren't held; and reopening the day,
// by hand, by the web's rollover or by the hourly job, lets them all go.
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

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
// The live columns this file reads (add-household-board-closed.sql,
// add-household-board-date.sql, add-ticket-board-columns.sql,
// add-unassigned-tasks.sql) and is_household_admin as add-household-managers.sql
// answers it here: a manager's profile.
await db.exec(`
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false,
                         ADD COLUMN board_date DATE NOT NULL DEFAULT CURRENT_DATE;
  ALTER TABLE tickets ADD COLUMN suggested BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN queued BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN queued_for_shift BOOLEAN NOT NULL DEFAULT false,
                      ALTER COLUMN helper_id DROP NOT NULL;
  CREATE FUNCTION public.is_household_admin() RETURNS BOOLEAN LANGUAGE sql STABLE
    SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND user_type <> 'helper');
  $$;
  GRANT EXECUTE ON FUNCTION public.is_household_admin() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated;
  CREATE POLICY households_update ON public.households FOR UPDATE USING (id = public.current_household_id());
`);

const H = "10000000-0000-0000-0000-000000000001";
const BEN = "00000000-0000-0000-0000-00000000000a"; // manager
const ROSA_USER = "00000000-0000-0000-0000-00000000000d";
const ROSA = "20000000-0000-0000-0000-000000000001";

// The household's today, tomorrow and yesterday, in Manila.
const { today, tomorrow, yesterday } = await one(`
  SELECT (now() AT TIME ZONE 'Asia/Manila')::date::text AS today,
         ((now() AT TIME ZONE 'Asia/Manila')::date + 1)::text AS tomorrow,
         ((now() AT TIME ZONE 'Asia/Manila')::date - 1)::text AS yesterday`);
const at = (day, hm) => `${day}T${hm}:00+08:00`;

await db.exec(`
  INSERT INTO auth.users VALUES ('${BEN}'), ('${ROSA_USER}');
  INSERT INTO households (id, name, board_date) VALUES ('${H}', 'Reyes Household', '${today}');
  INSERT INTO user_profiles VALUES
    ('${BEN}', '${H}', 'Ben', 'primary_manager', now()),
    ('${ROSA_USER}', '${H}', 'Rosa', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status)
    VALUES ('${ROSA}', '${ROSA_USER}', '${H}', 'Rosa', 'House', 8000, 'monthly', 'ACTIVE');
`);

const migration = readFileSync(`${REPO}/add-end-of-day-holds.sql`, "utf8").split("-- @schedule")[0];
await db.exec(migration);
await db.exec(migration);
console.log("migration applied twice");

await db.exec(`SET ROLE authenticated`);
const add = async (title, day, extra = "") =>
  await one(
    `INSERT INTO tickets (household_id, title, helper_id, scheduled_start${extra ? ", suggested" : ""})
       VALUES ($1, $2, $3, $4${extra ? ", true" : ""}) RETURNING id, queued`,
    [H, title, ROSA, at(day, "15:00")],
  );
const queued = async (id) => (await one(`SELECT queued FROM tickets WHERE id = $1`, [id])).queued;

await as(BEN);
const before = await add("Before the day ends", today);
check("an open day holds nothing", before.queued === false);

await q(`UPDATE households SET board_closed = true WHERE id = $1`, [H]);
const tonight = await add("Added after the day ended", today);
check("after End the day, a task for today waits", tonight.queued === true);
const tmrw = await add("For tomorrow", tomorrow);
check("one for tomorrow doesn't", tmrw.queued === false);

// The appointment functions write as the table owner, past the page.
await db.exec("RESET ROLE");
const prep = await one(
  `INSERT INTO tickets (household_id, title, helper_id, scheduled_start)
   VALUES ($1, 'Prep for the dentist', $2, $3) RETURNING queued`,
  [H, ROSA, at(today, "17:00")],
);
check("an appointment's prep task for today waits too", prep.queued === true);
await db.exec(`SET ROLE authenticated`);
await as(BEN);

await q(`UPDATE tickets SET scheduled_start = $2 WHERE id = $1`, [tmrw.id, at(today, "18:00")]);
check("a task moved onto today waits", await queued(tmrw.id));
await q(`UPDATE tickets SET scheduled_start = $2 WHERE id = $1`, [tmrw.id, at(tomorrow, "18:00")]);
check("and moved back to tomorrow, it's let go", !(await queued(tmrw.id)));

const suggestion = await add("A suggestion", today, "suggested");
check("a suggestion isn't held while it waits for approval", suggestion.queued === false);
await q(`UPDATE tickets SET suggested = false WHERE id = $1`, [suggestion.id]);
check("approved for today, it waits", await queued(suggestion.id));

await q(`UPDATE tickets SET title = 'Before the day ends, renamed' WHERE id = $1`, [before.id]);
check("editing something else doesn't hold a task already out", !(await queued(before.id)));

await as(ROSA_USER);
const mine = await one(`SELECT id FROM tickets WHERE id = $1`, [tmrw.id]);
await q(`UPDATE tickets SET scheduled_start = $2 WHERE id = $1`, [mine.id, at(today, "19:00")]);
check("her own move onto today isn't held", !(await queued(mine.id)));

// Reopen today: every held task goes out.
await as(BEN);
await q(`UPDATE households SET board_closed = false WHERE id = $1`, [H]);
check(
  "reopening the day lets every held task go",
  (await one(`SELECT count(*)::int AS n FROM tickets WHERE queued`)).n === 0,
);

// Ended last night and never reopened: the hourly job reopens it.
await q(`UPDATE households SET board_closed = true, board_date = $2 WHERE id = $1`, [H, yesterday]);
await db.exec("RESET ROLE");
await q(`UPDATE tickets SET queued = true WHERE id = $1`, [tonight.id]);
const reopened = (await one(`SELECT public.reopen_ended_days() AS n`)).n;
const house = await one(
  `SELECT board_closed, board_date::text AS day FROM households WHERE id = $1`,
  [H],
);
check(
  "a day still ended after midnight reopens on the new day",
  reopened === 1 && house.board_closed === false && house.day === today,
  { reopened, house },
);
check("and its held tasks go out", !(await queued(tonight.id)));
check(
  "a day ended today stays ended",
  (await one(`SELECT public.reopen_ended_days() AS n`)).n === 0,
);

await db.exec(`SET ROLE authenticated`);
await as(ROSA_USER);
let refused = false;
try {
  await q(`SELECT public.reopen_ended_days()`);
} catch {
  refused = true;
}
check("only the scheduler can run the reopen", refused);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
