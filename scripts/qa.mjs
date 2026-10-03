/**
 * Local QA pass: what the client's QA bot checks, run on this machine.
 *
 *   npm run qa         typecheck, lint, unit + SQL tests, build, browser tests
 *   npm run qa:fast    typecheck, lint, unit tests (also the pre-push hook)
 *   npm run qa:live    browser tests against the deployed site (QA_LIVE_URL,
 *                      default https://linara-delta.vercel.app)
 *   npm run qa:deep    build, then e2e/deep: a task and a pantry item made,
 *                      changed and removed for real in the test household
 *
 * Local browser tests run against the production build on port 8091 (a dev
 * server hides production-only UI and would clash with `npm run dev`). They
 * sign in with the test accounts in .env.e2e and change no data, except
 * qa:deep, which deletes what it makes (e2e/deep/cleanup.ts).
 * Issues, IDs and the report: scripts/qa-runner.mjs.
 */
import { createWriteStream, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

import { run, runQa } from "./qa-runner.mjs";

const mode = ["live", "fast", "deep"].find((m) => process.argv.includes(`--${m}`)) ?? "full";
const PREVIEW_PORT = 8091;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;
const LIVE_URL = (process.env.QA_LIVE_URL ?? "https://linara-delta.vercel.app").replace(/\/+$/, "");
const accountsNote = existsSync(".env.e2e") ? "" : "(no .env.e2e: signed-in checks skipped)";

/** Starts `vite preview` and waits for /login; returns a stop function. */
async function startPreview(outDir) {
  // Else the browser tests would quietly run against whatever that is.
  const taken = await fetch(PREVIEW_URL).then(
    () => true,
    () => false,
  );
  if (taken) throw new Error(`Port ${PREVIEW_PORT} is already in use; stop that server first.`);
  const log = createWriteStream(join(outDir, "preview.log"));
  const child = spawn(`npx vite preview --port ${PREVIEW_PORT} --strictPort`, {
    shell: true,
    env: process.env,
    // Its own process group elsewhere, so the whole group can be stopped.
    detached: process.platform !== "win32",
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  // Waits for the server to go: exiting first would orphan it on the port.
  // On Windows the shell's child (vite) only goes with the whole tree.
  const stop = () =>
    new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      if (process.platform === "win32") {
        spawn(`taskkill /pid ${child.pid} /T /F`, { shell: true, stdio: "ignore" }).on(
          "close",
          resolve,
        );
      } else {
        child.on("close", resolve);
        process.kill(-child.pid, "SIGTERM");
      }
    });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${PREVIEW_URL}/login`);
      if (res.ok) return stop;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  await stop();
  throw new Error(`vite preview didn't answer on ${PREVIEW_URL} within a minute`);
}

const browserTests =
  (baseUrl, { deep = false } = {}) =>
  async (ctx) => {
    const result = await run(
      `npx playwright test --reporter=line${deep ? " --project=deep" : ""}`,
      {
        ...ctx,
        extraEnv: { E2E_BASE_URL: baseUrl, ...(deep ? { E2E_DEEP: "1" } : {}) },
      },
    );
    return { ...result, note: accountsNote };
  };

const steps = {
  typecheck: { name: "Typecheck", slug: "typecheck", cmd: "npm run typecheck", parse: "typecheck" },
  lint: { name: "Lint", slug: "lint", cmd: "npm run lint", parse: "eslint" },
  unit: { name: "Unit tests", slug: "unit", cmd: "npm test", parse: "vitest" },
  sql: { name: "Database tests", slug: "sql", cmd: "npm run test:sql", parse: "sqlRunner" },
  build: { name: "Build", slug: "build", cmd: "npm run build" },
  e2e: { name: "Browser tests", slug: "e2e", parse: "playwright", needs: "build" },
  deep: { name: "Deep checks", slug: "e2e-deep", parse: "playwright", needs: "build" },
  // Its own slug, so the live site's issues stay apart from this machine's.
  live: { name: "Live site", slug: "e2e-live", parse: "playwright", exec: browserTests(LIVE_URL) },
};

// The local browser steps run against the build, served for the step.
for (const key of ["e2e", "deep"]) {
  const tests = browserTests(PREVIEW_URL, { deep: key === "deep" });
  steps[key].exec = async (ctx) => {
    const stop = await startPreview(ctx.outDir);
    try {
      return await tests(ctx);
    } finally {
      await stop();
    }
  };
}

const plan = {
  full: ["typecheck", "lint", "unit", "sql", "build", "e2e"],
  fast: ["typecheck", "lint", "unit"],
  live: ["live"],
  deep: ["build", "deep"],
}[mode];

process.exit(
  await runQa({
    app: mode === "live" ? `LINARA Web (${LIVE_URL})` : "LINARA Web",
    prefix: "W",
    mode,
    steps: plan.map((k) => steps[k]),
  }),
);
