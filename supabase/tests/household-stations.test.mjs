// Runs add-household-stations.sql against a real Postgres (PGlite): every
// household starts with the five stations plus any its staff already have,
// managers add, rename and remove them, a rename follows onto staff and SOPs,
// a station anyone current is on can't be removed, and a helper's station has
// to be one of the household's.
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
const fails = async (sql, params = []) => {
  try {
    await q(sql, params);
    return null;
  } catch (err) {
    return err.message;
  }
};

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
// What the live project has from other files: the old CHECK, the household
// helpers the policies use, and the SOP library a rename follows onto.
await db.exec(`
  ALTER TABLE public.helper_profiles ADD CONSTRAINT helper_profiles_station_check
    CHECK (station IN ('Yaya', 'Cook', 'Laundry', 'Driver', 'House'));
  CREATE FUNCTION public.is_household_manager() RETURNS BOOLEAN LANGUAGE sql STABLE
    SECURITY DEFINER SET search_path = public AS
    $$ SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid()
         AND user_type IN ('primary_manager', 'co_manager')) $$;
  CREATE FUNCTION public.my_household_ids() RETURNS SETOF UUID LANGUAGE sql STABLE
    SECURITY DEFINER SET search_path = public AS
    $$ SELECT household_id FROM public.user_profiles WHERE id = auth.uid() $$;
  GRANT EXECUTE ON FUNCTION public.is_household_manager(), public.my_household_ids(),
    public.current_household_id() TO authenticated;
  CREATE TABLE public.house_sops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    title TEXT NOT NULL,
    station TEXT
  );
  GRANT SELECT ON public.house_sops TO authenticated;
`);

const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const BEN = "00000000-0000-0000-0000-00000000000a"; // primary manager of H
const ROSA = "00000000-0000-0000-0000-00000000000b"; // helper in H
const LOLA = "00000000-0000-0000-0000-00000000000c"; // remote admin of H
const CRUZ = "00000000-0000-0000-0000-00000000000d"; // manager of H2
const P_ROSA = "20000000-0000-0000-0000-000000000001";
const P_ANA = "20000000-0000-0000-0000-000000000002";
const P_LEFT = "20000000-0000-0000-0000-000000000003";

await db.exec(`
  INSERT INTO auth.users VALUES ('${BEN}'), ('${ROSA}'), ('${LOLA}'), ('${CRUZ}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes'), ('${H2}', 'Cruz');
  INSERT INTO user_profiles VALUES
    ('${BEN}', '${H}', 'Ben', 'primary_manager', now()),
    ('${ROSA}', '${H}', 'Rosa', 'helper', now()),
    ('${LOLA}', '${H}', 'Lola', 'remote_admin', now()),
    ('${CRUZ}', '${H2}', 'Cruz', 'primary_manager', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status)
  VALUES ('${P_ROSA}', '${ROSA}', '${H}', 'Rosa', 'Cook', 8000, 'monthly', 'ACTIVE'),
         ('${P_ANA}', NULL, '${H}', 'Ana', 'Yaya', 8000, 'monthly', 'PENDING_CLAIM'),
         ('${P_LEFT}', NULL, '${H}', 'Lito', 'Driver', 8000, 'monthly', 'INACTIVE');
  INSERT INTO house_sops (household_id, title, station) VALUES ('${H}', 'Clean the stove', 'Cook');
`);
// Someone given a station outside the five before this, by hand.
await db.exec(`ALTER TABLE helper_profiles DROP CONSTRAINT helper_profiles_station_check;
  UPDATE helper_profiles SET station = 'Gardener ' WHERE id = '${P_LEFT}';
  ALTER TABLE helper_profiles ADD CONSTRAINT helper_profiles_station_check
    CHECK (station IN ('Yaya', 'Cook', 'Laundry', 'Driver', 'House', 'Gardener '));`);

await db.exec(readFileSync(`${REPO}/add-household-stations.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-household-stations.sql`, "utf8"));
console.log("migration applied twice");

const names = async (household) =>
  (
    await q(
      `SELECT name FROM household_stations WHERE household_id = $1 ORDER BY sort_order, name`,
      [household],
    )
  ).map((r) => r.name);

check(
  "every household starts with the five, plus any its staff had",
  JSON.stringify(await names(H)) ===
    JSON.stringify(["Yaya", "Cook", "Laundry", "Driver", "House", "Gardener"]),
  await names(H),
);
check("another household gets only the five", (await names(H2)).length === 5, await names(H2));

await q(`INSERT INTO households (id, name) VALUES ('10000000-0000-0000-0000-000000000003', 'New')`);
check(
  "a new household starts with the five",
  (await names("10000000-0000-0000-0000-000000000003")).length === 5,
);

