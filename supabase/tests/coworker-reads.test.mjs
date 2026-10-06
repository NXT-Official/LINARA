// Runs fix-helper-coworker-reads.sql against a real Postgres (PGlite) and
// acts as the API's `authenticated` role: a helper reads only her own pay
// rows (also from a household she has left), never a coworker's; primary
// managers and remote admins still read the whole household; another
// household's manager reads none of it. KNOWN_GAPS O45.
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
const changes = async (sql, params) => (await q(`${sql} RETURNING 1`, params)).length;

const TABLES = [
  "helper_profiles",
  "payslips",
  "vales",
  "ledger_entries",
  "rest_off_requests",
  "leave_requests",
  "payout_attempts",
  "quick_utos",
];
/** How many rows of each table the current login can see. */
const visible = async () => {
  const out = {};
  for (const t of TABLES) out[t] = (await q(`SELECT 1 FROM ${t}`)).length;
  return out;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
// The live state these policies replace: what fix-helper-write-access.sql
// needs, plus leave_requests, payout_attempts and quick_utos with their
// household-wide policies from add-leave.sql, add-payout-attempts.sql and
// fix-household-rls-recursion.sql.
await db.exec(`
  ALTER TABLE user_profiles ALTER COLUMN household_id DROP NOT NULL;
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false;
  CREATE TABLE public.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    helper_id UUID NOT NULL REFERENCES public.helper_profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'other'
  );
  GRANT SELECT ON public.leave_requests TO authenticated;
  ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
  CREATE POLICY leave_requests_read ON public.leave_requests FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.helper_profiles hp WHERE hp.id = leave_requests.helper_id
      AND (hp.household_id = public.current_household_id() OR hp.user_id = auth.uid())));
  ALTER TABLE payout_attempts ENABLE ROW LEVEL SECURITY;
  CREATE POLICY payout_attempts_isolation ON public.payout_attempts FOR ALL USING (
    EXISTS (SELECT 1 FROM public.payslips p JOIN public.helper_profiles hp ON hp.id = p.helper_id
      WHERE p.id = payout_attempts.payslip_id AND hp.household_id = public.current_household_id()));
  ALTER TABLE quick_utos ENABLE ROW LEVEL SECURITY;
  CREATE POLICY quick_utos_isolation ON public.quick_utos FOR ALL USING (
    EXISTS (SELECT 1 FROM public.helper_profiles hp WHERE hp.id = quick_utos.recipient_id
      AND hp.household_id = public.current_household_id()));
`);
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));

const M = "00000000-0000-0000-0000-00000000000a"; // primary manager, household H
const R = "00000000-0000-0000-0000-00000000000e"; // remote admin, household H
const U = "00000000-0000-0000-0000-00000000000b"; // helper (Marites), H; worked in H2 before
const U2 = "00000000-0000-0000-0000-00000000000d"; // her coworker (Rosa), H
const M2 = "00000000-0000-0000-0000-00000000000c"; // primary manager, household H2
const H = "10000000-0000-0000-0000-000000000001";
const H2 = "10000000-0000-0000-0000-000000000002";
const HP = "20000000-0000-0000-0000-000000000001"; // Marites in H
const HP_CO = "20000000-0000-0000-0000-000000000002"; // Rosa in H
const HP_PAST = "20000000-0000-0000-0000-000000000003"; // Marites's old job in H2
const PS = "30000000-0000-0000-0000-000000000001";
const PS_CO = "30000000-0000-0000-0000-000000000002";
const PS_PAST = "30000000-0000-0000-0000-000000000003";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}'), ('${R}'), ('${U}'), ('${U2}'), ('${M2}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household'), ('${H2}', 'Cruz Household');
  INSERT INTO user_profiles VALUES
    ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now()),
    ('${R}', '${H}', 'Lita Reyes', 'remote_admin', now()),
    ('${U}', '${H}', 'Marites Santos', 'helper', now()),
    ('${U2}', '${H}', 'Rosa Dela Cruz', 'helper', now()),
    ('${M2}', '${H2}', 'Ana Cruz', 'primary_manager', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval, status)
    VALUES ('${HP}', '${U}', '${H}', 'Marites', 'Yaya', 8000, 'semi_monthly', 'ACTIVE'),
           ('${HP_CO}', '${U2}', '${H}', 'Rosa', 'Cook', 9000, 'semi_monthly', 'ACTIVE'),
           ('${HP_PAST}', '${U}', '${H2}', 'Marites', 'Yaya', 7000, 'semi_monthly', 'INACTIVE');
  INSERT INTO payslips (id, helper_id, cutoff_start, cutoff_end, base_pay, statutory_employee_share, net_pay, payout_channel_code)
    VALUES ('${PS}', '${HP}', '2026-09-01', '2026-09-15', 4000, 200, 3800, 'PH_GCASH'),
           ('${PS_CO}', '${HP_CO}', '2026-09-01', '2026-09-15', 4500, 200, 4300, 'PH_GCASH'),
           ('${PS_PAST}', '${HP_PAST}', '2026-01-01', '2026-01-15', 3500, 200, 3300, 'PH_GCASH');
  INSERT INTO payout_attempts (payslip_id, attempt_number, reference_id, status, amount_sent, channel_code)
    VALUES ('${PS}', 1, 'ref-1', 'succeeded', 3800, 'PH_GCASH'),
           ('${PS_CO}', 1, 'ref-2', 'succeeded', 4300, 'PH_GCASH');
  INSERT INTO vales (helper_id, amount, status) VALUES ('${HP}', 500, 'pending'), ('${HP_CO}', 900, 'approved');
  INSERT INTO ledger_entries (helper_id, duration_minutes) VALUES ('${HP}', 60), ('${HP_CO}', 90);
  INSERT INTO rest_off_requests (helper_id, rest_date, minutes) VALUES ('${HP}', '2026-10-05', 60), ('${HP_CO}', '2026-10-06', 90);
  INSERT INTO leave_requests (helper_id, kind, reason) VALUES ('${HP}', 'sil', 'vacation'), ('${HP_CO}', 'sil', 'sick');
  INSERT INTO quick_utos (recipient_id, content) VALUES ('${HP}', 'Pakikuha ang labada'), ('${HP_CO}', 'Bili ng bigas');
