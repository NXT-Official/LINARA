// Runs add-seat-limits.sql against a real Postgres (PGlite) as the API's
// `authenticated` role: a household on the free tier can't add a helper or a
// manager past the free seats (by adding, reactivating or moving one), an
// inactive helper takes no seat, a subscription's seats replace the free
// tier's while it lasts, NULL seats mean no limit, and a new household always
// gets its primary manager.
// The billing schema is the console's (LINARA_ADMIN, which must sit beside
// LINARA): this loads its 016/017 and its seat entitlements, then enforces them
// with add-seat-limits.sql. Sell-Linara plan, Task 3.
//
//   npm run test:sql
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
// LINARA_ADMIN_DIR (CI) may name the console's repo root or its supabase dir;
// otherwise the console sits beside this repo.
const STUB = join("tests", "stub-supabase.sql");
const candidates = (dir) => [dir, join(dir, "supabase")];
const consoleDir = (dir) => candidates(dir).find((d) => existsSync(join(d, STUB)));
const FROM_ENV = process.env.LINARA_ADMIN_DIR;
const SIBLING = resolve(HERE, "../../../LINARA_ADMIN/supabase");
const CONSOLE = consoleDir(FROM_ENV ? resolve(FROM_ENV) : SIBLING);
if (!CONSOLE) {
  console.error(
    FROM_ENV
      ? `LINARA_ADMIN_DIR is not the console's repo root or supabase dir (no ${STUB} under ${FROM_ENV})`
      : `LINARA_ADMIN must sit beside LINARA, or LINARA_ADMIN_DIR must point at it (not found: ${SIBLING})`,
  );
  process.exit(1);
}
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
const succeeds = async (label, fn) => {
  try {
    await fn();
    check(label, true);
  } catch (e) {
    check(label, false, e.message);
  }
};
/** As the database owner (the SQL editor), for setup and checks. */
const asOwner = async (fn) => {
  await db.exec("RESET ROLE");
  try {
    return await fn();
  } finally {
    await db.exec("SET ROLE authenticated");
  }
};
const MIGRATION = (name) => readFileSync(`${REPO}/${name}`, "utf8");
const CONSOLE_SQL = (name) => readFileSync(`${CONSOLE}/${name}`, "utf8");

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
// What the live schema has that base-schema.sql doesn't, as in
// household-managers.test.mjs, plus Supabase's service_role.
await db.exec(`
  CREATE ROLE service_role BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
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
`);
await db.exec(MIGRATION("fix-helper-write-access.sql"));
await db.exec(MIGRATION("add-account-deletion.sql"));
await db.exec(MIGRATION("add-household-managers.sql"));
// The console's migrations expect its stubs' auth columns and main-app tables;
// the real main-app schema above already has this repo's versions of those, so
// only what it lacks is added here (tests/stub-main-app.sql would collide).
await db.exec(`
  ALTER TABLE auth.users ADD COLUMN email TEXT, ADD COLUMN last_sign_in_at TIMESTAMPTZ,
                         ADD COLUMN banned_until TIMESTAMPTZ,
                         ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  CREATE TABLE auth.sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE);
  CREATE TABLE auth.mfa_factors (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    factor_type TEXT NOT NULL, status TEXT NOT NULL);
  ALTER TABLE public.tickets ADD COLUMN actual_end TIMESTAMPTZ, ADD COLUMN occurrence_date DATE,
                             ADD COLUMN cancelled_at TIMESTAMPTZ, ADD COLUMN routine_id TEXT;
  ALTER TABLE public.helper_profiles ADD COLUMN IF NOT EXISTS employment TEXT,
                             ADD COLUMN IF NOT EXISTS phone TEXT, ADD COLUMN IF NOT EXISTS started_on DATE,
                             ADD COLUMN IF NOT EXISTS ended_on DATE;
  CREATE TABLE IF NOT EXISTS public.helper_households (helper_id UUID NOT NULL, household_id UUID NOT NULL,
    team_id UUID, added_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.helper_payout_accounts (user_id UUID PRIMARY KEY, method TEXT NOT NULL,
    account_name TEXT NOT NULL, account_number TEXT NOT NULL, qr_path TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.account_deletion_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, user_type TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(), processed_at TIMESTAMPTZ);
  ALTER TABLE public.payout_attempts ADD COLUMN IF NOT EXISTS psp_payout_id TEXT,
                             ADD COLUMN IF NOT EXISTS failure_reason TEXT,
                             ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                             ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
  CREATE TABLE IF NOT EXISTS public.ai_calls (id BIGSERIAL PRIMARY KEY, user_id UUID NOT NULL, fn TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.push_tokens (token TEXT PRIMARY KEY, user_id UUID NOT NULL, platform TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
`);
await db.exec(CONSOLE_SQL("tests/stub-cron.sql"));
for (const file of [
  "001-staff-foundation.sql",
  "002-visibility.sql",
  "003-visibility-fixes.sql",
  "004-crm.sql",
  "005-crm-fixes.sql",
  "006-crm-data.sql",
  "007-crm-export.sql",
  "008-account-actions.sql",
  "009-account-actions-fixes.sql",
  "010-support.sql",
  "011-support-fixes.sql",
  "012-operations.sql",
  "013-roles.sql",
  "014-roles-fixes.sql",
  "015-business-permissions.sql",
  "016-billing-plans.sql",
  "017-billing-subscriptions.sql",
]) {
  await db.exec(CONSOLE_SQL(file));
}
await db.exec(MIGRATION("add-seat-limits.sql"));
await db.exec(MIGRATION("add-seat-limits.sql"));
console.log("migration applied twice");

