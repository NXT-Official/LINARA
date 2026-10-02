// Runs add-grocery-restock.sql against a real Postgres (PGlite): ticking a
// linked palengke item bought restocks its pantry item, unticking takes it
// back (never below zero), and unlinked items or cost edits change nothing.
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
// The two tables as ARCHITECTURE.md §8 has them, with the household-wide
// policy fix-household-rls-recursion.sql gives them (current_household_id()
// is in base-schema.sql).
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
await db.exec(readFileSync(`${REPO}/add-grocery-restock.sql`, "utf8"));
console.log("migration applied twice");

const H = "10000000-0000-0000-0000-000000000001";
const HELPER = "00000000-0000-0000-0000-00000000000b";
const P_RICE = "50000000-0000-0000-0000-000000000001";
const G_RICE = "60000000-0000-0000-0000-000000000001";
const G_ULAM = "60000000-0000-0000-0000-000000000002";
const G_BOUGHT_ON_ADD = "60000000-0000-0000-0000-000000000003";

await db.exec(`
  INSERT INTO auth.users VALUES ('${HELPER}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household');
  INSERT INTO user_profiles VALUES ('${HELPER}', '${H}', 'Rosa', 'helper', now());
  INSERT INTO pantry_items (id, household_id, name, qty, unit, par, category)
    VALUES ('${P_RICE}', '${H}', 'Rice', 1, 'kg', 2, 'Rice & grains');
  INSERT INTO grocery_items (id, household_id, name, qty, unit, pantry_item_id)
    VALUES ('${G_RICE}', '${H}', 'Rice', 5, 'kg', '${P_RICE}'),
           ('${G_ULAM}', '${H}', 'Ulam for Sunday', 1, 'pcs', NULL);
`);

// She ticks things off on her phone, under her own session.
await db.exec(`SET ROLE authenticated`);
await as(HELPER);
const rice = async () =>
  Number((await one(`SELECT qty FROM pantry_items WHERE id = $1`, [P_RICE])).qty);

check("adding an unbought item changes nothing", (await rice()) === 1, await rice());

await q(`UPDATE grocery_items SET bought = true WHERE id = $1`, [G_RICE]);
check("ticking the linked item adds its qty", (await rice()) === 6, await rice());

await q(`UPDATE grocery_items SET actual_cost = 250 WHERE id = $1`, [G_RICE]);
check("entering the cost doesn't restock again", (await rice()) === 6, await rice());

await q(`UPDATE grocery_items SET bought = true WHERE id = $1`, [G_RICE]);
check("ticking it again (no change) doesn't double", (await rice()) === 6, await rice());

await q(`UPDATE grocery_items SET bought = false WHERE id = $1`, [G_RICE]);
check("unticking takes it back off", (await rice()) === 1, await rice());

await q(`UPDATE grocery_items SET bought = true WHERE id = $1`, [G_ULAM]);
check("an unlinked item restocks nothing", (await rice()) === 1, await rice());

await q(`UPDATE grocery_items SET bought = true WHERE id = $1`, [G_RICE]);
await q(`UPDATE pantry_items SET qty = 2 WHERE id = $1`, [P_RICE]); // they cooked most of it
await q(`UPDATE grocery_items SET bought = false WHERE id = $1`, [G_RICE]);
check("unticking never takes stock below zero", (await rice()) === 0, await rice());

await q(
  `INSERT INTO grocery_items (id, household_id, name, qty, unit, pantry_item_id, bought)
   VALUES ($1, $2, 'Rice', 3, 'kg', $3, true)`,
  [G_BOUGHT_ON_ADD, H, P_RICE],
);
check("an item added already bought restocks too", (await rice()) === 3, await rice());

await db.exec(`RESET ROLE`);
console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