`);

await db.exec(`SET ROLE authenticated`);

// Before: the leak O45 describes.
await as(U);
const before = await visible();
check(
  "before the fix, a helper sees her coworker's rows",
  (await q(`SELECT 1 FROM helper_profiles WHERE id = $1`, [HP_CO])).length === 1 &&
    (await q(`SELECT 1 FROM payslips WHERE helper_id = $1`, [HP_CO])).length === 1 &&
    (await q(`SELECT 1 FROM vales WHERE helper_id = $1`, [HP_CO])).length === 1,
  before,
);

await db.exec(`RESET ROLE`);
await db.exec(readFileSync(`${REPO}/fix-helper-coworker-reads.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/fix-helper-coworker-reads.sql`, "utf8"));
console.log("migration applied twice");
await db.exec(`SET ROLE authenticated`);

// --- Her login --------------------------------------------------------------
await as(U);
const hers = await visible();
check(
  "a helper sees only her own rows, her old job's included",
  same(hers, {
    helper_profiles: 2,
    payslips: 2,
    vales: 1,
    ledger_entries: 1,
    rest_off_requests: 1,
    leave_requests: 1,
    payout_attempts: 0,
    quick_utos: 1,
  }),
  hers,
);
check(
  "none of them is her coworker's",
  (await q(`SELECT 1 FROM helper_profiles WHERE id = $1`, [HP_CO])).length === 0 &&
    (await q(`SELECT 1 FROM payslips WHERE helper_id = $1`, [HP_CO])).length === 0 &&
    (await q(`SELECT 1 FROM leave_requests WHERE helper_id = $1`, [HP_CO])).length === 0 &&
    (await q(`SELECT 1 FROM quick_utos WHERE recipient_id = $1`, [HP_CO])).length === 0,
);
check(
  "she can still ask for a vale",
  (await changes(`INSERT INTO vales (helper_id, amount, status) VALUES ($1, 300, 'pending')`, [
    HP,
  ])) === 1,
);
check(
  "and set her own availability",
  (await changes(`UPDATE helper_profiles SET manual_status = 'available' WHERE id = $1`, [HP])) ===
    1,
);

// --- Her coworker's login: the same wall the other way -------------------
await as(U2);
const rosa = await visible();
check(
  "her coworker sees only her own rows",
  rosa.helper_profiles === 1 && rosa.payslips === 1 && rosa.vales === 1 && rosa.quick_utos === 1,
  rosa,
);

// --- Managers: unchanged -------------------------------------------------------
const household = {
  helper_profiles: 2,
  payslips: 2,
  vales: 3,
  ledger_entries: 2,
  rest_off_requests: 2,
  leave_requests: 2,
  payout_attempts: 2,
  quick_utos: 2,
};
await as(M);
const ben = await visible();
check("the primary manager still sees the whole household", same(ben, household), ben);
await as(R);
const lita = await visible();
check("so does a remote admin", same(lita, household), lita);
await as(M2);
const ana = await visible();
check(
  "another household's manager sees only that household (Marites's old job)",
  ana.helper_profiles === 1 && ana.payslips === 1 && ana.vales === 0 && ana.payout_attempts === 0,
  ana,
);

await db.exec(`RESET ROLE`);
if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
