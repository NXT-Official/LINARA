// Runs add-grocery-runs.sql against a real Postgres (PGlite), on top of the
// pantry, palengke, receipt, manager, team and shared-staff migrations it
// sits beside.
//
// The Main House (Ben runs it, and the Beach House too) has Rosa, a pantry
// lead; May, a runner on the Kitchen team; Lito, a runner and driver; and
// Tess, a runner on no team. Nena is employed by the Beach House.
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
// The live columns and policies these migrations sit beside (as in
// shared-staff-and-places.test.mjs), and the two pantry tables as
// ARCHITECTURE.md §8 has them.
await db.exec(`
  ALTER TABLE user_profiles ALTER COLUMN household_id DROP NOT NULL;
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE helper_profiles ADD COLUMN employment TEXT, ADD COLUMN break_start TIME,
                              ADD COLUMN break_end TIME;
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
  ALTER TABLE quick_utos ENABLE ROW LEVEL SECURITY;
  CREATE POLICY quick_utos_isolation ON quick_utos FOR ALL USING (
    EXISTS (SELECT 1 FROM helper_profiles hp WHERE hp.id = quick_utos.recipient_id AND hp.household_id = public.current_household_id()));
  CREATE POLICY user_profiles_self_read ON user_profiles FOR SELECT USING (id = auth.uid());
  CREATE POLICY tickets_own_read ON tickets FOR SELECT USING (
    EXISTS (SELECT 1 FROM helper_profiles hp WHERE hp.id = tickets.helper_id AND hp.user_id = auth.uid()));
  CREATE FUNCTION public.ticket_ledger_source(p_helper_id UUID, p_at TIMESTAMPTZ, p_after_hours BOOLEAN, p_emergency BOOLEAN)
  RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT NULL::text $$;
  CREATE TABLE public.pantry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    name TEXT NOT NULL,
    qty NUMERIC(6,2) NOT NULL,
    unit TEXT NOT NULL,
    par NUMERIC(6,2) NOT NULL,
    category TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE public.grocery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    name TEXT NOT NULL,
    qty NUMERIC(6,2) NOT NULL,
    unit TEXT NOT NULL,
    pantry_item_id UUID REFERENCES public.pantry_items(id) ON DELETE SET NULL,
    bought BOOLEAN NOT NULL DEFAULT FALSE,
    actual_cost NUMERIC(10,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pantry_items_isolation ON public.pantry_items
    FOR ALL USING (household_id = public.current_household_id());
  CREATE POLICY grocery_items_isolation ON public.grocery_items
    FOR ALL USING (household_id = public.current_household_id());
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.pantry_items, public.grocery_items TO authenticated;
`);
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-account-deletion.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-grocery-restock.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-pantry-roles.sql`, "utf8"));
await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated`);
await db.exec(readFileSync(`${REPO}/add-grocery-receipts.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-household-managers.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-helper-task-edit.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-teams-and-labels.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-shared-staff-and-places.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-grocery-runs.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-grocery-runs.sql`, "utf8"));
// Applied after runs on the live project; its link must not upset the guards.
await db.exec(readFileSync(`${REPO}/add-grocery-pantry-link.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-run-change-limit.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-run-change-limit.sql`, "utf8"));
console.log("migrations applied (grocery runs and the change limit twice)");

const H1 = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const H3 = "10000000-0000-0000-0000-000000000003";
const BEN = "00000000-0000-0000-0000-00000000000a"; // primary of H1 and H2
const JOY = "00000000-0000-0000-0000-00000000000b"; // primary of H3
const ROSA = "00000000-0000-0000-0000-00000000000c"; // H1, pantry lead
const MAY = "00000000-0000-0000-0000-00000000000d"; // H1, runner, Kitchen
const LITO = "00000000-0000-0000-0000-00000000000e"; // H1, runner, driver
const TESS = "00000000-0000-0000-0000-00000000000f"; // H1, runner, no team
const NENA = "00000000-0000-0000-0000-000000000010"; // H2, runner
const HP_ROSA = "20000000-0000-0000-0000-000000000001";
const HP_MAY = "20000000-0000-0000-0000-000000000002";
const HP_LITO = "20000000-0000-0000-0000-000000000003";
const HP_TESS = "20000000-0000-0000-0000-000000000004";
const HP_NENA = "20000000-0000-0000-0000-000000000005";
const T_KITCHEN = "30000000-0000-0000-0000-000000000001"; // H1
const T_GARDEN = "30000000-0000-0000-0000-000000000002"; // H1
const T_H3 = "30000000-0000-0000-0000-000000000003"; // H3
const P_RICE = "50000000-0000-0000-0000-000000000001";
const P_EGGS = "50000000-0000-0000-0000-000000000002";

