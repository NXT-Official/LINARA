// Runs add-support-chat.sql against a real Postgres (PGlite) as the API's
// `authenticated` role: a household's manager opens a thread with Linara, a
// platform admin answers, unread counters follow each side, another
// household sees nothing, and no one writes the tables directly.
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
/** As the database owner (the SQL editor), for setup. */
const asOwner = async (fn) => {
  await db.exec("RESET ROLE");
  try {
    return await fn();
  } finally {
    await db.exec("SET ROLE authenticated");
  }
};

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
// What the live schema has that base-schema.sql doesn't, for these tables.
await db.exec(`
  ALTER TABLE user_profiles ALTER COLUMN household_id DROP NOT NULL;
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false,
                         ADD COLUMN petty_cash_budget NUMERIC(10,2) NOT NULL DEFAULT 1500;
  ALTER TABLE tickets ADD COLUMN suggested BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN emergency BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE quick_utos ADD COLUMN emergency BOOLEAN NOT NULL DEFAULT false,
                         ADD COLUMN ack_state TEXT NOT NULL DEFAULT 'sent';
  ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE quick_utos ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payout_attempts ENABLE ROW LEVEL SECURITY;
  CREATE POLICY appointments_isolation ON appointments FOR ALL USING (household_id = public.current_household_id());
  CREATE POLICY quick_utos_isolation ON quick_utos FOR ALL USING (
    EXISTS (SELECT 1 FROM helper_profiles hp WHERE hp.id = quick_utos.recipient_id AND hp.household_id = public.current_household_id()));
  CREATE POLICY payout_attempts_isolation ON payout_attempts FOR ALL USING (
    EXISTS (SELECT 1 FROM payslips p JOIN helper_profiles hp ON hp.id = p.helper_id
            WHERE p.id = payout_attempts.payslip_id AND hp.household_id = public.current_household_id()));
  CREATE POLICY user_profiles_self_read ON user_profiles FOR SELECT USING (id = auth.uid());

  CREATE FUNCTION public.ticket_ledger_source(p_helper_id UUID, p_at TIMESTAMPTZ, p_after_hours BOOLEAN, p_emergency BOOLEAN)
  RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT CASE WHEN name LIKE '%on shift%' THEN NULL ELSE 'overtime' END FROM public.helper_profiles WHERE id = p_helper_id $$;
  REVOKE ALL ON FUNCTION public.ticket_ledger_source(UUID, TIMESTAMPTZ, BOOLEAN, BOOLEAN) FROM PUBLIC;

  CREATE TABLE account_deletion_requests_placeholder ();
`);
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-account-deletion.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-household-managers.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-platform-admins.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-support-chat.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-support-chat.sql`, "utf8"));
console.log("migration applied twice");

const M1 = "00000000-0000-0000-0000-00000000000a"; // manager, Reyes
const M2 = "00000000-0000-0000-0000-00000000000c"; // manager, Cruz
const AD = "00000000-0000-0000-0000-0000000000ad"; // platform admin
const HP = "00000000-0000-0000-0000-0000000000b1"; // helper in Reyes, not a manager
const H1 = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M1}'), ('${M2}'), ('${AD}'), ('${HP}');
  INSERT INTO households (id, name) VALUES ('${H1}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${M1}', '${H1}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager', now());
  INSERT INTO user_profiles VALUES ('${HP}', '${H1}', 'Marites Santos', 'helper', now());
  INSERT INTO household_managers (household_id, user_id, role)
    VALUES ('${H1}', '${M1}', 'primary_manager'), ('${H2}', '${M2}', 'primary_manager')
    ON CONFLICT DO NOTHING;
  INSERT INTO public.platform_admins (user_id, note) VALUES ('${AD}', 'owner');
`);
await db.exec(`SET ROLE authenticated`);

const threadRow = (id) =>
  one(`SELECT status, household_unread, platform_admin_unread FROM support_threads WHERE id = $1`, [
    id,
  ]);

// --- A manager opens a thread -------------------------------------------------
await as(M1);
const { id: T } = await one(
  `SELECT public.open_support_thread($1, 'Cannot add a helper', 'Seat limit says full') AS id`,
  [H1],
);
const opened = await q(
  `SELECT from_platform_admin, body FROM support_messages WHERE thread_id = $1`,
  [T],
);
check(
  "opening makes one message from the manager",
  opened.length === 1 && !opened[0].from_platform_admin,
  opened,
);
check("the platform admin side has 1 unread", (await threadRow(T)).platform_admin_unread === 1);

await expectError(
  "opening for a household you do not manage is NOT_FOUND",
  () => q(`SELECT public.open_support_thread($1, 's', 'b')`, [H2]),
  /NOT_FOUND/,
);

// --- Another household sees nothing -------------------------------------------
await as(M2);
check("M2 sees no threads", (await q(`SELECT 1 FROM support_threads`)).length === 0);
check("M2 sees no messages", (await q(`SELECT 1 FROM support_messages`)).length === 0);
await expectError(
  "M2 posting on it is NOT_FOUND",
  () => q(`SELECT public.post_support_message($1, 'hi')`, [T]),
  /NOT_FOUND/,
);
await expectError(
  "M2 marking it read is NOT_FOUND",
  () => q(`SELECT public.mark_support_thread_read($1)`, [T]),
  /NOT_FOUND/,
);