const P = "00000000-0000-0000-0000-00000000000a"; // primary of H1
const C = "00000000-0000-0000-0000-00000000000c"; // co-manager of H1
const M2 = "00000000-0000-0000-0000-0000000000b2"; // primary of H2
const D2 = "00000000-0000-0000-0000-0000000000d2"; // a would-be co-manager of H2
const N = "00000000-0000-0000-0000-0000000000ee"; // a new account, no profile yet
const E = "00000000-0000-0000-0000-0000000000e1"; // a manager H1 adds later
const H1 = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";

await db.exec(`
  INSERT INTO auth.users (id) VALUES ('${P}'), ('${C}'), ('${M2}'), ('${D2}'), ('${N}'), ('${E}');
  INSERT INTO households (id, name) VALUES ('${H1}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles (id, household_id, full_name, user_type) VALUES
    ('${P}', '${H1}', 'Ben Reyes', 'primary_manager'),
    ('${C}', '${H1}', 'Carla Reyes', 'co_manager'),
    ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager'),
    -- Manager accounts in no household yet, so the backfill in
    -- add-household-managers.sql has nothing of theirs to add.
    ('${D2}', NULL, 'Dino Cruz', 'co_manager'),
    ('${E}', NULL, 'Elma Reyes', 'remote_admin');
  INSERT INTO household_managers (household_id, user_id, role) VALUES
    ('${H1}', '${P}', 'primary_manager'), ('${H1}', '${C}', 'co_manager'),
    ('${H2}', '${M2}', 'primary_manager');
`);
await db.exec(`SET ROLE authenticated`);

const addHelper = (household, name, status = "ACTIVE") =>
  q(
    `INSERT INTO public.helper_profiles (household_id, name, station, monthly_rate, payday_interval, status)
     VALUES ($1, $2, 'Cook', 7000, 'monthly', $3)`,
    [household, name, status],
  );
const settings = (sql) => asOwner(() => q(`UPDATE public.billing_settings SET ${sql}`));
const used = (household, kind) =>
  asOwner(async () => (await one(`SELECT public.seats_used($1, $2) AS n`, [household, kind])).n);

// --- Helpers on the free tier -----------------------------------------------------
await settings(`free_helper_seats = 1`);
await as(P);
await succeeds("free tier, 1 helper seat: the 1st helper is added", () => addHelper(H1, "Rosa"));
await expectError(
  "free tier, 1 helper seat: the 2nd raises SEAT_LIMIT:helper",
  () => addHelper(H1, "Marites"),
  /^SEAT_LIMIT:helper/,
);
await expectError(
  "an invited (unclaimed) helper takes a seat too",
  () => addHelper(H1, "Marites", "PENDING_CLAIM"),
  /^SEAT_LIMIT:helper/,
);
await succeeds("adding an inactive helper takes no seat", () => addHelper(H1, "Lorna", "INACTIVE"));
await q(`UPDATE public.helper_profiles SET status = 'INACTIVE' WHERE name = 'Rosa'`);
check("an inactive helper doesn't count", (await used(H1, "helper")) === 0);
await succeeds("so with Rosa inactive, another helper is added", () => addHelper(H1, "Marites"));
check("seats_used counts the one active helper", (await used(H1, "helper")) === 1);
await expectError(
  "reactivating an INACTIVE helper at the limit raises SEAT_LIMIT:helper",
  () => q(`UPDATE public.helper_profiles SET status = 'ACTIVE' WHERE name = 'Rosa'`),
  /^SEAT_LIMIT:helper/,
);
await succeeds("an update that takes no new seat isn't refused at the limit", () =>
  q(`UPDATE public.helper_profiles SET status = 'ACTIVE', name = 'Marites' WHERE name = 'Marites'`),
);