// The helpers here before add-pantry-roles.sql became leads; these are added
// after, so they start as runners and Rosa is raised.
await db.exec(`
  INSERT INTO auth.users VALUES ('${BEN}'), ('${JOY}'), ('${ROSA}'), ('${MAY}'), ('${LITO}'),
                                ('${TESS}'), ('${NENA}');
  INSERT INTO households (id, name) VALUES ('${H1}', 'Main House'), ('${H2}', 'Beach House'),
                                           ('${H3}', 'Cruz Household');
  INSERT INTO user_profiles VALUES ('${BEN}', '${H1}', 'Ben', 'primary_manager', now()),
                                   ('${JOY}', '${H3}', 'Joy', 'primary_manager', now()),
                                   ('${ROSA}', '${H1}', 'Rosa', 'helper', now()),
                                   ('${MAY}', '${H1}', 'May', 'helper', now()),
                                   ('${LITO}', '${H1}', 'Lito', 'helper', now()),
                                   ('${TESS}', '${H1}', 'Tess', 'helper', now()),
                                   ('${NENA}', '${H2}', 'Nena', 'helper', now());
  INSERT INTO household_managers (household_id, user_id, role) VALUES
    ('${H1}', '${BEN}', 'primary_manager'), ('${H2}', '${BEN}', 'primary_manager'),
    ('${H3}', '${JOY}', 'primary_manager')
    ON CONFLICT DO NOTHING;
  INSERT INTO household_teams (id, household_id, name) VALUES
    ('${T_KITCHEN}', '${H1}', 'Kitchen'), ('${T_GARDEN}', '${H1}', 'Garden'), ('${T_H3}', '${H3}', 'House');
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status, team_id)
    VALUES ('${HP_ROSA}', '${ROSA}', '${H1}', 'Rosa', 'Cook', 9000, 'semi_monthly', 'ACTIVE', NULL),
           ('${HP_MAY}', '${MAY}', '${H1}', 'May', 'Cook', 8000, 'semi_monthly', 'ACTIVE', '${T_KITCHEN}'),
           ('${HP_LITO}', '${LITO}', '${H1}', 'Lito', 'Driver', 8000, 'semi_monthly', 'ACTIVE', NULL),
           ('${HP_TESS}', '${TESS}', '${H1}', 'Tess', 'Yaya', 8000, 'semi_monthly', 'ACTIVE', NULL),
           ('${HP_NENA}', '${NENA}', '${H2}', 'Nena', 'Cook', 8000, 'semi_monthly', 'ACTIVE', NULL);
  UPDATE helper_profiles SET pantry_role = 'lead' WHERE id = '${HP_ROSA}';
  INSERT INTO pantry_items (id, household_id, name, qty, unit, par, category)
    VALUES ('${P_RICE}', '${H1}', 'Bigas', 1, 'kg', 5, 'Rice & grains'),
           ('${P_EGGS}', '${H1}', 'Itlog', 0, 'pcs', 12, 'Fresh');
`);
await db.exec(`SET ROLE authenticated`);

// --- The pool ------------------------------------------------------------------
await as(MAY);
const [{ id: G_EGGS }] = await q(
  `INSERT INTO grocery_items (household_id, name, qty, unit, pantry_item_id)
   VALUES ($1, 'Itlog', 12, 'pcs', $2) RETURNING id`,
  [H1, P_EGGS],
);
check("a runner still says something ran out: it goes in the pool", Boolean(G_EGGS));
await as(BEN);
const [{ id: G_RICE }] = await q(
  `INSERT INTO grocery_items (household_id, name, qty, unit, pantry_item_id)
   VALUES ($1, 'Bigas', 4, 'kg', $2) RETURNING id`,
  [H1, P_RICE],
);
const [{ id: G_SOAP }] = await q(
  `INSERT INTO grocery_items (household_id, name, qty, unit) VALUES ($1, 'Sabon', 2, 'pcs') RETURNING id`,
  [H1],
);