// --- Household names: the admin reads all, everyone else only their own ------
const names = async () => (await q(`SELECT name FROM households ORDER BY name`)).map((r) => r.name);
await as(AD);
const adminNames = await names();
check(
  "the admin reads both household names",
  adminNames.length === 2 &&
    adminNames[0] === "Cruz Household" &&
    adminNames[1] === "Reyes Household",
  adminNames,
);
await as(M1);
check(
  "a manager still reads only their own household",
  (await names()).join() === "Reyes Household",
);
await as(HP);
// households_isolation is keyed on current_household_id(), so the helper sees the one row
// she works in (as before this file); the new policy adds nothing for her.
check("a helper reads only her own household's row", (await names()).join() === "Reyes Household");

// --- A helper of the household is not a manager ---------------------------------
await as(HP);
check("a helper sees no threads", (await q(`SELECT 1 FROM support_threads`)).length === 0);
check("a helper sees no messages", (await q(`SELECT 1 FROM support_messages`)).length === 0);
await expectError(
  "a helper posting is NOT_FOUND",
  () => q(`SELECT public.post_support_message($1, 'hi')`, [T]),
  /NOT_FOUND/,
);
await expectError(
  "a helper marking read is NOT_FOUND",
  () => q(`SELECT public.mark_support_thread_read($1)`, [T]),
  /NOT_FOUND/,
);
await expectError(
  "a helper opening a thread for the household is NOT_FOUND",
  () => q(`SELECT public.open_support_thread($1, 's', 'b')`, [H1]),
  /NOT_FOUND/,
);
await expectError(
  "a helper setting the status is NOT_ADMIN",
  () => q(`SELECT public.set_support_thread_status($1, 'closed')`, [T]),
  /NOT_ADMIN/,
);

// --- Counters accumulate -------------------------------------------------------
await as(M1);
await q(`SELECT public.post_support_message($1, 'One more thing')`, [T]);
await q(`SELECT public.post_support_message($1, 'And another')`, [T]);
check(
  "three manager messages leave 3 unread for the admin",
  (await threadRow(T)).platform_admin_unread === 3,
);

// --- The admin answers --------------------------------------------------------
await as(AD);
check("the admin sees the thread", (await q(`SELECT 1 FROM support_threads`)).length === 1);
await q(`SELECT public.post_support_message($1, 'Looking into it')`, [T]);
const reply = await one(
  `SELECT from_platform_admin FROM support_messages WHERE thread_id = $1 AND author_id = $2`,
  [T, AD],
);
check("the reply is marked from the platform admin", reply?.from_platform_admin === true, reply);
const afterReply = await threadRow(T);
check(
  "household gets 1 unread; admin side stays at 3",
  afterReply.household_unread === 1 && afterReply.platform_admin_unread === 3,
  afterReply,
);

await q(`SELECT public.mark_support_thread_read($1)`, [T]);
check("admin reading zeroes the admin side", (await threadRow(T)).platform_admin_unread === 0);

await as(M1);
check(
  "M1 sees all four messages",
  (await q(`SELECT 1 FROM support_messages WHERE thread_id = $1`, [T])).length === 4,
);
await q(`SELECT public.mark_support_thread_read($1)`, [T]);
const afterRead = await threadRow(T);
check(
  "manager reading zeroes the household side",
  afterRead.household_unread === 0 && afterRead.platform_admin_unread === 0,
  afterRead,
);

// --- Closing and reopening ----------------------------------------------------
await expectError(
  "a manager cannot set the status (NOT_ADMIN)",
  () => q(`SELECT public.set_support_thread_status($1, 'closed')`, [T]),
  /NOT_ADMIN/,
);

await as(AD);
await q(`SELECT public.set_support_thread_status($1, 'closed')`, [T]);
check("the admin closes it", (await threadRow(T)).status === "closed");

await as(M1);
await q(`SELECT public.post_support_message($1, 'Still stuck')`, [T]);
const reopened = await threadRow(T);
check(
  "a manager posting reopens it",
  reopened.status === "open" && reopened.platform_admin_unread === 1,
  reopened,
);

// --- Nothing is written directly ----------------------------------------------
await expectError(
  "direct INSERT into support_messages is refused",
  () =>
    q(`INSERT INTO support_messages (thread_id, author_id, body) VALUES ($1, $2, 'sneaky')`, [
      T,
      M1,
    ]),
  /permission denied|row-level security/,
);
await expectError(
  "direct UPDATE of a thread is refused",
  () => q(`UPDATE support_threads SET status = 'closed' WHERE id = $1`, [T]),
  /permission denied/,
);
await expectError(
  "direct INSERT into support_threads is refused",
  () =>
    q(`INSERT INTO support_threads (household_id, opened_by, subject) VALUES ($1, $2, 's')`, [
      H1,
      M1,
    ]),
  /permission denied|row-level security/,
);

// --- Limits -------------------------------------------------------------------
await expectError(
  "a 4001-character body is rejected",
  () => q(`SELECT public.post_support_message($1, $2)`, [T, "x".repeat(4001)]),
  /support_messages_body_check|check constraint/,
);
await expectError(
  "an empty subject is rejected",
  () => q(`SELECT public.open_support_thread($1, '', 'b')`, [H1]),
  /support_threads_subject_check|check constraint/,
);
const total = await asOwner(() => one(`SELECT count(*)::int AS n FROM support_messages`));
check("rejected posts left no message behind", total.n === 5, total);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
