// Runs add-shared-staff-and-places.sql against a real Postgres (PGlite).
// A family runs two houses (Ben is primary of both); a third house belongs to
// someone else. Rosa is employed by House 1 and also works in House 2.
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
const expectError = async (label, fn, pattern) => {
  try {
    await fn();
    check(label, false, "no error");
  } catch (e) {
    check(label, pattern.test(e.message), e.message);
  }
};
const changes = async (sql, params) => (await q(`${sql} RETURNING 1`, params)).length;
const asOwner = async (fn) => {
  await db.exec("RESET ROLE");
  try {
    return await fn();
  } finally {
    await db.exec("SET ROLE authenticated");
  }
};

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
// The live columns and policies these migrations sit beside (as in
// helper-task-edit.test.mjs), the pantry tables, and add-employment-end.sql's
// tickets_own_read.
await db.exec(`
  ALTER TABLE user_profiles ALTER COLUMN household_id DROP NOT NULL;
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false,
                         ADD COLUMN petty_cash_budget NUMERIC(10,2) NOT NULL DEFAULT 1500;
  ALTER TABLE helper_profiles ADD COLUMN employment TEXT, ADD COLUMN break_start TIME,
                              ADD COLUMN break_end TIME;
  ALTER TABLE tickets ADD COLUMN suggested BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN emergency BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN is_after_hours BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN notes TEXT,
                      ADD COLUMN actual_end TIMESTAMPTZ,
                      ADD COLUMN photo_evidence_url TEXT,
                      ADD COLUMN reschedule_notice JSONB,
                      ADD COLUMN cancelled_at TIMESTAMPTZ,
                      ADD COLUMN cancelled_by UUID,
                      ADD COLUMN cancelled_by_name TEXT,
                      ALTER COLUMN helper_id DROP NOT NULL;
  ALTER TABLE quick_utos ADD COLUMN emergency BOOLEAN NOT NULL DEFAULT false,
                         ADD COLUMN ack_state TEXT NOT NULL DEFAULT 'sent';
  ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE quick_utos ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payout_attempts ENABLE ROW LEVEL SECURITY;
  CREATE POLICY appointments_isolation ON appointments FOR ALL USING (household_id = public.current_household_id());
  CREATE POLICY quick_utos_isolation ON quick_utos FOR ALL USING (
    EXISTS (SELECT 1 FROM helper_profiles hp WHERE hp.id = quick_utos.recipient_id AND hp.household_id = public.current_household_id()));
  CREATE POLICY payout_attempts_isolation ON payout_attempts FOR ALL USING (
    EXISTS (SELECT 1 FROM payslips p JOIN helper_profiles hp ON hp.id = p.helper_id
            WHERE p.id = payout_attempts.payslip_id AND hp.household_id = public.current_household_id()));
  CREATE POLICY user_profiles_self_read ON user_profiles FOR SELECT USING (id = auth.uid());
  CREATE POLICY tickets_own_read ON tickets FOR SELECT USING (
    EXISTS (SELECT 1 FROM helper_profiles hp WHERE hp.id = tickets.helper_id AND hp.user_id = auth.uid()));
  CREATE FUNCTION public.ticket_ledger_source(p_helper_id UUID, p_at TIMESTAMPTZ, p_after_hours BOOLEAN, p_emergency BOOLEAN)
  RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT NULL::text $$;
  CREATE TABLE account_deletion_requests_placeholder ();
  CREATE TABLE public.pantry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    name TEXT NOT NULL,
    qty NUMERIC(6,2) NOT NULL DEFAULT 0
  );
  ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pantry_items_isolation ON public.pantry_items
    FOR ALL USING (household_id = public.current_household_id());
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.pantry_items TO authenticated;
`);
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-account-deletion.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-household-managers.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-helper-task-edit.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-teams-and-labels.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-shared-staff-and-places.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-shared-staff-and-places.sql`, "utf8"));
console.log("migrations applied (shared staff twice)");

const H1 = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const H3 = "10000000-0000-0000-0000-000000000003"; // another family
const BEN = "00000000-0000-0000-0000-00000000000a"; // primary of H1 and H2
const ANA = "00000000-0000-0000-0000-00000000000b"; // co-manager of H2 only
const JOY = "00000000-0000-0000-0000-00000000000c"; // primary of H3
const ROSA = "00000000-0000-0000-0000-00000000000d"; // employed by H1
const LITA = "00000000-0000-0000-0000-00000000000e"; // employed by H2
const HP_ROSA = "20000000-0000-0000-0000-000000000001";
const HP_LITA = "20000000-0000-0000-0000-000000000002";
const T_DRIVERS = "30000000-0000-0000-0000-000000000001"; // H2's team
const T_H1_HOUSE = "30000000-0000-0000-0000-000000000002"; // H1's team
const P_SCHOOL = "40000000-0000-0000-0000-000000000001"; // H1's saved place
const P_H3 = "40000000-0000-0000-0000-000000000003"; // H3's saved place

await db.exec(`
  INSERT INTO auth.users VALUES ('${BEN}'), ('${ANA}'), ('${JOY}'), ('${ROSA}'), ('${LITA}');
  INSERT INTO households (id, name) VALUES ('${H1}', 'Main House'), ('${H2}', 'Beach House'), ('${H3}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${BEN}', '${H1}', 'Ben', 'primary_manager', now()),
                                   ('${ANA}', '${H2}', 'Ana', 'co_manager', now()),
                                   ('${JOY}', '${H3}', 'Joy', 'primary_manager', now()),
                                   ('${ROSA}', '${H1}', 'Rosa', 'helper', now()),
                                   ('${LITA}', '${H2}', 'Lita', 'helper', now());
  INSERT INTO household_managers (household_id, user_id, role) VALUES
    ('${H1}', '${BEN}', 'primary_manager'), ('${H2}', '${BEN}', 'primary_manager'),
    ('${H2}', '${ANA}', 'co_manager'), ('${H3}', '${JOY}', 'primary_manager')
    ON CONFLICT DO NOTHING;
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status)
    VALUES ('${HP_ROSA}', '${ROSA}', '${H1}', 'Rosa', 'Driver', 9000, 'semi_monthly', 'ACTIVE'),
           ('${HP_LITA}', '${LITA}', '${H2}', 'Lita', 'Driver', 8000, 'semi_monthly', 'ACTIVE');
  INSERT INTO household_teams (id, household_id, name) VALUES
    ('${T_DRIVERS}', '${H2}', 'Drivers'), ('${T_H1_HOUSE}', '${H1}', 'House');
  INSERT INTO household_places (id, household_id, name) VALUES
    ('${P_SCHOOL}', '${H1}', 'School'), ('${P_H3}', '${H3}', 'Office');
  INSERT INTO pantry_items (household_id, name) VALUES ('${H1}', 'Bigas'), ('${H2}', 'Itlog'), ('${H3}', 'Kape');
  UPDATE helper_profiles SET team_id = '${T_DRIVERS}' WHERE id = '${HP_LITA}';
