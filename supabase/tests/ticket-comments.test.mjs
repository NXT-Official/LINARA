// Updates on tasks (add-ticket-comments.sql), against PGlite on base-schema.sql.
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
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`);
};
const expectError = async (label, fn, pattern) => {
  try {
    await fn();
    check(label, false, "no error");
  } catch (e) {
    check(label, pattern.test(e.message), e.message);
  }
};

const read = (f) => readFileSync(`${REPO}/${f}`, "utf8");
await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
await db.exec(read("add-employment-end.sql"));
await db.exec(read("add-unassigned-tasks.sql"));
await db.exec(read("add-ticket-comments.sql"));
console.log("migrations applied");

const M = "00000000-0000-0000-0000-00000000000a"; // manager
const U = "00000000-0000-0000-0000-00000000000b"; // Marites, the task is hers
const U2 = "00000000-0000-0000-0000-00000000000d"; // Rosa, same household
const M2 = "00000000-0000-0000-0000-00000000000c"; // another household's manager
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const HP = "20000000-0000-0000-0000-000000000001";
const HP2 = "20000000-0000-0000-0000-000000000002";
const T = "30000000-0000-0000-0000-000000000001";
const T_OPEN = "30000000-0000-0000-0000-000000000002";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${U}'), ('${U2}'), ('${M2}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO user_profiles VALUES ('${U2}', '${H}', 'Rosa Dela Cruz', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE'),
           ('${HP2}', '${U2}', '${H}', 'Rosa', 'Cook', 7000, 'semi_monthly', 'ACTIVE');
  INSERT INTO tickets (id, household_id, title, helper_id) VALUES
    ('${T}', '${H}', 'Laundry', '${HP}'), ('${T_OPEN}', '${H}', 'Wash the car', NULL);
`);

const post = (ticket, body) =>
  q(`INSERT INTO ticket_comments (ticket_id, body) VALUES ($1, $2) RETURNING *`, [ticket, body]);

await db.exec(`SET ROLE authenticated`);

await as(U);
const [mine] = await post(T, "  Naubos na ang sabon, bumili ako.  ");
check("she can post on her task", mine && mine.author_id === U && mine.author_name === "Marites Santos", mine);
check("the body is trimmed", mine.body === "Naubos na ang sabon, bumili ako.");
await expectError("she can't post as someone else",
  () => q(`INSERT INTO ticket_comments (ticket_id, body, author_id, author_name) VALUES ($1, 'x', $2, 'Ben Reyes') RETURNING author_name`, [T, M])
    .then((r) => { if (r[0].author_name !== "Marites Santos") throw new Error("spoofed"); throw new Error("stamped as herself"); }),
  /stamped as herself/);
await expectError("an empty update is refused", () => post(T, "   "), /check constraint|violates/);

await as(M);
await post(T, "Use the blue one, nasa ilalim ng lababo.");
check("the manager reads the whole thread", (await q(`SELECT id FROM ticket_comments WHERE ticket_id = $1`, [T])).length === 3);
await post(T_OPEN, "Whoever's free this afternoon.");
check("and can post on an unassigned task", (await q(`SELECT id FROM ticket_comments WHERE ticket_id = $1`, [T_OPEN])).length === 1);

await as(U2);
check("another helper sees none of it", (await q(`SELECT id FROM ticket_comments`)).length === 0);
await expectError("or posts on a task that isn't hers", () => post(T, "hi"), /row-level security/);

await as(M2);
check("another household's manager sees none of it", (await q(`SELECT id FROM ticket_comments`)).length === 0);

await as(U);
check("she doesn't see the unassigned task's thread", (await q(`SELECT id FROM ticket_comments WHERE ticket_id = $1`, [T_OPEN])).length === 0);
const edited = await q(`UPDATE ticket_comments SET body = 'Naubos na ang sabon. Bumili na ako ng bago.' WHERE id = $1 RETURNING edited_at, author_id`, [mine.id]);
check("she can edit her own", edited.length === 1 && edited[0].edited_at !== null && edited[0].author_id === U, edited);
const notMine = await q(`UPDATE ticket_comments SET body = 'changed' WHERE author_id = $1 RETURNING id`, [M]);
check("but not the manager's", notMine.length === 0);
const deleted = await q(`DELETE FROM ticket_comments WHERE author_id = $1 RETURNING id`, [M]);
check("or delete it", deleted.length === 0);
check("she can delete her own", (await q(`DELETE FROM ticket_comments WHERE id = $1 RETURNING id`, [mine.id])).length === 1);

await db.exec(`RESET ROLE`);
await db.exec(`DELETE FROM tickets WHERE id = '${T}'`);
check("deleting a task deletes its thread", (await q(`SELECT id FROM ticket_comments WHERE ticket_id = $1`, [T])).length === 0);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
