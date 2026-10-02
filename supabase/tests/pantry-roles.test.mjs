// Runs add-pantry-roles.sql against a real Postgres (PGlite), after the
// restock trigger it sits beside: helpers already here become leads, new ones
// start as runners; a runner can tick what she bought, enter its cost and say
// something ran out, and nothing else; leads and managers keep everything.
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
const works = async (fn) => {
  try {
    await fn();
    return true;
  } catch (e) {
    console.log(`     (${e.message})`);
    return false;
  }
};

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
// The two tables as ARCHITECTURE.md §8 has them, with the household-wide
// policy fix-household-rls-recursion.sql gives them.
await db.exec(`
  GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated;
  CREATE TABLE public.pantry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    name TEXT NOT NULL,
    qty NUMERIC(6,2) NOT NULL,
    unit TEXT NOT NULL,
    par NUMERIC(6,2) NOT NULL,
    category TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE public.grocery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    name TEXT NOT NULL,
    qty NUMERIC(6,2) NOT NULL,
    unit TEXT NOT NULL,
    pantry_item_id UUID REFERENCES public.pantry_items(id) ON DELETE SET NULL,
    bought BOOLEAN NOT NULL DEFAULT FALSE,
    actual_cost NUMERIC(10,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pantry_items_isolation ON public.pantry_items
    FOR ALL USING (household_id = public.current_household_id());
  CREATE POLICY grocery_items_isolation ON public.grocery_items
    FOR ALL USING (household_id = public.current_household_id());
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.pantry_items, public.grocery_items TO authenticated;
`);
await db.exec(readFileSync(`${REPO}/add-grocery-restock.sql`, "utf8"));
// Her own helper_profiles row is guarded by this one (her availability only),
// which is what keeps her from raising her own pantry_role.
await db.exec(`
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false;
`);
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));

const H = "10000000-0000-0000-0000-000000000001";
const M = "00000000-0000-0000-0000-00000000000a"; // manager
const OLD = "00000000-0000-0000-0000-00000000000b"; // helper here before the migration
const NEW = "00000000-0000-0000-0000-00000000000c"; // helper invited after it
const HP_OLD = "20000000-0000-0000-0000-000000000001";
const HP_NEW = "20000000-0000-0000-0000-000000000002";
const P_RICE = "50000000-0000-0000-0000-000000000001";
const P_EGGS = "50000000-0000-0000-0000-000000000002";
const G_RICE = "60000000-0000-0000-0000-000000000001";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${OLD}'), ('${NEW}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${OLD}', '${H}', 'Rosa', 'helper', now());
  INSERT INTO user_profiles VALUES ('${NEW}', '${H}', 'Marites', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status)
    VALUES ('${HP_OLD}', '${OLD}', '${H}', 'Rosa', 'Cook', 8000, 'semi_monthly', 'ACTIVE');
  INSERT INTO pantry_items (id, household_id, name, qty, unit, par, category)
    VALUES ('${P_RICE}', '${H}', 'Bigas', 3, 'kg', 5, 'Rice & grains'),
           ('${P_EGGS}', '${H}', 'Itlog', 12, 'pcs', 6, 'Fresh');
  INSERT INTO grocery_items (id, household_id, name, qty, unit, pantry_item_id)
    VALUES ('${G_RICE}', '${H}', 'Bigas', 5, 'kg', '${P_RICE}');
`);
await db.exec(readFileSync(`${REPO}/add-pantry-roles.sql`, "utf8"));
await db.exec(`
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status)
    VALUES ('${HP_NEW}', '${NEW}', '${H}', 'Marites', 'House', 7000, 'semi_monthly', 'ACTIVE');
