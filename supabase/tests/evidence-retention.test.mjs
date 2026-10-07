// Runs add-evidence-photo-retention.sql against a real Postgres (PGlite):
// task photos go after 30 days, receipts after 60, thumbnails and unreferenced
// files with them; payout QR codes and other buckets never; the rows that
// pointed at a removed photo are cleared; nobody but the service role can call
// it.
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

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
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

await db.exec(readFileSync(resolve(HERE, "base-schema.sql"), "utf8"));
await db.exec(`
  CREATE ROLE service_role;
  ALTER TABLE vales ADD COLUMN approved_by UUID, ADD COLUMN reason TEXT;
  ALTER TABLE households ADD COLUMN board_closed BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE tickets ADD COLUMN photo_evidence_url TEXT;
  -- The part of Supabase's storage schema the purge reads.
  CREATE SCHEMA storage;
  CREATE TABLE storage.objects (
      bucket_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);
await db.exec(readFileSync(`${REPO}/fix-helper-write-access.sql`, "utf8"));
await db.exec(readFileSync(`${REPO}/add-grocery-receipts.sql`, "utf8"));
const migration = readFileSync(`${REPO}/add-evidence-photo-retention.sql`, "utf8").split(
  "-- @schedule",
)[0];
await db.exec(migration);
await db.exec(migration);
console.log("migration applied twice");

const M = "00000000-0000-0000-0000-00000000000a";
const H = "10000000-0000-0000-0000-000000000001";
const HP = "20000000-0000-0000-0000-000000000001";
const SIGN = "https://x.supabase.co/storage/v1/object/sign/household-evidence";

await db.exec(`
  INSERT INTO auth.users VALUES ('${M}');
  INSERT INTO households (id, name) VALUES ('${H}', 'Reyes Household');
  INSERT INTO user_profiles VALUES ('${M}', '${H}', 'Ben Reyes', 'primary_manager', now());
  INSERT INTO helper_profiles (id, user_id, household_id, name, station, monthly_rate, payday_interval)
    VALUES ('${HP}', NULL, '${H}', 'Marites', 'Kitchen', 6000, 'monthly');
`);

const file = (name, daysAgo, bucket = "household-evidence") =>
  q(
    `INSERT INTO storage.objects (bucket_id, name, created_at) VALUES ($1, $2, now() - make_interval(days => $3))`,
    [bucket, name, daysAgo],
  );
const ticket = async (photo) =>
  (
    await q(
      `INSERT INTO tickets (household_id, title, helper_id, status, photo_evidence_url)
       VALUES ($1, 'Linis', $2, 'done', $3) RETURNING id`,
      [H, HP, photo],
    )
  )[0].id;
const receipt = async (path) =>
  (
    await q(
      `INSERT INTO grocery_receipts (household_id, storage_path, uploaded_by) VALUES ($1, $2, $3) RETURNING id`,
      [H, path, M],
    )
  )[0].id;
const photoOf = async (id) =>
  (await q(`SELECT photo_evidence_url FROM tickets WHERE id = $1`, [id]))[0].photo_evidence_url;
const receiptExists = async (id) =>
  (await q(`SELECT 1 FROM grocery_receipts WHERE id = $1`, [id])).length === 1;

const oldTask = `${H}/tickets/old.jpg`;
const oldThumb = `${H}/tickets/old.thumb.jpg`;
const newTask = `${H}/tickets/new.jpg`;
const orphan = `${H}/tickets/never-saved.jpg`;
const oldReceipt = `${H}/receipts/1.jpg`;
const midReceipt = `${H}/receipts/2.jpg`;
const runReceipt = `${H}/receipts/3.jpg`;
const qr = `payout/${M}/qr.png`;

await file(oldTask, 31);
await file(oldThumb, 31);
await file(newTask, 29);
await file(orphan, 40);
await file(oldReceipt, 61);
await file(midReceipt, 45);
await file(runReceipt, 45);
await file(qr, 400);
await file(`${H}/tickets/other-bucket.jpg`, 400, "somewhere-else");

const tOld = await ticket(`${SIGN}/${oldTask}?token=abc`);
const tNew = await ticket(`${SIGN}/${newTask}?token=abc`);
const tRun = await ticket(`${SIGN}/${runReceipt}?token=abc`);
const tNone = await ticket(null);
const rOld = await receipt(oldReceipt);
const rMid = await receipt(midReceipt);

await db.exec(`SET ROLE authenticated`);
await expectError(
  "a signed-in user can't run it",
  () => q(`SELECT public.release_expired_evidence()`),
  /permission denied/,
);
await db.exec(`RESET ROLE`);

await db.exec(`GRANT USAGE ON SCHEMA public TO service_role`);
await db.exec(`SET ROLE service_role`);
const [{ release_expired_evidence: released }] = await q(
  `SELECT public.release_expired_evidence()`,
);
await db.exec(`RESET ROLE`);

const got = new Set(released);
check(
  "returns task photos past 30 days, their thumbnails, and a file no row used",
  got.has(oldTask) && got.has(oldThumb) && got.has(orphan),
  released,
);
check("returns receipts past 60 days", got.has(oldReceipt), released);
check(
  "keeps a 29-day task photo and 45-day receipts",
  !got.has(newTask) && !got.has(midReceipt) && !got.has(runReceipt),
);
check("never touches payout QR codes or another bucket", !got.has(qr) && released.length === 4);

check("the old task's photo reference is cleared", (await photoOf(tOld)) === null);
check(
  "the task itself stays",
  (await q(`SELECT 1 FROM tickets WHERE id = $1`, [tOld])).length === 1,
);
check("a recent task keeps its photo", (await photoOf(tNew)) !== null);
check(
  "a palengke run keeps its receipt photo for the receipts' 60 days",
  (await photoOf(tRun)) !== null,
);
check("a task with no photo is untouched", (await photoOf(tNone)) === null);
check("the old receipt row goes with its photo", !(await receiptExists(rOld)));
check("a newer receipt row stays", await receiptExists(rMid));

// The Edge Function removes the files after this; if that failed they're
// still there, and the next run picks them again without harm.
const [{ release_expired_evidence: again }] = await q(`SELECT public.release_expired_evidence()`);
check("running again before the files are removed returns them again", again.length === 4);

await q(`DELETE FROM storage.objects WHERE name = ANY($1)`, [released]);
const [{ release_expired_evidence: after }] = await q(`SELECT public.release_expired_evidence()`);
check("once removed, nothing is left to do", after.length === 0, after);

const paths = await q(
  `SELECT public.household_evidence_path($1) AS signed, public.household_evidence_path($2) AS bare,
          public.household_evidence_path($3) AS foreign, public.household_evidence_path(NULL) AS none`,
  [`${SIGN}/${oldTask}?token=abc`, oldReceipt, "https://images.unsplash.com/x.jpg"],
);
check(
  "reads a path out of a signed URL or a bare path, and nothing out of another URL",
  paths[0].signed === oldTask &&
    paths[0].bare === oldReceipt &&
    paths[0].foreign === null &&
    paths[0].none === null,
  paths[0],
);

await db.close();
console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exitCode = failures === 0 ? 0 : 1;