// --- A lead drafts a run ----------------------------------------------------------
await as(ROSA);
await expectError(
  "a lead can't make a run that's already approved",
  () =>
    q(`INSERT INTO grocery_runs (household_id, title, status) VALUES ($1, 'Palengke', 'ready')`, [
      H1,
    ]),
  /Draft muna/,
);
await expectError(
  "or give it cash",
  () =>
    q(`INSERT INTO grocery_runs (household_id, title, cash_given) VALUES ($1, 'Palengke', 500)`, [
      H1,
    ]),
  /Draft muna/,
);
const [draft] = await q(
  `INSERT INTO grocery_runs (household_id, title, team_id) VALUES ($1, 'Sabado palengke', $2)
   RETURNING id, status, created_by`,
  [H1, T_KITCHEN],
);
check(
  "a lead drafts a run for the Kitchen team",
  draft.status === "draft" && draft.created_by === ROSA,
  draft,
);
const RUN = draft.id;
check(
  "and moves pool lines onto it",
  (await changes(`UPDATE grocery_items SET run_id = $1 WHERE id IN ($2, $3)`, [
    RUN,
    G_EGGS,
    G_RICE,
  ])) === 2,
);
await expectError(
  "nobody buys from a draft",
  () => q(`UPDATE grocery_items SET bought = true WHERE id = $1`, [G_EGGS]),
  /Hindi pa naaaprubahan/,
);

await as(MAY);
check(
  "a runner on the team doesn't see the draft",
  (await q(`SELECT id FROM grocery_runs`)).length === 0,
);
check(
  "nor its lines; the rest of the pool she still sees",
  JSON.stringify((await q(`SELECT name FROM grocery_items ORDER BY name`)).map((r) => r.name)) ===
    JSON.stringify(["Sabon"]),
);
await expectError(
  "a runner can't move a line onto a run",
  () => q(`UPDATE grocery_items SET run_id = $1 WHERE id = $2`, [RUN, G_SOAP]),
  /namamahala|Hindi mo mailipat|row-level security/,
);

await as(ROSA);
check(
  "the lead asks for approval",
  (await changes(`UPDATE grocery_runs SET status = 'pending' WHERE id = $1`, [RUN])) === 1,
);
await expectError(
  "but can't approve it herself",
  () => q(`UPDATE grocery_runs SET status = 'ready' WHERE id = $1`, [RUN]),
  /manager ang mag-a-approve/,
);
await expectError(
  "or put cash on it",
  () => q(`UPDATE grocery_runs SET cash_given = 1000 WHERE id = $1`, [RUN]),
  /magtatakda ng pera/,
);
await q(`INSERT INTO grocery_run_shoppers (run_id, helper_id) VALUES ($1, $2)`, [RUN, HP_LITO]);
check("she sends Lito to do the shopping", true);
await expectError(
  "but not someone who doesn't work here",
  () => q(`INSERT INTO grocery_run_shoppers (run_id, helper_id) VALUES ($1, $2)`, [RUN, HP_NENA]),
  /doesn't work in this household/,
);

// --- A manager approves -------------------------------------------------------------
await as(BEN);
const approved = await one(
  `UPDATE grocery_runs SET status = 'ready', cash_given = 1500 WHERE id = $1
   RETURNING status, approved_by, approved_at`,
  [RUN],
);
check(
  "Ben approves it with ₱1,500 and is recorded as approving",
  approved.status === "ready" && approved.approved_by === BEN && approved.approved_at !== null,
  approved,
);
await expectError(
  "a run's team must be this household's",
  () => q(`UPDATE grocery_runs SET team_id = $1 WHERE id = $2`, [T_H3, RUN]),
  /another household/,
);

// --- Who sees it now ----------------------------------------------------------------
const seen = async (uid) => {
  await as(uid);
  return (await q(`SELECT id FROM grocery_runs WHERE id = $1`, [RUN])).length === 1;
};
check("May sees it: it's for her team", await seen(MAY));
check("Lito sees it: he's going", await seen(LITO));
check("Tess doesn't: not her team, not hers to do", !(await seen(TESS)));
await as(MAY);
check(
  "and May sees its lines",
  (await q(`SELECT id FROM grocery_items WHERE run_id = $1`, [RUN])).length === 2,
);

await as(BEN);
const [{ id: TRIP }] = await q(
  `INSERT INTO tickets (household_id, title, helper_id) VALUES ($1, 'Drive to the market', $2) RETURNING id`,
  [H1, HP_TESS],
);
await q(`UPDATE grocery_runs SET ticket_id = $1 WHERE id = $2`, [TRIP, RUN]);
check("once it's linked to Tess's task, Tess sees it too", await seen(TESS));
await as(JOY);
await asOwner(() =>
  q(
    `INSERT INTO tickets (id, household_id, title) VALUES ('70000000-0000-0000-0000-000000000003', $1, 'Theirs')`,
    [H3],
  ),
);
await as(BEN);
await expectError(
  "a task from another household can't carry it",
  () =>
    q(`UPDATE grocery_runs SET ticket_id = '70000000-0000-0000-0000-000000000003' WHERE id = $1`, [
      RUN,
    ]),
  /another household/,
);

