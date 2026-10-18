// Runs add-grocery-pantry-link.sql against a real Postgres (PGlite): a typed
// grocery line links itself to the one pantry item with its name and unit,
// so buying it restocks; anything else stays unlinked, and lines already
// listed are linked when the file is applied.
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
// The two tables as grocery-restock.test.mjs has them.
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

const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const MANAGER = "00000000-0000-0000-0000-00000000000a";
const P_CRACKERS = "50000000-0000-0000-0000-000000000001";
const P_RICE = "50000000-0000-0000-0000-000000000002";
const P_SOAP_A = "50000000-0000-0000-0000-000000000003";
const P_SOAP_B = "50000000-0000-0000-0000-000000000004";
const P_OTHER_HOUSE = "50000000-0000-0000-0000-000000000005";
const G_OLD = "60000000-0000-0000-0000-000000000001";
const G_OLD_BOUGHT = "60000000-0000-0000-0000-000000000002";

await db.exec(`
  INSERT INTO auth.users VALUES ('${MANAGER}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${MANAGER}', '${H}', 'Ben', 'primary_manager', now());
  INSERT INTO pantry_items (id, household_id, name, qty, unit, par, category) VALUES
    ('${P_CRACKERS}', '${H}', 'Rice Crackers', 0, 'pcs', 1, 'Pantry'),
    ('${P_RICE}', '${H}', 'Bigas', 2, 'kg', 5, 'Rice & grains'),
    ('${P_SOAP_A}', '${H}', 'Sabon', 1, 'bars', 2, 'Cleaning'),
    ('${P_SOAP_B}', '${H}', 'sabon', 0, 'bars', 1, 'Cleaning'),
    ('${P_OTHER_HOUSE}', '${H2}', 'Kangkong', 0, 'bundles', 1, 'Fresh');
  -- Listed before the file is applied: typed, one still to buy, one bought.
  INSERT INTO grocery_items (id, household_id, name, qty, unit, bought) VALUES
    ('${G_OLD}', '${H}', 'Rice Crackers', 1, 'pcs', false),
    ('${G_OLD_BOUGHT}', '${H}', 'Rice Crackers', 2, 'pcs', true);
`);
// Bought before restock existed: put the pantry back to where it was.
await q(`UPDATE pantry_items SET qty = 0 WHERE id = $1`, [P_CRACKERS]);

await db.exec(readFileSync(`${REPO}/add-grocery-pantry-link.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-grocery-pantry-link.sql`, "utf8"));
console.log("migration applied twice");

const link = async (id) =>
  (await one(`SELECT pantry_item_id FROM grocery_items WHERE id = $1`, [id])).pantry_item_id;
check(
  "an unbought line already listed is linked",
  (await link(G_OLD)) === P_CRACKERS,
  await link(G_OLD),
);
check(
  "a bought line already listed is left alone",
  (await link(G_OLD_BOUGHT)) === null,
  await link(G_OLD_BOUGHT),
);

// A manager types lines from the web.
await db.exec(`SET ROLE authenticated`);
await as(MANAGER);
const add = async (name, qty, unit, extra = {}) =>
  await one(
    `INSERT INTO grocery_items (household_id, name, qty, unit, pantry_item_id, bought)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, pantry_item_id`,
    [H, name, qty, unit, extra.pantryItemId ?? null, extra.bought ?? false],
  );

let row = await add("  rice CRACKERS ", 1, "PCS");
check(
  "a typed line takes the pantry item of its name and unit",
  row.pantry_item_id === P_CRACKERS,
  row,
);

row = await add("Bigas", 1, "sack");
check("a different unit stays unlinked", row.pantry_item_id === null, row);

row = await add("Kangkong", 2, "bundles");
check("a name only another house's pantry has stays unlinked", row.pantry_item_id === null, row);

row = await add("Sabon", 2, "bars");
check("two pantry items of that name: unlinked", row.pantry_item_id === null, row);

row = await add("Rice Crackers", 1, "pcs", { pantryItemId: P_RICE });
check("a line already linked keeps its link", row.pantry_item_id === P_RICE, row);

row = await add("Rice Crackers", 1, "pcs", { bought: true });
check("a line added already bought isn't linked", row.pantry_item_id === null, row);

row = await add("Rice cracker", 1, "pcs");
check("a near miss stays unlinked", row.pantry_item_id === null, row);
await q(`UPDATE grocery_items SET name = 'Rice Crackers' WHERE id = $1`, [row.id]);
check(
  "renamed to the pantry name, it links",
  (await link(row.id)) === P_CRACKERS,
  await link(row.id),
);

const crackers = async () =>
  Number((await one(`SELECT qty FROM pantry_items WHERE id = $1`, [P_CRACKERS])).qty);
await q(`UPDATE grocery_items SET bought = true WHERE id = $1`, [row.id]);
check("buying a linked typed line restocks the pantry", (await crackers()) === 1, await crackers());

await db.exec(`RESET ROLE`);
console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
