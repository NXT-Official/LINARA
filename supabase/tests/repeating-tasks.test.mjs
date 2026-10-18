// Runs add-repeating-tasks.sql against a real Postgres (PGlite): a repeating
// task comes back on each day it repeats, once per day however often it's
// asked, carrying what its newest task has, and going to no one when its
// helper is away or has left. Stopping the repeat stops it.
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
// The live columns this file reads (add-ticket-board-columns.sql,
// add-unassigned-tasks.sql, add-task-length-and-leave-unassign.sql,
// add-shared-staff-and-places.sql), leave and rest off as add-leave.sql and
// add-rest-off-requests.sql have them, and helper_works_in with its guard.
await db.exec(`
  ALTER TABLE tickets ADD COLUMN notes TEXT,
                      ADD COLUMN suggested BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN recurrence TEXT[],
                      ADD COLUMN routine_id TEXT,
                      ADD COLUMN duration_minutes INT,
                      ADD COLUMN from_household_id UUID,
                      ADD COLUMN from_place_id UUID,
                      ADD COLUMN to_household_id UUID,
                      ADD COLUMN to_place_id UUID,
                      ALTER COLUMN helper_id DROP NOT NULL;
  ALTER TABLE rest_off_requests ADD COLUMN start_time TIME, ADD COLUMN end_time TIME;
  CREATE TABLE public.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID NOT NULL REFERENCES public.helper_profiles(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  );
  CREATE TABLE public.helper_households (
    helper_id UUID NOT NULL REFERENCES public.helper_profiles(id) ON DELETE CASCADE,
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    PRIMARY KEY (helper_id, household_id)
  );
  CREATE FUNCTION public.helper_works_in(p_helper_id UUID, p_household_id UUID)
  RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.helper_profiles WHERE id = p_helper_id AND household_id = p_household_id)
        OR EXISTS (SELECT 1 FROM public.helper_households WHERE helper_id = p_helper_id AND household_id = p_household_id);
  $$;
  CREATE FUNCTION public.tickets_helper_works_here() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
  BEGIN
    IF NEW.helper_id IS NOT NULL AND NOT public.helper_works_in(NEW.helper_id, NEW.household_id) THEN
      RAISE EXCEPTION 'She doesn''t work in this household';
    END IF;
    RETURN NEW;
  END; $$;
  CREATE TRIGGER tickets_helper_works_here BEFORE INSERT OR UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.tickets_helper_works_here();
  GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated;
`);

const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const BEN = "00000000-0000-0000-0000-00000000000a"; // manager of H
const JOY = "00000000-0000-0000-0000-00000000000c"; // manager of H2
const ROSA_USER = "00000000-0000-0000-0000-00000000000d";
const ROSA = "20000000-0000-0000-0000-000000000001";
const LINA = "20000000-0000-0000-0000-000000000002"; // will leave
const MAY = "20000000-0000-0000-0000-000000000003"; // H2's
const LEGACY = "30000000-0000-0000-0000-000000000001"; // repeating, from before the file
const DUP_A = "30000000-0000-0000-0000-000000000002"; // two on one day, same series
const DUP_B = "30000000-0000-0000-0000-000000000003";

// A day and Manila time as an instant: 2026-10-05 07:30 is 2026-10-04T23:30Z.
const at = (day, hm) => `${day}T${hm}:00+08:00`;

await db.exec(`
  INSERT INTO auth.users VALUES ('${BEN}'), ('${JOY}'), ('${ROSA_USER}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES
    ('${BEN}', '${H}', 'Ben', 'primary_manager', now()),
    ('${JOY}', '${H2}', 'Joy', 'primary_manager', now()),
    ('${ROSA_USER}', '${H}', 'Rosa', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status) VALUES
    ('${ROSA}', '${ROSA_USER}', '${H}', 'Rosa', 'House', 8000, 'monthly', 'ACTIVE'),
    ('${LINA}', NULL, '${H}', 'Lina', 'Cook', 8000, 'monthly', 'ACTIVE'),
    ('${MAY}', NULL, '${H2}', 'May', 'House', 8000, 'monthly', 'ACTIVE');
  -- Made before this file: a daily task, and a series holding two on one day.
  INSERT INTO tickets (id, household_id, title, helper_id, scheduled_start, recurrence, created_by) VALUES
    ('${LEGACY}', '${H}', 'Sweep the porch', '${ROSA}', '${at("2026-10-01", "08:00")}', '{daily}', '${BEN}');
  INSERT INTO tickets (id, household_id, title, helper_id, scheduled_start, recurrence, routine_id, created_by) VALUES
    ('${DUP_A}', '${H}', 'Feed the dog', '${ROSA}', '${at("2026-10-01", "07:00")}', '{daily}', 'old-series', '${BEN}'),
    ('${DUP_B}', '${H}', 'Feed the dog', '${ROSA}', '${at("2026-10-01", "09:00")}', '{daily}', 'old-series', '${BEN}');
`);