// Nena, shared into the Main House's Kitchen, sees it through her team there.
await q(`INSERT INTO helper_households (helper_id, household_id, team_id) VALUES ($1, $2, $3)`, [
  HP_NENA,
  H1,
  T_KITCHEN,
]);
check("a cook shared in from the Beach House's Kitchen sees it", await seen(NENA));

// --- Shopping -------------------------------------------------------------------------
await as(LITO);
const bought = await one(
  `UPDATE grocery_items SET bought = true, actual_cost = 120 WHERE id = $1 RETURNING bought_at`,
  [G_RICE],
);
check("the shopper ticks the rice bought, ₱120; when is recorded", bought.bought_at !== null);
await as(BEN);
check(
  "and the pantry is restocked as before",
  Number((await one(`SELECT qty FROM pantry_items WHERE id = $1`, [P_RICE])).qty) === 5,
);
await q(`UPDATE grocery_items SET bought_at = now() - interval '40 days' WHERE id = $1`, [G_RICE]);
check(
  "nobody back-dates a purchase",
  (
    await one(
      `SELECT bought_at > now() - interval '1 day' AS recent FROM grocery_items WHERE id = $1`,
      [G_RICE],
    )
  ).recent,
);
await as(LITO);
await expectError(
  "a shopper can't rename a line",
  () => q(`UPDATE grocery_items SET name = 'Bigas (dinorado)' WHERE id = $1`, [G_RICE]),
  /namamahala|Hindi mo mababago/,
);
await expectError(
  "or change the cash",
  () => q(`UPDATE grocery_runs SET cash_given = 3000 WHERE id = $1`, [RUN]),
  /sukli at tapusin/,
);
await expectError(
  "nor hand back more change than the ₱1,500 he was given (O51)",
  () =>
    q(`UPDATE grocery_runs SET status = 'done', change_returned = 1500380 WHERE id = $1`, [RUN]),
  /grocery_runs_change_within_cash/,
);
const closed = await one(
  `UPDATE grocery_runs SET status = 'done', change_returned = 1380 WHERE id = $1
   RETURNING status, closed_by, closed_at`,
  [RUN],
);
check(
  "he hands back ₱1,380 and closes it",
  closed.status === "done" && closed.closed_by === LITO && closed.closed_at !== null,
  closed,
);
await as(BEN);
check(
  "what wasn't bought goes back to the pool",
  (await one(`SELECT run_id FROM grocery_items WHERE id = $1`, [G_EGGS])).run_id === null &&
    (await one(`SELECT run_id FROM grocery_items WHERE id = $1`, [G_RICE])).run_id === RUN,
);

await as(LITO);
await expectError(
  "after closing, a shopper can't untick",
  () => q(`UPDATE grocery_items SET bought = false WHERE id = $1`, [G_RICE]),
  /Sarado na/,
);
await expectError(
  "or reopen it",
  () => q(`UPDATE grocery_runs SET status = 'ready' WHERE id = $1`, [RUN]),
  /Sarado na/,
);
await as(BEN);
check(
  "a manager can still fix a figure on a closed run",
  (await changes(`UPDATE grocery_items SET actual_cost = 125 WHERE id = $1`, [G_RICE])) === 1,
);
await expectError(
  "but not lower the cash below the change handed back",
  () => q(`UPDATE grocery_runs SET cash_given = 1000 WHERE id = $1`, [RUN]),
  /grocery_runs_change_within_cash/,
);
check(
  "but a closed run isn't deleted (its history stays)",
  (await changes(`DELETE FROM grocery_runs WHERE id = $1`, [RUN])) === 0,
);
await as(ROSA);
await expectError(
  "a bought line can't be moved off its run",
  () => q(`UPDATE grocery_items SET run_id = NULL WHERE id = $1`, [G_RICE]),
  /stays where it was bought/,
);

