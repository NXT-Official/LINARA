// Runs add-faqs.sql against a real Postgres (PGlite): anyone can read published
// FAQs, only platform admins can read drafts or write, and the CHECKs hold.
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
await db.exec(readFileSync(`${REPO}/add-faqs.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-faqs.sql`, "utf8"));
console.log("migration applied twice");

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const USER = "00000000-0000-0000-0000-00000000000b";
await db.exec(`INSERT INTO auth.users VALUES ('${ADMIN}'), ('${USER}');`);
await db.exec(`INSERT INTO public.platform_admins (user_id, note) VALUES ('${ADMIN}', 'owner');`);

const insert = (question, published) =>
  q(
    `INSERT INTO public.faqs (question, answer, published) VALUES ($1, 'An answer.', $2) RETURNING id`,
    [question, published],
  );

await db.exec(`SET ROLE authenticated`);

await as(USER);
check(
  "a non-admin can't insert",
  ((await fails(`INSERT INTO public.faqs (question, answer) VALUES ('Q', 'A')`)) ?? "").length > 0,
);

await as(ADMIN);
const live = (await insert("Is it free?", true))[0].id;
await insert("Draft question", false);
check("admin inserted two", (await q(`SELECT id FROM public.faqs`)).length === 2);
const defaults = (await q(`SELECT category, sort_order FROM public.faqs WHERE id = $1`, [live]))[0];
check(
  "defaults: General, sort 0",
  defaults.category === "General" && defaults.sort_order === 0,
  defaults,
);

await as(USER);
const seenByUser = await q(`SELECT question FROM public.faqs`);
check(
  "non-admin sees only the published one",
  seenByUser.length === 1 && seenByUser[0].question === "Is it free?",
  seenByUser,
);
check(
  "non-admin can't update",
  (await q(`UPDATE public.faqs SET answer = 'x' RETURNING id`)).length === 0,
);
check("non-admin can't delete", (await q(`DELETE FROM public.faqs RETURNING id`)).length === 0);

await db.exec(`SET ROLE anon`);
const seenByAnon = await q(`SELECT question FROM public.faqs`);
check("anon sees only the published one", seenByAnon.length === 1, seenByAnon);
check(
  "anon can't insert",
  ((await fails(`INSERT INTO public.faqs (question, answer) VALUES ('Q', 'A')`)) ?? "").length > 0,
);

await db.exec(`SET ROLE authenticated`);
await as(ADMIN);
check("admin sees both", (await q(`SELECT id FROM public.faqs`)).length === 2);

const before = (await q(`SELECT updated_at FROM public.faqs WHERE id = $1`, [live]))[0].updated_at;
await q(`SELECT pg_sleep(0.05)`);
const after = (
  await q(
    `UPDATE public.faqs SET answer = 'Changed.' WHERE id = $1 RETURNING updated_at, updated_by`,
    [live],
  )
)[0];
check("update moves updated_at", new Date(after.updated_at) > new Date(before), after.updated_at);
check("update records updated_by", after.updated_by === ADMIN, after.updated_by);

check(
  "empty question is rejected",
  ((await fails(`INSERT INTO public.faqs (question, answer) VALUES ('', 'A')`)) ?? "").length > 0,
);
check(
  "empty answer is rejected",
  ((await fails(`INSERT INTO public.faqs (question, answer) VALUES ('Q', '')`)) ?? "").length > 0,
);
check(
  "overlong question is rejected",
  ((await fails(`INSERT INTO public.faqs (question, answer) VALUES (repeat('q', 201), 'A')`)) ?? "")
    .length > 0,
);
check(
  "overlong category is rejected",
  (
    (await fails(
      `INSERT INTO public.faqs (question, answer, category) VALUES ('Q', 'A', repeat('c', 41))`,
    )) ?? ""
  ).length > 0,
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
