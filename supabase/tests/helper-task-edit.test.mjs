// Runs add-helper-task-edit.sql against a real Postgres (PGlite) and acts as
// the API's `authenticated` role: a helper's login can move her own task and
// change its note, and still do what her app already does (start, finish,
// untick, "not now", the photo), but can't touch anything else on a task,
// anyone else's task, cancel one, or delete one; managers are unaffected.
// KNOWN_GAPS O31 and the tickets half of C72's residual.
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
const asOwner = async (fn) => {
  await db.exec("RESET ROLE");
  try {
    return await fn();
  } finally {
    await db.exec("SET ROLE authenticated");
  }
};

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
// What the live schema has that base-schema.sql doesn't, as in
// household-managers.test.mjs, plus the tickets columns this guards.
await db.exec(`
  ALTER TABLE user_profiles ALTER COLUMN household_id DROP NOT NULL;
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false,
                         ADD COLUMN petty_cash_budget NUMERIC(10,2) NOT NULL DEFAULT 1500;
  ALTER TABLE tickets ADD COLUMN suggested BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN emergency BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN is_after_hours BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN notes TEXT,
                      ADD COLUMN actual_end TIMESTAMPTZ,
                      ADD COLUMN photo_evidence_url TEXT,
                      ADD COLUMN reschedule_notice JSONB,
                      ADD COLUMN cancelled_at TIMESTAMPTZ,
                      ADD COLUMN cancelled_by UUID,
                      ADD COLUMN cancelled_by_name TEXT,
                      ALTER COLUMN helper_id DROP NOT NULL;
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
  RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT NULL::text $$;
  REVOKE ALL ON FUNCTION public.ticket_ledger_source(UUID, TIMESTAMPTZ, BOOLEAN, BOOLEAN) FROM PUBLIC;
  CREATE TABLE account_deletion_requests_placeholder ();

  -- add-cancelled-tasks.sql's stamp, the same body, so the guard is checked
  -- running after it.
  CREATE FUNCTION public.tickets_stamp_cancel() RETURNS TRIGGER LANGUAGE plpgsql
    SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      NEW.cancelled_at := now(); NEW.cancelled_by := auth.uid();
      NEW.cancelled_by_name := (SELECT full_name FROM user_profiles WHERE id = auth.uid());
    ELSIF NEW.status IS DISTINCT FROM 'cancelled' AND OLD.status = 'cancelled' THEN
      NEW.cancelled_at := NULL; NEW.cancelled_by := NULL; NEW.cancelled_by_name := NULL;
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER tickets_stamp_cancel BEFORE UPDATE OF status ON tickets
    FOR EACH ROW EXECUTE FUNCTION public.tickets_stamp_cancel();

  -- Stands in for end-of-employment's hand-over: SECURITY DEFINER, so the
  -- guard must let it through even when a helper's session calls it.
  CREATE FUNCTION public.definer_reassigns(p_ticket UUID, p_helper UUID) RETURNS VOID
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS
  $$ UPDATE public.tickets SET helper_id = p_helper WHERE id = p_ticket $$;
  GRANT EXECUTE ON FUNCTION public.definer_reassigns(UUID, UUID) TO authenticated;
`);
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-account-deletion.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-household-managers.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-helper-task-edit.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-helper-task-edit.sql`, "utf8"));
console.log("migration applied twice");

const M = "00000000-0000-0000-0000-00000000000a"; // primary manager, Reyes
const C = "00000000-0000-0000-0000-00000000000c"; // co-manager, Reyes
const U = "00000000-0000-0000-0000-00000000000b"; // helper Marites, Reyes
const R = "00000000-0000-0000-0000-00000000000d"; // helper Rosa, Reyes
const H = "10000000-0000-0000-0000-000000000001";
const HP = "20000000-0000-0000-0000-000000000001"; // Marites
const HP_ROSA = "20000000-0000-0000-0000-000000000002";
const T = "30000000-0000-0000-0000-000000000001"; // Marites' task
const T_ROSA = "30000000-0000-0000-0000-000000000002";
const T_NONE = "30000000-0000-0000-0000-000000000003"; // unassigned

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${C}'), ('${U}'), ('${R}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now() - interval '3 days');
  INSERT INTO user_profiles VALUES ('${C}', '${H}', 'Carla Reyes', 'co_manager', now() - interval '2 days');
  INSERT INTO user_profiles VALUES ('${U}', '${H}', 'Marites Santos', 'helper', now());
  INSERT INTO user_profiles VALUES ('${R}', '${H}', 'Rosa Cruz', 'helper', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE'),
           ('${HP_ROSA}', '${R}', '${H}', 'Rosa', 'Cook', 7000, 'semi_monthly', 'ACTIVE');
  INSERT INTO tickets (id, household_id, title, helper_id, scheduled_start) VALUES
    ('${T}', '${H}', 'Fold laundry', '${HP}', '2026-10-05 01:00Z'),
    ('${T_ROSA}', '${H}', 'Cook adobo', '${HP_ROSA}', '2026-10-05 03:00Z'),
    ('${T_NONE}', '${H}', 'Water plants', NULL, '2026-10-05 04:00Z');
`);
// add-household-managers.sql backfills memberships from existing profiles.
await db.exec(readFileSync(`${REPO}/add-household-managers.sql`, "utf8"));
await db.exec(`SET ROLE authenticated`);

// --- Her own task: time and note -------------------------------------------
await as(U);
check(
  "she moves her own task and changes its note",
  (await changes(
    `UPDATE tickets SET scheduled_start = '2026-10-05 02:30Z', notes = 'After lunch' WHERE id = $1`,
    [T],
  )) === 1,
);
const moved = await one(`SELECT scheduled_start, notes FROM tickets WHERE id = $1`, [T]);
check(
  "the new time and note are saved",
  new Date(moved.scheduled_start).toISOString() === "2026-10-05T02:30:00.000Z" &&
    moved.notes === "After lunch",
  moved,
);

