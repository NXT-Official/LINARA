// Runs add-household-managers.sql against a real Postgres (PGlite) and acts as
// the API's `authenticated` role: managers invite managers, a manager has more
// than one household and switches between them, the primary hands over,
// removes and is never left out, a remote admin's limits hold in the database,
// and deleting an account keeps a household that still has a manager.
// KNOWN_GAPS O2.
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
/** An UPDATE or DELETE that RLS hides changes nothing and raises nothing: count the rows. */
const changes = async (sql, params) => (await q(`${sql} RETURNING 1`, params)).length;
/** As the database owner (the SQL editor), for setup and checks. */
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

  -- add-ticket-ledger.sql's shift rule, stood in for: a helper whose name
  -- says "on shift" is on shift right now, anyone else is off.
  CREATE FUNCTION public.ticket_ledger_source(p_helper_id UUID, p_at TIMESTAMPTZ, p_after_hours BOOLEAN, p_emergency BOOLEAN)
  RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT CASE WHEN name LIKE '%on shift%' THEN NULL ELSE 'overtime' END FROM public.helper_profiles WHERE id = p_helper_id $$;
  REVOKE ALL ON FUNCTION public.ticket_ledger_source(UUID, TIMESTAMPTZ, BOOLEAN, BOOLEAN) FROM PUBLIC;

  CREATE TABLE account_deletion_requests_placeholder ();
`);
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-account-deletion.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-household-managers.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-household-managers.sql`, "utf8"));
console.log("migration applied twice");

const P = "00000000-0000-0000-0000-00000000000a"; // primary, Reyes household
const A = "00000000-0000-0000-0000-00000000000c"; // primary, Cruz household
const U = "00000000-0000-0000-0000-00000000000b"; // helper, Reyes
const N = "00000000-0000-0000-0000-00000000000d"; // new account, no profile yet
const X = "00000000-0000-0000-0000-00000000000e"; // primary, Lim household (deletion)
const Y = "00000000-0000-0000-0000-00000000000f"; // co-manager, Lim household
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const H3 = "10000000-0000-0000-0000-000000000003";
const HP_ON = "20000000-0000-0000-0000-000000000001";
const HP_OFF = "20000000-0000-0000-0000-000000000002";

await db.exec(`
  INSERT INTO auth.users VALUES ('${P}'), ('${A}'), ('${U}'), ('${N}'), ('${X}'), ('${Y}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household'), ('${H3}', 'Lim Household');
  INSERT INTO user_profiles VALUES ('${P}', '${H}', 'Ben Reyes', 'primary_manager', now() - interval '3 days');
  INSERT INTO user_profiles VALUES ('${A}', '${H2}', 'Ana Cruz', 'primary_manager', now() - interval '2 days');
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO user_profiles VALUES ('${X}', '${H3}', 'Xavier Lim', 'primary_manager', now() - interval '2 days');
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status)
    VALUES ('${HP_ON}', '${U}', '${H}', 'Marites (on shift)', 'Yaya', 8000, 'semi_monthly', 'ACTIVE'),
           ('${HP_OFF}', NULL, '${H}', 'Rosa', 'Cook', 7000, 'semi_monthly', 'ACTIVE');
  INSERT INTO tickets (household_id, title, helper_id) VALUES ('${H}', 'Fold laundry', '${HP_ON}');
  INSERT INTO quick_utos (recipient_id, content) VALUES ('${HP_ON}', 'Paki-bili ng tinapay');
  INSERT INTO vales (helper_id, amount, status) VALUES ('${HP_ON}', 500, 'pending');
  INSERT INTO payslips (helper_id, cutoff_start, cutoff_end, base_pay, statutory_employee_share, net_pay, payout_channel_code)
    VALUES ('${HP_ON}', '2026-09-01', '2026-09-15', 4000, 200, 3800, 'PH_GCASH');
`);
// The backfill ran before these rows existed; run the migration again, as
// applying it to a live database with managers in it would.
await db.exec(readFileSync(`${REPO}/add-household-managers.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/restrict-create-household.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/restrict-create-household.sql`, "utf8"));
await db.exec(`SET ROLE authenticated`);