// --- Managers on the free tier ------------------------------------------------------
await settings(`free_manager_seats = 1`);
await expectError(
  "free tier, 1 manager seat: the 2nd household_managers row raises SEAT_LIMIT:manager",
  () =>
    asOwner(() =>
      q(
        `INSERT INTO public.household_managers (household_id, user_id, role) VALUES ($1, $2, 'co_manager')`,
        [H2, D2],
      ),
    ),
  /^SEAT_LIMIT:manager/,
);
await as(M2);
const invite = await one(`SELECT code FROM public.create_manager_invite('co_manager')`);
await as(N);
await expectError(
  "claiming a co-manager invite past the limit raises SEAT_LIMIT:manager",
  () => q(`SELECT * FROM public.claim_manager_invite($1, 'Nina')`, [invite.code]),
  /^SEAT_LIMIT:manager/,
);
check(
  "and the refused claim left no profile behind",
  (await asOwner(() => q(`SELECT 1 FROM public.user_profiles WHERE id = $1`, [N]))).length === 0,
);
await expectError(
  "moving a manager row into a household at its limit raises SEAT_LIMIT:manager",
  () =>
    asOwner(() =>
      q(
        `UPDATE public.household_managers SET household_id = $1 WHERE household_id = $2 AND user_id = $3`,
        [H2, H1, C],
      ),
    ),
  /^SEAT_LIMIT:manager/,
);
// H1 already has 2 managers on a 1-seat free tier. Re-applying
// add-household-managers.sql proposes its existing rows again; they take no
// new seat.
await succeeds("re-applying add-household-managers.sql over a full household works", () =>
  asOwner(() => db.exec(MIGRATION("add-household-managers.sql"))),
);

// --- A subscription's seats -----------------------------------------------------------
// A subscription for H1 the way the app sells one: the primary starts it, and
// the Xendit webhook (service_role) marks its invoice paid in full.
await as(P);
const plan = (
  await asOwner(() =>
    one(
      `INSERT INTO public.billing_plans (name, interval, base_centavos, included_helpers, extra_helper_centavos, status, is_public)
       VALUES ('Household', 'monthly', 49900, 1, 9900, 'active', true) RETURNING id`,
    ),
  )
).id;
const started = (
  await one(`SELECT public.billing_start($1, 3, NULL, ARRAY[$2]::uuid[]) AS r`, [plan, H1])
).r;
await asOwner(async () => {
  await db.exec("SET ROLE service_role");
  await q(
    `SELECT public.billing_record_invoice_result($1, 'ps_seats', 'PAID', $2, now(), 'GCASH', '{}'::jsonb)`,
    [started.external_id, started.amount_centavos],
  );
  await db.exec("RESET ROLE");
});
const grant = { subscription_id: started.subscription_id };
await as(P);
await succeeds("with 3 subscribed helper seats, the 2nd helper is added", () =>
  addHelper(H1, "Nena"),
);
await succeeds("and the 3rd", () => addHelper(H1, "Tess"));
await expectError(
  "and the 4th raises SEAT_LIMIT:helper",
  () => addHelper(H1, "Iday"),
  /^SEAT_LIMIT:helper/,
);
await q(`UPDATE public.helper_profiles SET status = 'INACTIVE' WHERE name = 'Tess'`);
await succeeds("below the limit, reactivating an INACTIVE helper passes", () =>
  q(`UPDATE public.helper_profiles SET status = 'ACTIVE' WHERE name = 'Rosa'`),
);
// H1 is full again (3 of 3). Helpers come in from H2, which has room.
await asOwner(() => addHelper(H2, "Gina", "INACTIVE"));
await asOwner(() => addHelper(H2, "Ana"));
await expectError(
  "moving a helper into a full household raises SEAT_LIMIT:helper",
  () =>
    asOwner(() =>
      q(`UPDATE public.helper_profiles SET household_id = $1 WHERE name = 'Ana'`, [H1]),
    ),
  /^SEAT_LIMIT:helper/,
);
await succeeds("moving an INACTIVE helper into a full household passes", () =>
  asOwner(() => q(`UPDATE public.helper_profiles SET household_id = $1 WHERE name = 'Gina'`, [H1])),
);
await succeeds("the subscription's NULL manager seats mean no manager limit", () =>
  asOwner(() =>
    q(
      `INSERT INTO public.household_managers (household_id, user_id, role) VALUES ($1, $2, 'remote_admin')`,
      [H1, E],
    ),
  ),
);
check("seats_used counts every manager row", (await used(H1, "manager")) === 3);