`);
await db.exec(`SET ROLE authenticated`);

// --- Sharing ----------------------------------------------------------------
await as(ANA);
await expectError(
  "a manager who runs only the other house can't pull Rosa in",
  () => q(`INSERT INTO helper_households (helper_id, household_id) VALUES ($1, $2)`, [HP_ROSA, H2]),
  /households you run|row-level security/,
);
await as(JOY);
await expectError(
  "nor can another family",
  () => q(`INSERT INTO helper_households (helper_id, household_id) VALUES ($1, $2)`, [HP_ROSA, H3]),
  /households you run|row-level security/,
);
await as(BEN);
await expectError(
  "her home household isn't a second household",
  () => q(`INSERT INTO helper_households (helper_id, household_id) VALUES ($1, $2)`, [HP_ROSA, H1]),
  /already her home/,
);
await q(`INSERT INTO helper_households (helper_id, household_id, team_id) VALUES ($1, $2, $3)`, [
  HP_ROSA,
  H2,
  T_DRIVERS,
]);
check(
  "Ben, who runs both, adds Rosa to the Beach House's Drivers",
  (await q(`SELECT added_by FROM helper_households WHERE helper_id = $1`, [HP_ROSA]))[0]
    ?.added_by === BEN,
);
await q(`INSERT INTO helper_team_covers (helper_id, team_id) VALUES ($1, $2)`, [
  HP_ROSA,
  T_H1_HOUSE,
]);
check("and has her also cover House at home", true);

// --- The other household's managers ------------------------------------------
await as(ANA);
check(
  "the Beach House's co-manager can change Rosa's team there",
  (await changes(`UPDATE helper_households SET team_id = $1 WHERE helper_id = $2`, [
    T_DRIVERS,
    HP_ROSA,
  ])) === 1,
);
const shared = await q(`SELECT * FROM shared_helpers()`);
check(
  "the Beach House's co-manager sees Rosa there, on Drivers, from the Main House",
  shared.length === 1 &&
    shared[0].id === HP_ROSA &&
    shared[0].team_id === T_DRIVERS &&
    shared[0].home_household_name === "Main House",
  shared,
);
check("with no pay: shared_helpers has no wage column", !("monthly_rate" in shared[0]));
check(
  "and can't read her employment row (wage) directly",
  (await q(`SELECT id FROM helper_profiles WHERE id = $1`, [HP_ROSA])).length === 0,
);
const [ticket] = await q(
  `INSERT INTO tickets (household_id, title, helper_id, from_household_id, to_household_id)
   VALUES ($1, 'Drive A to the Beach House', $2, $3, $1) RETURNING id`,
  [H2, HP_ROSA, H1],
);
check("she assigns Rosa a trip from the Main House to the Beach House", !!ticket?.id);
await expectError(
  "a trip can't go to another family's house",
  () =>
    q(
      `INSERT INTO tickets (household_id, title, helper_id, to_household_id) VALUES ($1, 'x', $2, $3)`,
      [H2, HP_ROSA, H3],
    ),
  /same family/,
);
await expectError(
  "nor to another household's saved place",
  () =>
    q(
      `INSERT INTO tickets (household_id, title, helper_id, to_place_id) VALUES ($1, 'x', $2, $3)`,
      [H2, HP_ROSA, P_H3],
    ),
  /another household/,
);
await q(`INSERT INTO quick_utos (recipient_id, content) VALUES ($1, 'Pakidala ang susi')`, [
  HP_ROSA,
]);
check(
  "she sends Rosa a Quick Utos, marked as from the Beach House",
  (await q(`SELECT household_id FROM quick_utos`))[0]?.household_id === H2,
);

await as(JOY);
await expectError(
  "another family can't give Rosa a task",
  () =>
    q(`INSERT INTO tickets (household_id, title, helper_id) VALUES ($1, 'x', $2)`, [H3, HP_ROSA]),
  /doesn't work in this household/,
);
check("and sees nothing of her", (await q(`SELECT * FROM shared_helpers()`)).length === 0);

// --- Rosa ---------------------------------------------------------------------
await as(ROSA);
const places = await q(`SELECT * FROM my_workplaces()`);
check(
  "Rosa's workplaces: home first, then the Beach House on Drivers",
  places.length === 2 &&
    places[0].is_home &&
    places[0].name === "Main House" &&
    places[1].name === "Beach House" &&
    places[1].team_name === "Drivers",
  places,
);
check(
  "she sees the Beach House trip on her list",
  (await q(`SELECT id FROM tickets WHERE helper_id = $1`, [HP_ROSA])).length === 1,
);
check(
  "and can start it",
  (await changes(`UPDATE tickets SET status = 'in_progress' WHERE id = $1`, [ticket.id])) === 1,
);
await expectError(
  "but not reroute it",
  () => q(`UPDATE tickets SET to_household_id = NULL WHERE id = $1`, [ticket.id]),
  /time, note and progress/,
);
check(
  "she can add a task for herself at the Beach House",
  (
    await q(
      `INSERT INTO tickets (household_id, title, helper_id) VALUES ($1, 'Wash the van', $2) RETURNING id`,
      [H2, HP_ROSA],
    )
  ).length === 1,
);
check(
  "she reads both houses' pantries, not a third",
  (await q(`SELECT name FROM pantry_items ORDER BY name`)).map((r) => r.name).join() ===
    "Bigas,Itlog",
);
check(
  "and the Beach House's Quick Utos to her",
  (await q(`SELECT id FROM quick_utos`)).length === 1,
);
const family = await q(`SELECT name FROM family_households()`);
check(
  "family_households names both houses, not the Cruz household",
  family.map((r) => r.name).join() === "Beach House,Main House",
  family,
);
await expectError(
  "she can't add herself to another household",
  () => q(`INSERT INTO helper_households (helper_id, household_id) VALUES ($1, $2)`, [HP_ROSA, H3]),
  /row-level security|households you run/,
);

// --- Team's day ----------------------------------------------------------------
await as(ANA);
await q(
  `INSERT INTO tickets (household_id, title, helper_id, scheduled_start, notes)
   VALUES ($1, 'Drive B home', $2, now(), 'gate code 1234')`,
  [H2, HP_LITA],
);
await as(ROSA);
const day = await q(`SELECT * FROM team_day(now() - interval '1 hour', now() + interval '1 hour')`);
check(
  "Rosa's team day shows Lita's Drivers task, without its notes",
  day.length === 1 &&
    day[0].helper_name === "Lita" &&
    day[0].team_name === "Drivers" &&
    !("notes" in day[0]),
  day,
);
check(
  "Lita, also on Drivers, sees Rosa's trip",
  await (async () => {
    await as(LITA);
    const rows = await q(
      `SELECT title FROM team_day(now() - interval '1 day', now() + interval '1 day')`,
    );
    return rows.some((r) => r.title === "Drive A to the Beach House");
  })(),
);

// --- Ending -----------------------------------------------------------------------
await asOwner(() => q(`UPDATE helper_profiles SET status = 'INACTIVE' WHERE id = $1`, [HP_ROSA]));
await as(ROSA);
check(
  "once her employment ends, the Beach House is closed to her",
  (await q(`SELECT name FROM pantry_items WHERE household_id = $1`, [H2])).length === 0 &&
    (await q(`SELECT * FROM my_workplaces()`)).length === 0,
);
await as(ANA);
check("and gone from its staff", (await q(`SELECT * FROM shared_helpers()`)).length === 0);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