const migration = readFileSync(`${REPO}/add-repeating-tasks.sql`, "utf8").split("-- @schedule")[0];
await db.exec(migration);
await db.exec(migration);
console.log("migration applied twice");

const row = (id) => one(`SELECT * FROM tickets WHERE id = $1`, [id]);
const ofSeries = (series) =>
  q(
    `SELECT id, title, notes, helper_id, status, scheduled_start, duration_minutes,
            from_household_id, to_place_id, recurrence, occurrence_date::text AS day, created_by
       FROM tickets WHERE routine_id = $1 ORDER BY occurrence_date NULLS LAST, scheduled_start`,
    [series],
  );
const spawn = async (household, day) =>
  (await one(`SELECT public.spawn_routine_tasks_for($1, $2) AS n`, [household, day])).n;
const onDay = async (series, day) => (await ofSeries(series)).filter((t) => t.day === day);

// ---------------------------------------------------------------------------
// What was there before.
// ---------------------------------------------------------------------------
let r = await row(LEGACY);
check(
  "a repeating task from before starts its own series, for its own day",
  r.routine_id === LEGACY && r.occurrence_date.toISOString().startsWith("2026-10-01"),
  { routine_id: r.routine_id, day: r.occurrence_date },
);
const dups = await ofSeries("old-series");
check(
  "two on one day: only the first is that day's",
  dups.find((t) => t.id === DUP_A).day === "2026-10-01" &&
    dups.find((t) => t.id === DUP_B).day === null,
  dups.map((t) => [t.id, t.day]),
);

// ---------------------------------------------------------------------------
// A new repeating task, made the way the web makes it.
// ---------------------------------------------------------------------------
await db.exec(`SET ROLE authenticated`);
await as(BEN);
const head = await one(
  `INSERT INTO tickets (household_id, title, notes, helper_id, scheduled_start, recurrence,
                        duration_minutes, from_household_id, created_by)
   VALUES ($1, 'Water the plants', 'Ferns get a light mist', $2, $3, '{daily}', 45, $4, $5)
   RETURNING id, routine_id, occurrence_date::text AS day`,
  [H, ROSA, at("2026-10-05", "07:30"), H2, BEN],
);
check(
  "a new repeating task names its series and its day",
  head.routine_id === head.id && head.day === "2026-10-05",
  head,
);
const plain = await one(
  `INSERT INTO tickets (household_id, title, helper_id, scheduled_start)
   VALUES ($1, 'Fix the gate', $2, $3) RETURNING routine_id, occurrence_date`,
  [H, ROSA, at("2026-10-05", "10:00")],
);
check(
  "a one-off task is left alone",
  plain.routine_id === null && plain.occurrence_date === null,
  plain,
);

await expectError(
  "nobody but the database calls the per-household spawn",
  () => q(`SELECT public.spawn_routine_tasks_for($1, '2026-10-06')`, [H]),
  /permission denied/,
);
await expectError(
  "nor the every-household one",
  () => q(`SELECT public.spawn_routine_tasks_everywhere()`),
  /permission denied/,
);
await expectError(
  "nor the time-off check",
  () => q(`SELECT public.routine_helper_free($1, $2, '2026-10-06', '08:00')`, [ROSA, H]),
  /permission denied/,
);

await db.exec(`RESET ROLE`);

// ---------------------------------------------------------------------------
// The next day.
// ---------------------------------------------------------------------------
await spawn(H, "2026-10-04");
check(
  "nothing for a series on a day before it starts",
  (await onDay(head.id, "2026-10-04")).length === 0,
);
await spawn(H, "2026-10-05");
check("nor a second on its first day", (await onDay(head.id, "2026-10-05")).length === 1);

let made = await spawn(H, "2026-10-06");
let next = (await onDay(head.id, "2026-10-06"))[0];
check("the next day's task is made", !!next, made);
check(
  "carrying title, note, helper, time, length, trip and repeat",
  next &&
    next.title === "Water the plants" &&
    next.notes === "Ferns get a light mist" &&
    next.helper_id === ROSA &&
    new Date(next.scheduled_start).toISOString() === "2026-10-05T23:30:00.000Z" &&
    next.duration_minutes === 45 &&
    next.from_household_id === H2 &&
    next.recurrence.join() === "daily" &&
    next.status === "todo" &&
    next.created_by === BEN,
  next,
);
check(
  "the older series come back too",
  (await onDay(LEGACY, "2026-10-06")).length === 1 &&
    (await onDay("old-series", "2026-10-06")).length === 1,
);