// --- Repeats ---------------------------------------------------------------------------
await as(ROSA);
const [{ id: TPL }] = await q(
  `INSERT INTO grocery_templates (household_id, title, team_id, repeat_weekday, cash_default, shopper_ids)
   VALUES ($1, 'Weekly palengke', $2, 6, 2000, ARRAY[$3, $4]::uuid[]) RETURNING id`,
  [H1, T_KITCHEN, HP_LITO, HP_NENA],
);
await q(
  `INSERT INTO grocery_template_items (template_id, name, qty, unit, pantry_item_id)
   VALUES ($1, 'Itlog', 30, 'pcs', $2), ($1, 'Gulay', 1, 'bundle', NULL)`,
  [TPL, P_EGGS],
);
check("a lead keeps a weekly repeat", true);
await as(MAY);
check("a runner doesn't see repeats", (await q(`SELECT id FROM grocery_templates`)).length === 0);
await expectError(
  "or start one",
  () => q(`SELECT start_grocery_run($1)`, [TPL]),
  /No such repeat run|namamahala/,
);

await as(ROSA);
const fromLead = (await one(`SELECT start_grocery_run($1, '2026-10-10') AS id`, [TPL])).id;
const leadRun = await one(
  `SELECT status, cash_given, shop_on::text FROM grocery_runs WHERE id = $1`,
  [fromLead],
);
check(
  "the lead starts it: a draft for Saturday, with no cash (the manager sets that)",
  leadRun.status === "draft" && leadRun.cash_given === null && leadRun.shop_on === "2026-10-10",
  leadRun,
);
const lines = await q(`SELECT id, name FROM grocery_items WHERE run_id = $1 ORDER BY name`, [
  fromLead,
]);
check(
  "the eggs already in the pool move onto it instead of being listed twice",
  lines.length === 2 && lines.some((l) => l.id === G_EGGS) && lines.some((l) => l.name === "Gulay"),
  lines,
);
const shoppers = await q(`SELECT helper_id FROM grocery_run_shoppers WHERE run_id = $1`, [
  fromLead,
]);
check(
  "its shoppers come along, those who work here (Nena now does)",
  shoppers.length === 2,
  shoppers,
);
await q(`DELETE FROM grocery_runs WHERE id = $1`, [fromLead]);
await as(BEN);
check(
  "deleting a draft puts its lines back in the pool",
  (await one(`SELECT run_id FROM grocery_items WHERE id = $1`, [G_EGGS])).run_id === null,
);
const fromBen = (await one(`SELECT start_grocery_run($1) AS id`, [TPL])).id;
check(
  "a manager's carries the usual cash",
  Number((await one(`SELECT cash_given FROM grocery_runs WHERE id = $1`, [fromBen])).cash_given) ===
    2000,
);
await as(JOY);
await expectError(
  "another family can't start this house's repeat",
  () => q(`SELECT start_grocery_run($1)`, [TPL]),
  /No such repeat run/,
);

// --- Budgets ---------------------------------------------------------------------------
await as(BEN);
await q(
  `INSERT INTO grocery_budgets (household_id, team_id, monthly_amount)
   VALUES ($1, NULL, 20000), ($1, $2, 8000)`,
  [H1, T_KITCHEN],
);
await expectError(
  "one house budget per house",
  () => q(`INSERT INTO grocery_budgets (household_id, monthly_amount) VALUES ($1, 1)`, [H1]),
  /duplicate key/,
);
await expectError(
  "a team budget is for this house's team",
  () =>
    q(`INSERT INTO grocery_budgets (household_id, team_id, monthly_amount) VALUES ($1, $2, 1)`, [
      H1,
      T_H3,
    ]),
  /another household/,
);
await as(ROSA);
check("a lead reads the budgets", (await q(`SELECT id FROM grocery_budgets`)).length === 2);
check(
  "but can't change them",
  (await changes(`UPDATE grocery_budgets SET monthly_amount = 99999`)) === 0,
);
await as(MAY);
check("a runner doesn't see them", (await q(`SELECT id FROM grocery_budgets`)).length === 0);

// --- Receipts ----------------------------------------------------------------------------
await as(LITO);
await q(`INSERT INTO grocery_receipts (household_id, storage_path, run_id) VALUES ($1, $2, $3)`, [
  H1,
  `${H1}/receipts/1.jpg`,
  RUN,
]);
check("a receipt goes with its run", true);
await as(JOY);
await expectError(
  "not with another household's run",
  () =>
    q(`INSERT INTO grocery_receipts (household_id, storage_path, run_id) VALUES ($1, $2, $3)`, [
      H3,
      `${H3}/receipts/1.jpg`,
      RUN,
    ]),
  /another household/,
);
check("and another family sees none of it", (await q(`SELECT id FROM grocery_runs`)).length === 0);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