// Ended over a week ago: back to the free tier's 1 helper seat.
await asOwner(() =>
  q(
    `UPDATE public.billing_subscriptions SET current_period_end = now() - interval '8 days' WHERE id = $1`,
    [grant.subscription_id],
  ),
);
await succeeds("an inactive helper can still be added after the subscription lapses", () =>
  addHelper(H1, "Iday", "INACTIVE"),
);
await expectError(
  "once the subscription lapses, the free tier's limit applies again",
  () => addHelper(H1, "Iday"),
  /^SEAT_LIMIT:helper/,
);

// --- No limit -------------------------------------------------------------------------
await settings(`free_helper_seats = NULL`);
await as(M2);
await succeeds("free_helper_seats NULL: no limit (1)", () => addHelper(H2, "Bea"));
await succeeds("free_helper_seats NULL: no limit (2)", () => addHelper(H2, "Cora"));
await succeeds("free_helper_seats NULL: no limit (3)", () => addHelper(H2, "Dina"));

// H2 has 4 helpers; with 5 free seats one more may move in, not two.
await settings(`free_helper_seats = 5`);
await succeeds("moving a helper into a household below its limit passes", () =>
  asOwner(() => q(`UPDATE public.helper_profiles SET household_id = $1 WHERE name = 'Nena'`, [H2])),
);
await expectError(
  "and the next move into it, now full, raises SEAT_LIMIT:helper",
  () =>
    asOwner(() =>
      q(`UPDATE public.helper_profiles SET household_id = $1 WHERE name = 'Marites'`, [H2]),
    ),
  /^SEAT_LIMIT:helper/,
);
await settings(`free_helper_seats = NULL`);

// --- Internal functions ------------------------------------------------------------------
const privileges = await asOwner(() =>
  Promise.all(
    [
      "public.seat_limit(uuid, text)",
      "public.seats_used(uuid, text)",
      "public.enforce_seat_limit()",
    ].map((fn) =>
      one(
        `SELECT $1 AS fn, has_function_privilege('anon', $1, 'EXECUTE') AS anon,
                has_function_privilege('authenticated', $1, 'EXECUTE') AS authenticated`,
        [fn],
      ),
    ),
  ),
);
check(
  "anon and authenticated execute none of the seat functions",
  privileges.every((p) => !p.anon && !p.authenticated),
  privileges,
);
await as(P);
await expectError(
  "a manager can't call seat_limit directly",
  () => q(`SELECT public.seat_limit($1, 'helper')`, [H1]),
  /permission denied/,
);

// PGlite is single-connection, so a race can't be run; check the lock is there.
check(
  "the trigger serialises per household and kind with an advisory lock",
  (
    await asOwner(() => one(`SELECT pg_get_functiondef('public.enforce_seat_limit'::regproc) AS d`))
  ).d.includes("pg_advisory_xact_lock(hashtext('seats:'"),
);

// --- A new household always gets its primary manager ----------------------------------
await settings(`free_tier_enabled = false`);
await as(P);
await succeeds("free tier off (0 seats): a primary still starts another household", () =>
  q(`SELECT * FROM public.create_household('Beach house')`),
);
const beach = (
  await asOwner(() => one(`SELECT id FROM public.households WHERE name = 'Beach house'`))
).id;
await expectError(
  "but can't add a helper to it",
  () => addHelper(beach, "Rosa"),
  /^SEAT_LIMIT:helper/,
);

console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