// --- What her app already does still works ----------------------------------
check(
  "start",
  (await changes(`UPDATE tickets SET status = 'in_progress', actual_start = now() WHERE id = $1`, [
    T,
  ])) === 1,
);
check(
  "not now",
  (await changes(
    `UPDATE tickets SET status = 'blocked', block_reason = 'Walang sabon' WHERE id = $1`,
    [T],
  )) === 1,
);
check(
  "done, with a photo",
  (await changes(
    `UPDATE tickets SET status = 'done', actual_end = now(), block_reason = NULL, photo_evidence_url = 'x/tickets/1.jpg' WHERE id = $1`,
    [T],
  )) === 1,
);
await expectError(
  "a finished task's time can't be changed",
  () => q(`UPDATE tickets SET scheduled_start = '2026-10-05 05:00Z' WHERE id = $1`, [T]),
  /finished task/,
);
check(
  "unticking it",
  (await changes(`UPDATE tickets SET status = 'in_progress', actual_end = NULL WHERE id = $1`, [
    T,
  ])) === 1,
);

// --- Everything else on her task is refused ---------------------------------
for (const [label, set] of [
  ["its title", `title = 'Something else'`],
  ["who it's for", `helper_id = '${HP_ROSA}'`],
  ["the after-hours flag", `is_after_hours = true`],
  ["the emergency flag", `emergency = true`],
  ["the moved-task notice", `reschedule_notice = '{"oldStartIso":"x"}'`],
]) {
  await expectError(
    `she can't change ${label}`,
    () => q(`UPDATE tickets SET ${set} WHERE id = $1`, [T]),
    /time, note and progress/,
  );
}
await expectError(
  "she can't cancel a task",
  () => q(`UPDATE tickets SET status = 'cancelled' WHERE id = $1`, [T]),
  /Only a manager can cancel/,
);

// --- Not her task ------------------------------------------------------------
await expectError(
  "she can't move someone else's task",
  () => q(`UPDATE tickets SET scheduled_start = now() WHERE id = $1`, [T_ROSA]),
  /your own tasks/,
);
await expectError(
  "she can't touch an unassigned task",
  () => q(`UPDATE tickets SET notes = 'mine' WHERE id = $1`, [T_NONE]),
  /your own tasks/,
);
check("she can't delete her task", (await changes(`DELETE FROM tickets WHERE id = $1`, [T])) === 0);
check(
  "she can't delete anyone's",
  (await changes(`DELETE FROM tickets WHERE id = $1`, [T_ROSA])) === 0,
);

// --- Inserts: only for herself (Promote to Board) ----------------------------
check(
  "she adds a task for herself",
  (await changes(
    `INSERT INTO tickets (household_id, title, helper_id, created_by) VALUES ($1, 'From my notes', $2, $3)`,
    [H, HP, U],
  )) === 1,
);
await expectError(
  "she can't add one for someone else",
  () =>
    q(`INSERT INTO tickets (household_id, title, helper_id) VALUES ($1, 'For Rosa', $2)`, [
      H,
      HP_ROSA,
    ]),
  /row-level security/,
);
await expectError(
  "or an unassigned one",
  () => q(`INSERT INTO tickets (household_id, title, helper_id) VALUES ($1, 'Nobody', NULL)`, [H]),
  /row-level security/,
);

// --- Rosa, on her own task, is held the same way ------------------------------
await as(R);
check(
  "another helper moves her own",
  (await changes(`UPDATE tickets SET scheduled_start = '2026-10-05 04:00Z' WHERE id = $1`, [
    T_ROSA,
  ])) === 1,
);
await expectError(
  "and not Marites'",
  () => q(`UPDATE tickets SET notes = 'x' WHERE id = $1`, [T]),
  /your own tasks/,
);

// --- A SECURITY DEFINER function called from her session is let through ------
await as(U);
await q(`SELECT definer_reassigns($1, $2)`, [T, HP_ROSA]);
check(
  "a definer function can still hand her task on",
  (await asOwner(() => one(`SELECT helper_id FROM tickets WHERE id = $1`, [T]))).helper_id ===
    HP_ROSA,
);

// --- Managers: unchanged ------------------------------------------------------
for (const [who, uid] of [
  ["primary", M],
  ["co-manager", C],
]) {
  await as(uid);
  check(
    `the ${who} renames and reassigns any task`,
    (await changes(
      `UPDATE tickets SET title = $2, helper_id = $3, is_after_hours = true WHERE id = $1`,
      [T_ROSA, `Cook adobo (${who})`, HP],
    )) === 1,
  );
}
await as(M);
check(
  "a manager cancels",
  (await changes(`UPDATE tickets SET status = 'cancelled' WHERE id = $1`, [T_NONE])) === 1,
);
const cancelled = await one(`SELECT cancelled_by_name FROM tickets WHERE id = $1`, [T_NONE]);
check("and the stamp still runs", cancelled.cancelled_by_name === "Ben Reyes", cancelled);
check(
  "a manager restores",
  (await changes(`UPDATE tickets SET status = 'todo' WHERE id = $1`, [T_NONE])) === 1,
);
check(
  "a manager adds an unassigned task",
  (await changes(`INSERT INTO tickets (household_id, title) VALUES ($1, 'Anyone')`, [H])) === 1,
);
check("a manager deletes", (await changes(`DELETE FROM tickets WHERE id = $1`, [T_NONE])) === 1);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
