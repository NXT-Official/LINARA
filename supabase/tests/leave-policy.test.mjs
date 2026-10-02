// Runs add-leave-policy.sql after add-leave.sql against a real Postgres
// (PGlite): by default service incentive leave follows RA 10361 (5 days,
// from her second service year); a manager can give it from day one, or give
// more days, never fewer; a helper can't change either.
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
const changes = async (sql, params) => (await q(`${sql} RETURNING 1`, params)).length;

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
// As leave.test.mjs, plus what fix-helper-write-access.sql reads, for the
// manager-only households update policy.
await db.exec(`
  ALTER TABLE helper_profiles ADD COLUMN started_on DATE, ADD COLUMN break_start TIME, ADD COLUMN break_end TIME;
  ALTER TABLE rest_off_requests ADD COLUMN start_time TIME, ADD COLUMN end_time TIME;
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false;
  CREATE FUNCTION public.household_today() RETURNS DATE LANGUAGE sql STABLE AS
  $$ SELECT '2026-10-02'::date $$;
  GRANT EXECUTE ON FUNCTION public.household_today() TO authenticated;
`);
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-leave.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-leave-policy.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-leave-policy.sql`, "utf8"));
console.log("migrations applied (leave policy twice)");

const M = "00000000-0000-0000-0000-00000000000a"; // manager
const U = "00000000-0000-0000-0000-00000000000b"; // helper with a year of service
const U2 = "00000000-0000-0000-0000-00000000000d"; // helper in her first year
const H = "10000000-0000-0000-0000-000000000001";
const HP = "20000000-0000-0000-0000-000000000001";
const HP_NEW = "20000000-0000-0000-0000-000000000002";

// Thursday 2026-10-02 is "today"; Sundays are rest days.
await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${U}'), ('${U2}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO user_profiles VALUES ('${U2}', '${H}', 'Rosa Lim', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status,
                               shift_start, shift_end, weekly_rest_day, started_on)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE',
            '08:00', '17:00', 0, '2025-06-01'),
           ('${HP_NEW}', '${U2}', '${H}', 'Rosa', 'Cook', 7000, 'semi_monthly', 'ACTIVE',
            '08:00', '17:00', 0, '2026-08-10');
`);

await db.exec(`SET ROLE authenticated`);
const balance = async (id) => (await one(`SELECT sil_balance_days($1) AS d`, [id])).d;

// --- The law, by default -----------------------------------------------------
await as(M);
check("by default, five days after her first year", (await balance(HP)) === 5);
check("and none in her first year", (await balance(HP_NEW)) === 0);
await expectError(
  "recording SIL in her first year says where to change it",
  () => q(`SELECT * FROM record_leave($1, 'sil', 'sick', '2026-10-05', '2026-10-05')`, [HP_NEW]),
  /one year of service .*Leave rules/,
);

// --- From day one --------------------------------------------------------------
check(
  "a manager can give SIL from day one",
  (await changes(`UPDATE households SET sil_waits_first_year = false WHERE id = $1`, [H])) === 1,
);
check("then she has five days in her first year", (await balance(HP_NEW)) === 5);
const year = await one(
  `SELECT eligible, year_start::text AS start FROM sil_service_year($1, '2026-10-02')`,
  [HP_NEW],
);
check(
  "her service year still runs from her first day",
  year.eligible === true && year.start === "2026-08-10",
  year,
);
check(
  "and the manager can record it",
  (await q(`SELECT * FROM record_leave($1, 'sil', 'sick', '2026-10-05', '2026-10-05')`, [HP_NEW]))
    .length === 1,
);
check("which spends a day", (await balance(HP_NEW)) === 4);

// --- More days ----------------------------------------------------------------
await q(`UPDATE households SET sil_days_per_year = 7 WHERE id = $1`, [H]);
check("more days a year raise every balance", (await balance(HP)) === 7);
check("including what's left after leave taken", (await balance(HP_NEW)) === 6);
await expectError(
  "but never below the law's five",
  () => q(`UPDATE households SET sil_days_per_year = 4 WHERE id = $1`, [H]),
  /sil_days_per_year_check/,
);
await expectError(
  "and the guard holds the new limit",
  () => q(`SELECT * FROM record_leave($1, 'sil', 'vacation', '2026-10-05', '2026-10-14')`, [HP]),
  /Not enough service incentive leave: 7 days left/,
);

// --- Back to the law ------------------------------------------------------------
await q(`UPDATE households SET sil_waits_first_year = true WHERE id = $1`, [H]);
check("turning the wait back on applies again", (await balance(HP_NEW)) === 0);

// --- Her login -------------------------------------------------------------------
await as(U);
check(
  "a helper can't change the household's rules",
  (await changes(`UPDATE households SET sil_waits_first_year = false WHERE id = $1`, [H])) === 0,
);

await db.exec(`RESET ROLE`);
console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
