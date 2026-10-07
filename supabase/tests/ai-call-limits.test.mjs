// Runs add-ai-call-limits.sql against a real Postgres (PGlite): a signed-in
// user gets 60 calls an hour per AI function and 300 a day in all, nobody
// signed out gets any, users don't share allowances, and nobody can read or
// clear the counts directly.
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
await db.exec(readFileSync(`${REPO}/add-ai-call-limits.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-ai-call-limits.sql`, "utf8"));
console.log("migration applied twice");

const BEN = "00000000-0000-0000-0000-00000000000a";
const ROSA = "00000000-0000-0000-0000-00000000000b";
await db.exec(`INSERT INTO auth.users VALUES ('${BEN}'), ('${ROSA}');`);

await db.exec(`SET ROLE authenticated`);
const take = async (fn) => (await q(`SELECT public.take_ai_call($1) AS ok`, [fn]))[0].ok;
const takeMany = async (fn, n) => {
  let granted = 0;
  for (let i = 0; i < n; i++) if (await take(fn)) granted++;
  return granted;
};

await as(null);
check("signed out: no call", (await take("route-utos")) === false);

await as(BEN);
check("signed in: a call", (await take("route-utos")) === true);
const more = await takeMany("route-utos", 60);
check("60 an hour to one function, then no more", more === 59, more);
check("another function still has its own hour", (await take("generate-sop")) === true);

await as(ROSA);
check("another user isn't affected", (await take("route-utos")) === true);

check(
  "an unknown function name is refused",
  ((await fails(`SELECT public.take_ai_call('anything')`)) ?? "").includes("Unknown AI function"),
);
check(
  "the counts can't be read directly",
  ((await fails(`SELECT * FROM public.ai_calls`)) ?? "").includes("permission denied"),
);
check(
  "or cleared",
  ((await fails(`DELETE FROM public.ai_calls`)) ?? "").includes("permission denied"),
);
check(
  "or added to directly",
  (
    (await fails(`INSERT INTO public.ai_calls (user_id, fn) VALUES ($1, 'route-utos')`, [ROSA])) ??
    ""
  ).includes("permission denied"),
);

// The day: Ben has 61 so far (60 route-utos, 1 generate-sop); the other
// functions take him to 300 and then stop.
await as(BEN);
let day = 61;
for (const fn of ["generate-sop", "parse-scheduler", "simplify-sop", "promote-voice-task"]) {
  day += await takeMany(fn, 60);
}
day += await takeMany("transcribe-notes", 60);
check("300 a day across all functions", day === 300, day);

// An hour later the hourly limit has passed, but the daily one hasn't.
await db.exec(`RESET ROLE`);
await q(`UPDATE public.ai_calls SET at = at - interval '2 hours' WHERE user_id = $1`, [BEN]);
await db.exec(`SET ROLE authenticated`);
check("over the day's 300, even with the hour passed", (await take("route-utos")) === false);

// The next day, and old rows are cleared as calls come in.
await db.exec(`RESET ROLE`);
await q(`UPDATE public.ai_calls SET at = at - interval '3 days' WHERE user_id = $1`, [BEN]);
await db.exec(`SET ROLE authenticated`);
check("a new day, a new allowance", (await take("route-utos")) === true);
await db.exec(`RESET ROLE`);
const left = (
  await q(`SELECT count(*)::int AS n FROM public.ai_calls WHERE user_id = $1`, [BEN])
)[0].n;
check("calls older than two days are cleared", left === 1, left);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