check("asked again the same day, nothing more", (await spawn(H, "2026-10-06")) === 0);
check("still one", (await onDay(head.id, "2026-10-06")).length === 1);
await expectError(
  "the database refuses a second one for the same series and day",
  () =>
    q(
      `INSERT INTO tickets (household_id, title, helper_id, scheduled_start, recurrence, routine_id, occurrence_date)
       VALUES ($1, 'Water the plants', $2, $3, '{daily}', $4, '2026-10-06')`,
      [H, ROSA, at("2026-10-06", "07:30"), head.id],
    ),
  /duplicate key|unique/,
);
await expectError(
  "however it's inserted (the trigger fills the day)",
  () =>
    q(
      `INSERT INTO tickets (household_id, title, helper_id, scheduled_start, recurrence, routine_id)
       VALUES ($1, 'Water the plants', $2, $3, '{daily}', $4)`,
      [H, ROSA, at("2026-10-06", "15:00"), head.id],
    ),
  /duplicate key|unique/,
);

// ---------------------------------------------------------------------------
// Days of the week.
// ---------------------------------------------------------------------------
const weekly = await one(
  `INSERT INTO tickets (household_id, title, helper_id, scheduled_start, recurrence)
   VALUES ($1, 'Change the sheets', $2, $3, '{Mon,Thu}') RETURNING id`,
  [H, LINA, at("2026-10-05", "09:00")], // a Monday
);
const asleep = await one(
  `INSERT INTO tickets (household_id, title, helper_id, scheduled_start, recurrence)
   VALUES ($1, 'Polish the silver', $2, $3, '{daily}') RETURNING id`,
  [H, ROSA, at("2026-08-20", "10:00")],
);
await spawn(H, "2026-10-07"); // Wednesday
check(
  "a series with no task in five weeks stays asleep",
  (await onDay(asleep.id, "2026-10-07")).length === 0,
);
check("not on a day it doesn't repeat", (await onDay(weekly.id, "2026-10-07")).length === 0);
await spawn(H, "2026-10-08"); // Thursday
check("on the next day it does", (await onDay(weekly.id, "2026-10-08")).length === 1);

// ---------------------------------------------------------------------------
// Who it goes to: away is Unassigned, and the day after it's hers again.
// ---------------------------------------------------------------------------
await db.exec(`
  INSERT INTO leave_requests (helper_id, start_date, end_date, status) VALUES
    ('${ROSA}', '2026-10-09', '2026-10-09', 'approved'),
    ('${ROSA}', '2026-10-10', '2026-10-10', 'pending');
  INSERT INTO rest_off_requests (helper_id, rest_date, minutes, status, start_time, end_time) VALUES
    ('${ROSA}', '2026-10-11', 120, 'approved', '07:00', '09:00'),
    ('${ROSA}', '2026-10-12', 120, 'approved', '13:00', '15:00');
`);
const who = async (day) => {
  await spawn(H, day);
  return (await onDay(head.id, day))[0]?.helper_id;
};
check("on approved leave: Unassigned", (await who("2026-10-09")) === null);
check("only approved leave counts, and it's hers again", (await who("2026-10-10")) === ROSA);
check("rest off covering its time: Unassigned", (await who("2026-10-11")) === null);
check("rest off at another time: hers", (await who("2026-10-12")) === ROSA);

// ---------------------------------------------------------------------------
// Edits carry forward; a cancelled or moved day doesn't stop it.
// ---------------------------------------------------------------------------
const newest = (await onDay(head.id, "2026-10-12"))[0];
await q(
  `UPDATE tickets SET title = 'Water all the plants', scheduled_start = $2, helper_id = $3
    WHERE id = $1`,
  [newest.id, at("2026-10-12", "17:00"), LINA],
);
await spawn(H, "2026-10-13");
next = (await onDay(head.id, "2026-10-13"))[0];
check(
  "an edit to the newest task carries to the next",
  next?.title === "Water all the plants" &&
    new Date(next.scheduled_start).toISOString() === "2026-10-13T09:00:00.000Z" &&
    next.helper_id === LINA,
  next,
);

await q(`UPDATE tickets SET status = 'cancelled' WHERE id = $1`, [next.id]);
await spawn(H, "2026-10-14");
check(
  "cancelling one day's task skips that day only",
  (await onDay(head.id, "2026-10-14")).length === 1,
);

// Moved to tomorrow: keeps its day, so neither collides nor comes back.
const moving = (await onDay(head.id, "2026-10-14"))[0];
await q(`UPDATE tickets SET scheduled_start = $2 WHERE id = $1`, [
  moving.id,
  at("2026-10-15", "17:00"),
]);
check(
  "a moved task keeps the day it was for",
  (await onDay(head.id, "2026-10-14"))[0]?.id === moving.id,
);
await spawn(H, "2026-10-14");
check("its day doesn't get another", (await onDay(head.id, "2026-10-14")).length === 1);