// --- Everyone who managed a household before is a member of it --------------
check(
  "existing managers became their household's primary",
  (
    await asOwner(() =>
      q(`SELECT user_id FROM household_managers WHERE role = 'primary_manager' ORDER BY user_id`),
    )
  ).length === 3,
);
check(
  "the helper isn't a manager member",
  (await asOwner(() => q(`SELECT 1 FROM household_managers WHERE user_id = $1`, [U]))).length === 0,
);
await as(P);
check(
  "a manager sees their own household",
  JSON.stringify(await q(`SELECT name, role, is_current FROM my_households()`)) ===
    JSON.stringify([{ name: "Reyes Household", role: "primary_manager", is_current: true }]),
);

// --- Inviting a co-manager (a brand-new account) ------------------------------
const coInvite = await one(`SELECT code, role FROM create_manager_invite('co_manager')`);
check("the primary makes a co-manager code", /^[A-HJ-NP-Z2-9]{8}$/.test(coInvite.code), coInvite);
check(
  "and sees it",
  (await q(`SELECT code FROM manager_invites WHERE claimed_at IS NULL`)).length === 1,
);
await expectError(
  "a primary can't invite a second primary",
  () => q(`SELECT * FROM create_manager_invite('primary_manager')`),
  /co-manager or a remote admin/,
);

await as(N);
check(
  "the code says where it leads",
  JSON.stringify(
    await q(`SELECT household_name, role, invited_by FROM lookup_manager_invite($1)`, [
      coInvite.code.toLowerCase(),
    ]),
  ) ===
    JSON.stringify([
      { household_name: "Reyes Household", role: "co_manager", invited_by: "Ben Reyes" },
    ]),
);
await expectError(
  "a new account has to give a name",
  () => q(`SELECT * FROM claim_manager_invite($1, '  ')`, [coInvite.code]),
  /your name/,
);
check(
  "a new account claims it and lands in the household as co-manager",
  JSON.stringify(
    await q(`SELECT household_id, user_type FROM claim_manager_invite($1, 'Nora Reyes')`, [
      coInvite.code,
    ]),
  ) === JSON.stringify([{ household_id: H, user_type: "co_manager" }]),
);
check(
  "a co-manager sees the household's helpers",
  (await q(`SELECT id FROM helper_profiles`)).length === 2,
);
await expectError(
  "a used code can't be used again",
  async () => {
    await as(A);
    await q(`SELECT * FROM claim_manager_invite($1)`, [coInvite.code]);
  },
  /isn't valid any more/,
);
await as(N);
await expectError(
  "a co-manager can't invite managers",
  () => q(`SELECT * FROM create_manager_invite('co_manager')`),
  /Only the primary manager/,
);
check(
  "or see the household's manager codes",
  (await q(`SELECT code FROM manager_invites`)).length === 0,
);
// KNOWN_GAPS O49: as its primary, they could share this family's staff into it.
await expectError(
  "or start a household of their own",
  () => q(`SELECT * FROM create_household('Nora''s House')`),
  /Only a primary manager/,
);

