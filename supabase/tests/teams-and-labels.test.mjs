// Runs add-teams-and-labels.sql against a real Postgres (PGlite): managers
// make teams and labels and give them to helpers; a remote admin reads but
// can't write; a helper sees her own team and labels, not anyone else's
// labels, and can't change hers; nothing crosses households.
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

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
await db.exec(`
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false;
  GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated;
  -- As add-household-managers.sql defines it.
  CREATE FUNCTION public.current_user_type() RETURNS TEXT LANGUAGE sql STABLE
    SECURITY DEFINER SET search_path = public AS
  $$ SELECT user_type FROM public.user_profiles WHERE id = auth.uid(); $$;
  GRANT EXECUTE ON FUNCTION public.current_user_type() TO authenticated;
`);
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-teams-and-labels.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-teams-and-labels.sql`, "utf8"));
console.log("migration applied twice");

const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const M = "00000000-0000-0000-0000-00000000000a"; // primary manager
const R = "00000000-0000-0000-0000-00000000000b"; // remote admin
const ROSA = "00000000-0000-0000-0000-00000000000c";
const LITA = "00000000-0000-0000-0000-00000000000d";
const M2 = "00000000-0000-0000-0000-00000000000e"; // another household's manager
const HP_ROSA = "20000000-0000-0000-0000-000000000001";
const HP_LITA = "20000000-0000-0000-0000-000000000002";
const T_KITCHEN = "30000000-0000-0000-0000-000000000001";
const T_GROUNDS = "30000000-0000-0000-0000-000000000002";
const T_OTHER = "30000000-0000-0000-0000-000000000009";
const L_NIGHT = "40000000-0000-0000-0000-000000000001";
const L_TRAINEE = "40000000-0000-0000-0000-000000000002";
const L_OTHER = "40000000-0000-0000-0000-000000000009";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${R}'), ('${ROSA}'), ('${LITA}'), ('${M2}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Estate'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${R}', '${H}', 'Ana Reyes', 'remote_admin', now());
  INSERT INTO user_profiles VALUES ('${ROSA}', '${H}', 'Rosa', 'helper', now());
  INSERT INTO user_profiles VALUES ('${LITA}', '${H}', 'Lita', 'helper', now());
  INSERT INTO user_profiles VALUES ('${M2}', '${H2}', 'Joy Cruz', 'primary_manager', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status)
    VALUES ('${HP_ROSA}', '${ROSA}', '${H}', 'Rosa', 'Cook', 8000, 'semi_monthly', 'ACTIVE'),
           ('${HP_LITA}', '${LITA}', '${H}', 'Lita', 'House', 7000, 'semi_monthly', 'ACTIVE');
  INSERT INTO household_teams (id, household_id, name) VALUES ('${T_OTHER}', '${H2}', 'Kitchen');
  INSERT INTO household_labels (id, household_id, name) VALUES ('${L_OTHER}', '${H2}', 'Night shift');
`);
await db.exec(`SET ROLE authenticated`);

// --- A manager ---------------------------------------------------------------
await as(M);
await q(`INSERT INTO household_teams (id, household_id, name) VALUES
  ('${T_KITCHEN}', '${H}', 'Kitchen'), ('${T_GROUNDS}', '${H}', 'Grounds')`);
await q(`INSERT INTO household_labels (id, household_id, name, tone) VALUES
  ('${L_NIGHT}', '${H}', 'Night shift', 'sky'), ('${L_TRAINEE}', '${H}', 'Trainee', 'clay')`);