`);
await db.exec(readFileSync(`${REPO}/add-pantry-roles.sql`, "utf8"));
console.log("migration applied twice");

const roleOf = async (id) =>
  (await one(`SELECT pantry_role FROM helper_profiles WHERE id = $1`, [id])).pantry_role;
check("a helper already here became a lead", (await roleOf(HP_OLD)) === "lead");
check(
  "a helper invited later starts as a runner, even after a re-run",
  (await roleOf(HP_NEW)) === "runner",
);

await db.exec(`SET ROLE authenticated`);
const qtyOf = async (id) =>
  Number((await one(`SELECT qty FROM pantry_items WHERE id = $1`, [id])).qty);

// --- The runner -------------------------------------------------------------
await as(NEW);
check("the runner reads the pantry", (await q(`SELECT id FROM pantry_items`)).length === 2);
check(
  "she can tick what she bought, which restocks the pantry",
  (await works(() => q(`UPDATE grocery_items SET bought = true WHERE id = $1`, [G_RICE]))) &&
    (await qtyOf(P_RICE)) === 8,
  await qtyOf(P_RICE),
);
check(
  "and enter what it cost",
  await works(() => q(`UPDATE grocery_items SET actual_cost = 260 WHERE id = $1`, [G_RICE])),
);
check(
  "and untick a mis-tap, which takes the stock back off",
  (await works(() => q(`UPDATE grocery_items SET bought = false WHERE id = $1`, [G_RICE]))) &&
    (await qtyOf(P_RICE)) === 3,
  await qtyOf(P_RICE),
);
check(
  "she can say the eggs ran out (count to zero)",
  (await works(() =>
    q(`UPDATE pantry_items SET qty = 0, updated_at = now() WHERE id = $1`, [P_EGGS]),
  )) && (await qtyOf(P_EGGS)) === 0,
);
check(
  "and put them on the palengke list",
  await works(() =>
    q(
      `INSERT INTO grocery_items (household_id, name, qty, unit, pantry_item_id) VALUES ($1, 'Itlog', 6, 'pcs', $2)`,
      [H, P_EGGS],
    ),
  ),
);
await expectError(
  "she can't set any other count",
  () => q(`UPDATE pantry_items SET qty = 20 WHERE id = $1`, [P_RICE]),
  /namamahala ng pantry/,
);
await expectError(
  "or change an item's buy-more point",
  () => q(`UPDATE pantry_items SET par = 1 WHERE id = $1`, [P_RICE]),
  /namamahala ng pantry/,
);
await expectError(
  "or zero it while renaming it",
  () => q(`UPDATE pantry_items SET qty = 0, name = 'X' WHERE id = $1`, [P_RICE]),
  /namamahala ng pantry/,
);
await expectError(
  "or add a pantry item",
  () =>
    q(
      `INSERT INTO pantry_items (household_id, name, qty, unit, par, category) VALUES ($1, 'Kape', 2, 'packs', 1, 'Pantry')`,
      [H],
    ),
  /namamahala ng pantry/,
);
await expectError(
  "or remove one",
  () => q(`DELETE FROM pantry_items WHERE id = $1`, [P_RICE]),
  /namamahala ng pantry/,
);
await expectError(
  "or put a free-typed line on the list",
  () =>
    q(
      `INSERT INTO grocery_items (household_id, name, qty, unit) VALUES ($1, 'Ulam for Sunday', 1, 'pc')`,
      [H],
    ),
  /palengke list/,
);
await expectError(
  "or add one already bought",
  () =>
    q(
      `INSERT INTO grocery_items (household_id, name, qty, unit, pantry_item_id, bought) VALUES ($1, 'Bigas', 50, 'kg', $2, true)`,
      [H, P_RICE],
    ),
  /palengke list/,
);
await expectError(
  "or change how much to buy",
  () => q(`UPDATE grocery_items SET qty = 50 WHERE id = $1`, [G_RICE]),
  /palengke list/,
);
await expectError(
  "or take a line off the list",
  () => q(`DELETE FROM grocery_items WHERE id = $1`, [G_RICE]),
  /palengke list/,
);
await expectError(
  "or make herself a lead",
  () => q(`UPDATE helper_profiles SET pantry_role = 'lead' WHERE id = $1`, [HP_NEW]),
  /Only your availability/,
);
check("so she's still a runner", (await roleOf(HP_NEW)) === "runner");

// --- The lead ---------------------------------------------------------------
await as(OLD);
check(
  "a lead sets counts, adds, edits and removes as before",
  (await works(() => q(`UPDATE pantry_items SET qty = 9, par = 4 WHERE id = $1`, [P_RICE]))) &&
    (await works(() =>
      q(
        `INSERT INTO pantry_items (household_id, name, qty, unit, par, category) VALUES ($1, 'Kape', 2, 'packs', 1, 'Pantry')`,
        [H],
      ),
    )) &&
    (await works(() =>
      q(`INSERT INTO grocery_items (household_id, name, qty, unit) VALUES ($1, 'Ulam', 1, 'pc')`, [
        H,
      ]),
    )) &&
    (await works(() => q(`DELETE FROM grocery_items WHERE name = 'Ulam'`))),
);

// --- The manager ------------------------------------------------------------
await as(M);
check(
  "a manager keeps everything, and makes the runner a lead",
  (await works(() => q(`UPDATE pantry_items SET qty = 7 WHERE id = $1`, [P_RICE]))) &&
    (await works(() => q(`DELETE FROM pantry_items WHERE name = 'Kape'`))) &&
    (await works(() =>
      q(`UPDATE helper_profiles SET pantry_role = 'lead' WHERE id = $1`, [HP_NEW]),
    )),
);
await expectError(
  "but not to anything else",
  () => q(`UPDATE helper_profiles SET pantry_role = 'boss' WHERE id = $1`, [HP_NEW]),
  /check constraint/,
);

await as(NEW);
check(
  "once raised, she can change counts too",
  (await works(() => q(`UPDATE pantry_items SET qty = 10 WHERE id = $1`, [P_RICE]))) &&
    (await qtyOf(P_RICE)) === 10,
);

await db.exec(`RESET ROLE`);
console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
