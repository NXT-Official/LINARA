// Runs add-platform-admins.sql against a real Postgres (PGlite): only people
// listed in platform_admins are platform admins, a non-admin can't see who
// the admins are, and nobody can add themselves through the API.
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
await db.exec(readFileSync(`${REPO}/add-platform-admins.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-platform-admins.sql`, "utf8"));
console.log("migration applied twice");

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
await db.exec(`INSERT INTO auth.users VALUES ('${A}'), ('${B}');`);

await db.exec(`SET ROLE authenticated`);
const amI = async () => (await q(`SELECT public.am_i_platform_admin() AS ok`))[0].ok;
const isAdmin = async () => (await q(`SELECT public.is_platform_admin() AS ok`))[0].ok;

await as(A);
check("nobody is an admin to start with", (await amI()) === false);

await db.exec(`RESET ROLE`);
await q(`INSERT INTO public.platform_admins (user_id, note) VALUES ($1, 'owner')`, [A]);
await db.exec(`SET ROLE authenticated`);

await as(A);
check("A is an admin once listed", (await amI()) === true && (await isAdmin()) === true);
const mine = await q(`SELECT user_id FROM public.platform_admins`);
check("A can read the list", mine.length === 1, mine.length);

await as(B);
check("B is not an admin", (await amI()) === false && (await isAdmin()) === false);
const seen = await q(`SELECT user_id FROM public.platform_admins WHERE user_id = $1`, [A]);
check("B can't see A's row", seen.length === 0, seen.length);

check(
  "B can't add themselves",
  ((await fails(`INSERT INTO public.platform_admins (user_id) VALUES ($1)`, [B])) ?? "").length > 0,
);
await as(A);
check(
  "even an admin can't add through the API",
  ((await fails(`INSERT INTO public.platform_admins (user_id) VALUES ($1)`, [B])) ?? "").length > 0,
);
check(
  "or remove through the API",
  ((await fails(`DELETE FROM public.platform_admins WHERE user_id = $1`, [A])) ?? "").length > 0,
);

await as(null);
check("signed out is no admin", (await amI()) === false);

await db.exec(`RESET ROLE`);
const total = (await q(`SELECT count(*)::int AS n FROM public.platform_admins`))[0].n;
check("the list is unchanged", total === 1, total);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