check(
  "the manager makes teams and labels, and sees only her household's",
  (await q(`SELECT id FROM household_teams`)).length === 2 &&
    (await q(`SELECT id FROM household_labels`)).length === 2,
);
await expectError(
  "a team's name is unique in a household, whatever its case",
  () => q(`INSERT INTO household_teams (household_id, name) VALUES ('${H}', ' kitchen ')`),
  /duplicate key/,
);
await q(`UPDATE helper_profiles SET team_id = $1 WHERE id = $2`, [T_KITCHEN, HP_ROSA]);
await q(`INSERT INTO helper_labels (helper_id, label_id) VALUES ($1, $2), ($3, $4)`, [
  HP_ROSA,
  L_NIGHT,
  HP_LITA,
  L_TRAINEE,
]);
check(
  "the manager puts Rosa on a team and labels both helpers",
  (await q(`SELECT team_id FROM helper_profiles WHERE id = $1`, [HP_ROSA]))[0].team_id ===
    T_KITCHEN && (await q(`SELECT * FROM helper_labels`)).length === 2,
);
await expectError(
  "another household's team can't be given",
  () => q(`UPDATE helper_profiles SET team_id = $1 WHERE id = $2`, [T_OTHER, HP_LITA]),
  /another household/,
);
await expectError(
  "another household's label can't be given",
  () => q(`INSERT INTO helper_labels (helper_id, label_id) VALUES ($1, $2)`, [HP_LITA, L_OTHER]),
  /another household|row-level security/,
);

// --- A remote admin ----------------------------------------------------------
await as(R);
check(
  "a remote admin reads every team, label and assignment",
  (await q(`SELECT id FROM household_teams`)).length === 2 &&
    (await q(`SELECT id FROM household_labels`)).length === 2 &&
    (await q(`SELECT * FROM helper_labels`)).length === 2,
);
await expectError(
  "but can't make a team",
  () => q(`INSERT INTO household_teams (household_id, name) VALUES ('${H}', 'Security')`),
  /row-level security/,
);
await expectError(
  "or label a helper",
  () => q(`INSERT INTO helper_labels (helper_id, label_id) VALUES ($1, $2)`, [HP_LITA, L_NIGHT]),
  /row-level security/,
);

// --- A helper ----------------------------------------------------------------
await as(ROSA);
check(
  "Rosa reads the household's team names",
  (await q(`SELECT id FROM household_teams`)).length === 2,
);
const rosaLabels = await q(`SELECT id FROM household_labels`);
check(
  "Rosa reads her own label and not Lita's",
  rosaLabels.length === 1 && rosaLabels[0].id === L_NIGHT,
  rosaLabels,
);
const rosaAssignments = await q(`SELECT helper_id FROM helper_labels`);
check(
  "and only her own assignments",
  rosaAssignments.length === 1 && rosaAssignments[0].helper_id === HP_ROSA,
);
await expectError(
  "she can't move herself to another team",
  () => q(`UPDATE helper_profiles SET team_id = $1 WHERE id = $2`, [T_GROUNDS, HP_ROSA]),
  /availability/,
);
const removed = await q(`DELETE FROM helper_labels WHERE helper_id = $1 RETURNING *`, [HP_ROSA]);
check("or take a label off herself", removed.length === 0);
await expectError(
  "or make a label",
  () => q(`INSERT INTO household_labels (household_id, name) VALUES ('${H}', 'Boss')`),
  /row-level security/,
);

// --- Another household -------------------------------------------------------
await as(M2);
check(
  "another household's manager sees none of it",
  (await q(`SELECT id FROM household_teams WHERE household_id = $1`, [H])).length === 0 &&
    (await q(`SELECT * FROM helper_labels`)).length === 0,
);

// --- Deleting ----------------------------------------------------------------
await as(M);
await q(`DELETE FROM household_teams WHERE id = $1`, [T_KITCHEN]);
await q(`DELETE FROM household_labels WHERE id = $1`, [L_NIGHT]);
check(
  "deleting a team leaves its helpers teamless; deleting a label takes it off",
  (await q(`SELECT team_id FROM helper_profiles WHERE id = $1`, [HP_ROSA]))[0].team_id === null &&
    (await q(`SELECT * FROM helper_labels WHERE helper_id = $1`, [HP_ROSA])).length === 0,
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
