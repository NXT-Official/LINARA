// Runs add-grocery-receipts.sql against a real Postgres (PGlite): anyone in
// the household adds a receipt of their own, under their household's folder;
// only they or a manager remove it; nobody edits one; other households see
// nothing.
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

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
await db.exec(`
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false;
`);
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));
// Supabase's default: new public tables are granted to the API roles.
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated`);
await db.exec(readFileSync(`${REPO}/add-grocery-receipts.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-grocery-receipts.sql`, "utf8"));
console.log("migration applied twice");

const M = "00000000-0000-0000-0000-00000000000a"; // manager, household H
const U = "00000000-0000-0000-0000-00000000000b"; // helper, household H
const U2 = "00000000-0000-0000-0000-00000000000d"; // another helper, household H
const M2 = "00000000-0000-0000-0000-00000000000c"; // manager, household H2
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${U}'), ('${U2}'), ('${M2}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO user_profiles VALUES ('${U2}', '${H}', 'Rosa Lim', 'helper', now());
  INSERT INTO user_profiles VALUES ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager', now());
`);
await db.exec(`SET ROLE authenticated`);

const add = (household, path) =>
  q(`INSERT INTO grocery_receipts (household_id, storage_path) VALUES ($1, $2) RETURNING id`, [
    household,
    path,
  ]);

await as(U);
const [{ id: receipt }] = await add(H, `${H}/receipts/a.jpg`);
check("a helper adds a receipt, with no task needed", Boolean(receipt));
check(
  "it's marked as hers",
  (await q(`SELECT uploaded_by FROM grocery_receipts WHERE id = $1`, [receipt]))[0].uploaded_by ===
    U,
);
await expectError(
  "not under another household's folder",
  () => add(H, `${H2}/receipts/b.jpg`),
  /grocery_receipts_path_in_household/,
);
await expectError(
  "nor for another household",
  () => add(H2, `${H2}/receipts/b.jpg`),
  /row-level security/,
);
await expectError(
  "nor in someone else's name",
  () =>
    q(
      `INSERT INTO grocery_receipts (household_id, storage_path, uploaded_by) VALUES ($1, $2, $3)`,
      [H, `${H}/receipts/c.jpg`, U2],
    ),
  /row-level security/,
);
await expectError(
  "nobody edits one",
  () => q(`UPDATE grocery_receipts SET storage_path = $1 WHERE id = $2`, [`${H}/x.jpg`, receipt]),
  /permission denied/,
);

await as(U2);
check("the household sees it", (await q(`SELECT id FROM grocery_receipts`)).length === 1);
check(
  "another helper can't remove it",
  (await changes(`DELETE FROM grocery_receipts WHERE id = $1`, [receipt])) === 0,
);

await as(M2);
check("another household sees nothing", (await q(`SELECT id FROM grocery_receipts`)).length === 0);

await as(M);
check(
  "a manager can remove it",
  (await changes(`DELETE FROM grocery_receipts WHERE id = $1`, [receipt])) === 1,
);

await as(U);
const [{ id: mine }] = await add(H, `${H}/receipts/d.jpg`);
check(
  "and so can whoever added it",
  (await changes(`DELETE FROM grocery_receipts WHERE id = $1`, [mine])) === 1,
);

await db.exec(`RESET ROLE`);
console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