// Lina leaves: Thursday's sheets, and the plants she was given, go to no one.
await q(`UPDATE helper_profiles SET status = 'INACTIVE' WHERE id = $1`, [LINA]);
await spawn(H, "2026-10-15");
const sheets = (await onDay(weekly.id, "2026-10-15"))[0];
const plants = (await onDay(head.id, "2026-10-15"))[0];
check(
  "a helper who has left: Unassigned, still made",
  sheets?.helper_id === null && plants?.helper_id === null,
  { sheets, plants },
);
await q(`UPDATE helper_profiles SET status = 'ACTIVE' WHERE id = $1`, [LINA]);

// Stop repeating: what the web does.
await q(`UPDATE tickets SET recurrence = NULL WHERE routine_id = $1`, [head.id]);
await spawn(H, "2026-10-16");
check("stopped: no task the day after", (await onDay(head.id, "2026-10-16")).length === 0);

// ---------------------------------------------------------------------------
// A remote admin's suggestion repeats once approved.
// ---------------------------------------------------------------------------
const suggestion = await one(
  `INSERT INTO tickets (household_id, title, helper_id, scheduled_start, recurrence, suggested)
   VALUES ($1, 'Wipe the windows', $2, $3, '{daily}', true) RETURNING id`,
  [H, ROSA, at("2026-10-16", "10:00")],
);
await spawn(H, "2026-10-17");
check(
  "a suggestion waiting for approval doesn't repeat",
  (await onDay(suggestion.id, "2026-10-17")).length === 0,
);
await q(`UPDATE tickets SET suggested = false WHERE id = $1`, [suggestion.id]);
await spawn(H, "2026-10-17");
check("approved, it does", (await onDay(suggestion.id, "2026-10-17")).length === 1);

// ---------------------------------------------------------------------------
// Households.
// ---------------------------------------------------------------------------
const theirs = await one(
  `INSERT INTO tickets (household_id, title, helper_id, scheduled_start, recurrence)
   VALUES ($1, 'Sweep the garage', $2, $3, '{daily}') RETURNING id`,
  [H2, MAY, at("2026-10-16", "08:00")],
);
await spawn(H, "2026-10-17");
check(
  "one household's spawn leaves another's alone",
  (await onDay(theirs.id, "2026-10-17")).length === 0,
);

// spawn_routine_tasks(): the caller's household, on its today.
const todayIso = (await one(`SELECT (now() AT TIME ZONE 'Asia/Manila')::date::text AS d`)).d;
const yesterdayIso = (await one(`SELECT ((now() AT TIME ZONE 'Asia/Manila')::date - 1)::text AS d`))
  .d;
const daily = await one(
  `INSERT INTO tickets (household_id, title, helper_id, scheduled_start, recurrence)
   VALUES ($1, 'Take out the trash', $2, ($3::date + TIME '20:00') AT TIME ZONE 'Asia/Manila', '{daily}')
   RETURNING id`,
  [H, ROSA, yesterdayIso],
);
const theirDaily = await one(
  `INSERT INTO tickets (household_id, title, helper_id, scheduled_start, recurrence)
   VALUES ($1, 'Lock the gate', $2, ($3::date + TIME '21:00') AT TIME ZONE 'Asia/Manila', '{daily}')
   RETURNING id`,
  [H2, MAY, yesterdayIso],
);

await db.exec(`SET ROLE authenticated`);
await as(ROSA_USER);
const byHelper = (await one(`SELECT public.spawn_routine_tasks() AS n`)).n;
check("her phone may ask for today's", byHelper >= 1, byHelper);
await as(BEN);
check(
  "asked again from the web: nothing more",
  (await one(`SELECT public.spawn_routine_tasks() AS n`)).n === 0,
);
await as("");
check("signed out: nothing", (await one(`SELECT public.spawn_routine_tasks() AS n`)).n === 0);
await db.exec(`RESET ROLE`);
check("today's task is there", (await onDay(daily.id, todayIso)).length === 1);
check("the other household's isn't, yet", (await onDay(theirDaily.id, todayIso)).length === 0);

// The hourly job: every household, each on its own day.
const everywhere = (await one(`SELECT public.spawn_routine_tasks_everywhere() AS n`)).n;
check(
  "the hourly job makes the other household's today",
  (await onDay(theirDaily.id, todayIso)).length === 1,
  everywhere,
);
check(
  "and nothing twice",
  (await one(`SELECT public.spawn_routine_tasks_everywhere() AS n`)).n === 0,
);

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