// --- An existing manager joins a second household as remote admin -------------
await as(P);
const remoteInvite = await one(`SELECT id, code FROM create_manager_invite('remote_admin')`);
const revoked = await one(`SELECT id, code FROM create_manager_invite('co_manager')`);
await q(`SELECT revoke_manager_invite($1)`, [revoked.id]);
const expired = await one(`SELECT id, code FROM create_manager_invite('co_manager')`);
await asOwner(() =>
  q(`UPDATE manager_invites SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
    expired.id,
  ]),
);

await as(U);
await expectError(
  "a helper account can't claim a manager code",
  () => q(`SELECT * FROM claim_manager_invite($1, 'Marites')`, [remoteInvite.code]),
  /helper account/,
);
await as(A);
await expectError(
  "a revoked code doesn't work",
  () => q(`SELECT * FROM claim_manager_invite($1)`, [revoked.code]),
  /isn't valid any more/,
);
await expectError(
  "an expired code doesn't work",
  () => q(`SELECT * FROM claim_manager_invite($1)`, [expired.code]),
  /isn't valid any more/,
);
check(
  "and neither shows on the join screen",
  (await q(`SELECT * FROM lookup_manager_invite($1)`, [expired.code])).length === 0,
);
check(
  "Ana joins the Reyes household as remote admin and is switched into it",
  (await one(`SELECT household_id, user_type FROM claim_manager_invite($1)`, [remoteInvite.code]))
    .user_type === "remote_admin",
);
check(
  "her own household keeps her as its primary",
  JSON.stringify(await q(`SELECT name, role, is_current FROM my_households()`)) ===
    JSON.stringify([
      { name: "Cruz Household", role: "primary_manager", is_current: false },
      { name: "Reyes Household", role: "remote_admin", is_current: true },
    ]),
);
await expectError(
  "she can't join it twice",
  async () => {
    await as(P);
    const again = await one(`SELECT code FROM create_manager_invite('co_manager')`);
    await as(A);
    await q(`SELECT * FROM claim_manager_invite($1)`, [again.code]);
  },
  /already manage this household/,
);

await as(P);
check(
  "the roster lists every manager, primary first",
  JSON.stringify(await q(`SELECT full_name, role, is_you FROM household_manager_roster()`)) ===
    JSON.stringify([
      { full_name: "Ben Reyes", role: "primary_manager", is_you: true },
      { full_name: "Nora Reyes", role: "co_manager", is_you: false },
      { full_name: "Ana Cruz", role: "remote_admin", is_you: false },
    ]),
);
await as(U);
check(
  "a helper gets no roster",
  (await q(`SELECT * FROM household_manager_roster()`)).length === 0,
);

// --- Switching ----------------------------------------------------------------
await as(A);
check(
  "switching back takes her role there with her",
  (await one(`SELECT household_id, user_type FROM switch_household($1)`, [H2])).user_type ===
    "primary_manager",
);
check(
  "and she sees that household's data, not the other's",
  (await q(`SELECT id FROM helper_profiles`)).length === 0,
);
await expectError(
  "she can't switch into a household she doesn't manage",
  () => q(`SELECT * FROM switch_household($1)`, [H3]),
  /don't manage that household/,
);
await as(P);
check(
  "while she's away, her name still shows in the household she left",
  (await q(`SELECT full_name FROM user_profiles WHERE id = $1`, [A])).length === 1,
);
await as(U);
check(
  "to its helper too",
  (await q(`SELECT full_name FROM user_profiles WHERE id = $1`, [A])).length === 1,
);
await as(X);
check(
  "but not to another household",
  (await q(`SELECT full_name FROM user_profiles WHERE id = $1`, [A])).length === 0,
);

// --- What a remote admin may write ----------------------------------------------
await as(A);
await q(`SELECT * FROM switch_household($1)`, [H]);
await expectError(
  "a remote admin can't add a live task",
  () =>
    q(`INSERT INTO tickets (household_id, title, helper_id) VALUES ($1, 'Water plants', $2)`, [
      H,
      HP_ON,
    ]),
  /row-level security/,
);
check(
  "she can suggest one",
  (
    await q(
      `INSERT INTO tickets (household_id, title, helper_id, suggested) VALUES ($1, 'Water plants', $2, true) RETURNING id`,
      [H, HP_ON],
    )
  ).length === 1,
);
check(
  "or send one live and urgent while the helper is on shift",
  (
    await q(
      `INSERT INTO tickets (household_id, title, helper_id, emergency) VALUES ($1, 'Gas smell, open windows', $2, true) RETURNING id`,
      [H, HP_ON],
    )
  ).length === 1,
);
await expectError(
  "but never urgent to a helper who's off",
  () =>
    q(
      `INSERT INTO tickets (household_id, title, helper_id, emergency) VALUES ($1, 'Late call', $2, true)`,
      [H, HP_OFF],
    ),
  /row-level security/,
);
check(
  "she can't change a task",
  (await changes(`UPDATE tickets SET title = 'Changed' WHERE household_id = $1`, [H])) === 0,
);
check("or delete one", (await changes(`DELETE FROM tickets WHERE household_id = $1`, [H])) === 0);
await expectError(
  "a plain Quick Utos is refused",
  () => q(`INSERT INTO quick_utos (recipient_id, content) VALUES ($1, 'Kape po')`, [HP_ON]),
  /row-level security/,
);
check(
  "an urgent one while she's on shift goes",
  (
    await q(
      `INSERT INTO quick_utos (recipient_id, content, emergency) VALUES ($1, 'Tawagan si Ma''am', true) RETURNING id`,
      [HP_ON],
    )
  ).length === 1,
);
await expectError(
  "not to a helper who's off",
  () =>
    q(`INSERT INTO quick_utos (recipient_id, content, emergency) VALUES ($1, 'Gising', true)`, [
      HP_OFF,
    ]),
  /row-level security/,
);
check(
  "she can't mark a Quick Utos done",
  (await changes(`UPDATE quick_utos SET ack_state = 'done' WHERE recipient_id = $1`, [HP_ON])) ===
    0,
);
await expectError(
  "she can't add an appointment",
  () => q(`INSERT INTO appointments (household_id, title) VALUES ($1, 'Flight')`, [H]),
  /row-level security/,
);
check(
  "she can approve a vale",
  (await changes(
    `UPDATE vales SET status = 'approved', approved_by = $1 WHERE status = 'pending'`,
    [A],
  )) === 1,
);
check(
  "and set the grocery budget",
  (await changes(`UPDATE households SET petty_cash_budget = 2000 WHERE id = $1`, [H])) === 1,
);
await expectError(
  "but nothing else on the household",
  () => q(`UPDATE households SET name = 'Renamed' WHERE id = $1`, [H]),
  /grocery budget, not the household/,
);
const payslip = await one(`SELECT id FROM payslips LIMIT 1`);
await expectError(
  "she can't write a payout attempt",
  () =>
    q(
      `INSERT INTO payout_attempts (payslip_id, attempt_number, reference_id, status, amount_sent, channel_code) VALUES ($1, 1, 'r-remote', 'sent', 1, 'PH_GCASH')`,
      [payslip.id],
    ),
  /row-level security/,
);

await as(U);
await expectError(
  "neither can the helper (the old policy let her)",
  () =>
    q(
      `INSERT INTO payout_attempts (payslip_id, attempt_number, reference_id, status, amount_sent, channel_code) VALUES ($1, 1, 'r-helper', 'sent', 1, 'PH_GCASH')`,
      [payslip.id],
    ),
  /row-level security/,
);
check(
  "the helper still adds a task, and updates hers",
  (
    await q(
      `INSERT INTO tickets (household_id, title, helper_id) VALUES ($1, 'Ubos na: bigas', $2) RETURNING id`,
      [H, HP_ON],
    )
  ).length === 1 &&
    (await changes(`UPDATE tickets SET status = 'done' WHERE title = 'Fold laundry'`)) === 1,
);

await as(N);
check(
  "a co-manager adds a live task and changes one",
  (
    await q(
      `INSERT INTO tickets (household_id, title, helper_id) VALUES ($1, 'Iron shirts', $2) RETURNING id`,
      [H, HP_OFF],
    )
  ).length === 1 &&
    (await changes(
      `UPDATE tickets SET title = 'Iron shirts (blue)' WHERE title = 'Iron shirts'`,
    )) === 1,
);
check(
  "and adds an appointment",
  (
    await q(`INSERT INTO appointments (household_id, title) VALUES ($1, 'Dentist') RETURNING id`, [
      H,
    ])
  ).length === 1,
);
await expectError(
  "a co-manager can't change a manager's role",
  () => q(`SELECT set_manager_role($1, 'co_manager')`, [A]),
  /Only the primary manager/,
);
await as(P);
check(
  "the primary still writes a payout attempt directly",
  (
    await q(
      `INSERT INTO payout_attempts (payslip_id, attempt_number, reference_id, status, amount_sent, channel_code) VALUES ($1, 1, 'r-primary', 'sent', 1, 'PH_GCASH') RETURNING id`,
      [payslip.id],
    )
  ).length === 1,
);

// --- Roles, handing over, removing, leaving -------------------------------------
await q(`SELECT set_manager_role($1, 'co_manager')`, [A]);
check(
  "the primary makes the remote admin a co-manager, and her session follows",
  (await asOwner(() => one(`SELECT user_type FROM user_profiles WHERE id = $1`, [A]))).user_type ===
    "co_manager",
);
await expectError(
  "the primary can't demote themselves",
  () => q(`SELECT set_manager_role($1, 'co_manager')`, [P]),
  /make someone else primary/,
);
await q(`SELECT set_manager_role($1, 'primary_manager')`, [N]);
const roles = await asOwner(() =>
  q(`SELECT user_id, role FROM household_managers WHERE household_id = $1 ORDER BY role`, [H]),
);
check(
  "handing over makes them primary and you a co-manager, one primary still",
  roles
    .filter((r) => r.role === "primary_manager")
    .map((r) => r.user_id)
    .join() === N && roles.find((r) => r.user_id === P)?.role === "co_manager",
  roles,
);
await expectError(
  "the old primary can't manage managers any more",
  () => q(`SELECT remove_manager($1)`, [A]),
  /Only the primary manager/,
);

await as(N);
await expectError(
  "the primary can't leave",
  () => q(`SELECT * FROM leave_household()`),
  /Make someone else primary/,
);
await expectError(
  "or remove themselves",
  () => q(`SELECT remove_manager($1)`, [N]),
  /can't remove yourself/,
);
await q(`SELECT remove_manager($1)`, [A]);
check(
  "removing Ana sends her back to her own household",
  JSON.stringify(
    await asOwner(() =>
      one(`SELECT household_id, user_type FROM user_profiles WHERE id = $1`, [A]),
    ),
  ) === JSON.stringify({ household_id: H2, user_type: "primary_manager" }),
);
await as(A);
check(
  "and she no longer sees the Reyes household",
  (await q(`SELECT name FROM my_households()`)).length === 1,
);

await as(P);
check(
  "a co-manager leaves; with no other household, they're in none",
  JSON.stringify(await q(`SELECT household_id, user_type FROM leave_household()`)) ===
    JSON.stringify([{ household_id: null, user_type: "co_manager" }]),
);
check(
  "they still read their own profile",
  (await q(`SELECT id FROM user_profiles WHERE id = $1`, [P])).length === 1,
);
check("and nothing of the household", (await q(`SELECT id FROM helper_profiles`)).length === 0);
check(
  "setting up again gives them a new household as its primary",
  (
    await one(
      `SELECT household_id, user_type FROM bootstrap_manager_household('Ben Reyes', 'Ben''s Condo')`,
    )
  ).user_type === "primary_manager",
);
check(
  "bootstrap is still idempotent",
  (await q(`SELECT * FROM bootstrap_manager_household('Ben Reyes', 'Another')`)).length === 1 &&
    (await q(`SELECT name FROM my_households()`)).length === 1,
);
check(
  "a manager starts another household",
  (await one(`SELECT household_id, user_type FROM create_household('Lola''s House')`)).user_type ===
    "primary_manager" && (await q(`SELECT name FROM my_households()`)).length === 2,
);
await as(U);
await expectError(
  "a helper can't start one",
  () => q(`SELECT * FROM create_household('Mine')`),
  /helper account/,
);

// --- Deleting an account ----------------------------------------------------------
await asOwner(async () => {
  await q(`INSERT INTO user_profiles VALUES ($1, $2, 'Yna Lim', 'co_manager', now())`, [Y, H3]);
  await q(
    `INSERT INTO household_managers (household_id, user_id, role) VALUES ($1, $2, 'co_manager')`,
    [H3, Y],
  );
  await q(`INSERT INTO appointments (household_id, title) VALUES ($1, 'School play')`, [H3]);
  // Yna is in her other household right now: the old rule would have missed her.
  await q(`UPDATE user_profiles SET household_id = NULL WHERE id = $1`, [Y]);
});
const first = await asOwner(() => one(`SELECT process_account_deletion($1) AS r`, [X]));
check(
  "deleting the primary keeps a household that has another manager",
  first.r.household_data_deleted === false &&
    (await asOwner(() => q(`SELECT id FROM appointments WHERE household_id = $1`, [H3]))).length ===
      1,
  first.r,
);
check(
  "and its longest-standing co-manager becomes primary",
  (
    await asOwner(() =>
      one(`SELECT role FROM household_managers WHERE household_id = $1 AND user_id = $2`, [H3, Y]),
    )
  ).role === "primary_manager",
);
const second = await asOwner(() => one(`SELECT process_account_deletion($1) AS r`, [Y]));
check(
  "deleting the last manager clears it, as before",
  second.r.household_data_deleted === true &&
    second.r.household_deleted === true &&
    (await asOwner(() => q(`SELECT id FROM households WHERE id = $1`, [H3]))).length === 0,
  second.r,
);
await expectError(
  "the last manager of a household that still employs someone can't be deleted",
  () => asOwner(() => q(`SELECT process_account_deletion($1)`, [N])),
  /still employs someone/,
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