check(
  "the fixed-five CHECK is gone",
  (
    await q(
      `SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid = 'public.helper_profiles'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%station%'`,
    )
  )[0].n === 0,
);

await db.exec(`SET ROLE authenticated`);

// A manager adds one.
await as(BEN);
await q(`INSERT INTO household_stations (name) VALUES ('Guard')`);
check("a manager adds a station", (await names(H)).includes("Guard"));
check(
  "not twice, whatever the case",
  ((await fails(`INSERT INTO household_stations (name) VALUES (' guard ')`)) ?? "").includes(
    "duplicate",
  ),
);

// Staff on it, spelled any way.
await q(`UPDATE helper_profiles SET station = 'GUARD' WHERE id = $1`, [P_ROSA]);
check(
  "a helper takes one of the household's stations, in its spelling",
  (await q(`SELECT station FROM helper_profiles WHERE id = $1`, [P_ROSA]))[0].station === "Guard",
);
check(
  "but not a station the household doesn't have",
  (
    (await fails(`UPDATE helper_profiles SET station = 'Pilot' WHERE id = $1`, [P_ROSA])) ?? ""
  ).includes('no station called "Pilot"'),
);
check(
  "nor another household's",
  ((await fails(
    `INSERT INTO helper_profiles (household_id, name, station, monthly_rate, payday_interval) VALUES ($1, 'X', 'Guard', 1, 'monthly')`,
    [H2],
  )) ?? "") !== "",
);

// Rename: follows onto staff, those who left included, and SOPs.
await q(
  `UPDATE household_stations SET name = 'Kitchen' WHERE household_id = $1 AND name = 'Cook'`,
  [H],
);
await q(`UPDATE helper_profiles SET station = 'Cook' WHERE false`); // no-op, still allowed
await db.exec(`RESET ROLE`);
await q(`UPDATE helper_profiles SET station = 'Kitchen' WHERE id = $1`, [P_ANA]);
await q(
  `UPDATE household_stations SET name = 'Kusina' WHERE household_id = $1 AND name = 'Kitchen'`,
  [H],
);
const ana = (await q(`SELECT station FROM helper_profiles WHERE id = $1`, [P_ANA]))[0].station;
const sop = (await q(`SELECT station FROM house_sops WHERE household_id = $1`, [H]))[0].station;
check("a rename follows onto the staff on it", ana === "Kusina", ana);
check("and onto the house's SOPs", sop === "Kusina", sop);
await db.exec(`SET ROLE authenticated`);
await as(BEN);

// Remove: refused while anyone current is on it, allowed once nobody is.
check(
  "can't remove a station someone current is on",
  (
    (await fails(`DELETE FROM household_stations WHERE household_id = $1 AND name = 'Guard'`, [
      H,
    ])) ?? ""
  ).includes("1 person is on"),
);
check(
  "a pending invite counts as on it",
  (
    (await fails(`DELETE FROM household_stations WHERE household_id = $1 AND name = 'Kusina'`, [
      H,
    ])) ?? ""
  ).includes("1 person is on"),
);
await q(`DELETE FROM household_stations WHERE household_id = $1 AND name = 'Gardener'`, [H]);
check("someone who left doesn't hold a station up", !(await names(H)).includes("Gardener"));
check(
  "who left keeps the name they had",
  (await q(`SELECT station FROM helper_profiles WHERE id = $1`, [P_LEFT]))[0].station ===
    "Gardener ",
);

// Who may change the list.
await as(ROSA);
check("a helper reads the list", (await q(`SELECT name FROM household_stations`)).length > 0);
await q(`DELETE FROM household_stations WHERE name = 'House'`);
await db.exec(`RESET ROLE`);
check("but a helper can't remove one", (await names(H)).includes("House"));
await db.exec(`SET ROLE authenticated`);
await as(LOLA);
await q(`UPDATE household_stations SET name = 'Bahay' WHERE name = 'House'`);
await db.exec(`RESET ROLE`);
check("nor can a remote admin rename one", (await names(H)).includes("House"));
await db.exec(`SET ROLE authenticated`);
await as(CRUZ);
await q(`DELETE FROM household_stations WHERE household_id = $1 AND name = 'House'`, [H]);
await db.exec(`RESET ROLE`);
check("nor another household's manager", (await names(H)).includes("House"));

// Never none.
await db.exec(`SET ROLE authenticated`);
await as(CRUZ);
for (const n of ["Yaya", "Cook", "Laundry", "Driver"]) {
  await q(`DELETE FROM household_stations WHERE household_id = $1 AND name = $2`, [H2, n]);
}
check(
  "a household keeps at least one",
  ((await fails(`DELETE FROM household_stations WHERE household_id = $1`, [H2])) ?? "").includes(
    "at least one",
  ),
);

await db.exec(`RESET ROLE`);
console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
