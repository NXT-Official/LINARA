// Runs add-plans.sql against a real Postgres (PGlite): only platform admins
// can write plans or platform settings, everyone sees active public plans,
// drafts stay hidden from non-admins, and the CHECKs hold.
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
await db.exec(readFileSync(`${REPO}/add-plans.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-plans.sql`, "utf8"));
console.log("migration applied twice");

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const USER = "00000000-0000-0000-0000-00000000000b";
await db.exec(`INSERT INTO auth.users VALUES ('${ADMIN}'), ('${USER}');`);
await q(`INSERT INTO public.platform_admins (user_id, note) VALUES ($1, 'owner')`, [ADMIN]);

const INSERT_PLAN = `INSERT INTO public.plans (name, interval, base_centavos)
                     VALUES ($1, $2, $3) RETURNING id`;

await db.exec(`SET ROLE authenticated`);

await as(USER);
check(
  "non-admin can't insert a plan",
  ((await fails(INSERT_PLAN, ["Sneaky", "monthly", 100])) ?? "").length > 0,
);

await as(ADMIN);
const starter = (await q(INSERT_PLAN, ["Starter", "monthly", 49900]))[0].id;
check("admin inserts a draft", typeof starter === "string");
const defaults = (
  await q(`SELECT status, is_public, trial_days FROM public.plans WHERE id = $1`, [starter])
)[0];
check(
  "new plan defaults to a private draft",
  defaults.status === "draft" && defaults.is_public === false && defaults.trial_days === 0,
  defaults,
);

await as(USER);
check("non-admin sees 0 plans", (await q(`SELECT id FROM public.plans`)).length === 0);

await as(ADMIN);
const activated = await q(
  `UPDATE public.plans SET status = 'active', is_public = true WHERE id = $1 RETURNING id`,
  [starter],
);
check("admin activates and publishes", activated.length === 1);

await as(USER);
check("non-admin sees 1 plan", (await q(`SELECT id FROM public.plans`)).length === 1);
const userUpdate = await q(`UPDATE public.plans SET base_centavos = 1 WHERE id = $1 RETURNING id`, [
  starter,
]);
check("non-admin can't update a plan", userUpdate.length === 0, userUpdate.length);
const userDelete = await q(`DELETE FROM public.plans WHERE id = $1 RETURNING id`, [starter]);
check("non-admin can't delete a plan", userDelete.length === 0, userDelete.length);

await as(ADMIN);
await q(INSERT_PLAN, ["Hidden draft", "yearly", 99900]);
await db.exec(`SET ROLE anon`);
await as(null);
const anonSees = await q(`SELECT name FROM public.plans`);
check(
  "anon sees only the active public plan",
  anonSees.length === 1 && anonSees[0].name === "Starter",
  anonSees,
);
check(
  "anon can't read platform settings",
  ((await fails(`SELECT id FROM public.platform_settings`)) ?? "").length > 0,
);
await db.exec(`SET ROLE authenticated`);

await as(ADMIN);
const before = (await q(`SELECT updated_at FROM public.plans WHERE id = $1`, [starter]))[0]
  .updated_at;
await new Promise((r) => setTimeout(r, 20));
await q(`UPDATE public.plans SET tagline = 'For one home' WHERE id = $1`, [starter]);
const after = (await q(`SELECT updated_at FROM public.plans WHERE id = $1`, [starter]))[0]
  .updated_at;
check("updated_at moves on update", new Date(after) > new Date(before), { before, after });

check(
  "CHECK rejects interval 'weekly'",
  ((await fails(INSERT_PLAN, ["Bad", "weekly", 100])) ?? "").length > 0,
);
check(
  "CHECK rejects negative base_centavos",
  ((await fails(INSERT_PLAN, ["Bad", "monthly", -1])) ?? "").length > 0,
);
check(
  "CHECK rejects status 'deleted'",
  ((await fails(`UPDATE public.plans SET status = 'deleted' WHERE id = $1`, [starter])) ?? "")
    .length > 0,
);
check(
  "CHECK rejects negative included_helpers",
  ((await fails(`UPDATE public.plans SET included_helpers = -1 WHERE id = $1`, [starter])) ?? "")
    .length > 0,
);

const settings = await q(`SELECT id FROM public.platform_settings`);
check("platform_settings has exactly one row", settings.length === 1 && settings[0].id === 1);

await as(USER);
check(
  "non-admin can read platform settings",
  (await q(`SELECT id FROM public.platform_settings`)).length === 1,
);
const userSet = await q(
  `UPDATE public.platform_settings SET free_tier_enabled = false RETURNING id`,
);
check("non-admin can't update platform settings", userSet.length === 0, userSet.length);

await as(ADMIN);
const adminSet = await q(
  `UPDATE public.platform_settings SET free_tier_enabled = false, free_helper_seats = 1 RETURNING free_tier_enabled`,
);
check(
  "admin updates platform settings",
  adminSet.length === 1 && adminSet[0].free_tier_enabled === false,
);
check(
  "nobody inserts a second settings row",
  ((await fails(`INSERT INTO public.platform_settings (id) VALUES (2)`)) ?? "").length > 0,
);
check(
  "nobody deletes the settings row",
  ((await fails(`DELETE FROM public.platform_settings`)) ?? "").length > 0,
);

await db.exec(`RESET ROLE`);
const rows = (await q(`SELECT count(*)::int AS n FROM public.platform_settings`))[0].n;
check("settings row still there", rows === 1, rows);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
