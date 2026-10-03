/**
 * Local QA pass: what the client's QA bot checks, run on this machine.
 *
 *   npm run qa         typecheck, lint, unit + SQL tests, build, browser tests
 *   npm run qa:fast    typecheck, lint, unit tests (a minute or so)
 *
 * Every step runs even if an earlier one fails, so one run shows everything.
 * The browser tests run against the production build on port 8091 (a dev
 * server hides production-only UI and would clash with `npm run dev`), using
 * the test accounts in .env.e2e. Output goes to qa-reports/<time>/: one log per
 * step and report.md. Exits 1 if anything failed.
 */
import { execSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FAST = process.argv.includes("--fast");
const PREVIEW_PORT = 8091;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const outDir = join("qa-reports", stamp);
mkdirSync(outDir, { recursive: true });

const env = { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CI: "1" };
// Colour codes some tools print anyway; the escape character is the point.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

/** Runs a shell command, logging to qa-reports/<time>/<slug>.log. */
function run(cmd, slug, extraEnv = {}) {
  return new Promise((resolve) => {
    const log = createWriteStream(join(outDir, `${slug}.log`));
    let output = "";
    const child = spawn(cmd, { shell: true, env: { ...env, ...extraEnv } });
    const take = (chunk) => {
      const text = chunk.toString().replace(ANSI, "");
      output += text;
      log.write(text);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("close", (code) => {
      log.end();
      resolve({ ok: code === 0, output });
    });
  });
}

/** Starts `vite preview` and waits for /login; returns a stop function. */
async function startPreview() {
  // Else the browser tests would quietly run against whatever that is.
  const taken = await fetch(PREVIEW_URL).then(
    () => true,
    () => false,
  );
  if (taken) throw new Error(`Port ${PREVIEW_PORT} is already in use; stop that server first.`);
  const log = createWriteStream(join(outDir, "preview.log"));
  const child = spawn(`npx vite preview --port ${PREVIEW_PORT} --strictPort`, {
    shell: true,
    env,
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

/** A one-line result for the summary, read from the tool's own output. */
const summaries = {
  typecheck: (out) => {
    const n = (out.match(/error TS\d+/g) ?? []).length;
    return n ? `${n} error${n > 1 ? "s" : ""}` : "";
  },
  lint: (out) => {
    const m = /(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/.exec(out);
    return m ? `${m[2]} errors, ${m[3]} warnings` : "0 errors, 0 warnings";
  },
  unit: (out) => /Tests\s+(.+?)\s*\(\d+\)/.exec(out)?.[1] ?? "",
  // Each runner prints "ok   <check>" or "FAIL <check>"; test:sql stops at
  // the first file that fails.
  sql: (out) => {
    const passed = (out.match(/^ok {2}/gm) ?? []).length;
    const failing = (out.match(/^FAIL /gm) ?? []).length;
    return `${passed} checks passed${failing ? `, ${failing} failing` : ""}`;
  },
  e2e: (out) => {
    const counts = [/\d+ passed/, /\d+ failed/, /\d+ skipped/, /\d+ flaky/];
    return counts
      .map((re) => re.exec(out)?.[0])
      .filter(Boolean)
      .join(", ");
  },
};

const steps = [
  { name: "Typecheck", slug: "typecheck", cmd: "npm run typecheck" },
  { name: "Lint", slug: "lint", cmd: "npm run lint" },
  { name: "Unit tests", slug: "unit", cmd: "npm test" },
  ...(FAST
    ? []
    : [
        { name: "Database tests", slug: "sql", cmd: "npm run test:sql" },
        { name: "Build", slug: "build", cmd: "npm run build" },
        { name: "Browser tests", slug: "e2e", browser: true },
      ]),
];

const git = (args) => execSync(`git ${args}`, { encoding: "utf8" }).trim();
const branch = git("rev-parse --abbrev-ref HEAD");
const commit = git("rev-parse --short HEAD");
const dirty = git("status --porcelain") !== "";

console.log(
  `QA ${FAST ? "(fast) " : ""}on ${branch} @ ${commit}${dirty ? " + uncommitted changes" : ""}`,
);

const results = [];
for (const step of steps) {
  process.stdout.write(`  ${step.name.padEnd(16)}`);
  const started = Date.now();
  let result;
  if (step.browser) {
    if (results.find((r) => r.slug === "build" && !r.ok)) {
      result = { ok: false, output: "Skipped: the build failed.", skipped: true };
    } else {
      let stop;
      try {
        stop = await startPreview();
        const accounts = existsSync(".env.e2e") ? "" : " (no .env.e2e: signed-in checks skip)";
        result = await run("npx playwright test --reporter=line", step.slug, {
          E2E_BASE_URL: PREVIEW_URL,
        });
        result.note = accounts;
      } catch (err) {
        result = { ok: false, output: String(err) };
      } finally {
        await stop?.();
      }
    }
  } else {
    result = await run(step.cmd, step.slug);
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  const detail = (summaries[step.slug]?.(result.output) ?? "") + (result.note ?? "");
  results.push({ ...step, ...result, seconds, detail });
  console.log(
    `${result.skipped ? "– skipped" : result.ok ? "✓ pass" : "✗ FAIL"}  ${seconds}s  ${detail}`,
  );
}

const failed = results.filter((r) => !r.ok);
const tail = (text, n = 40) => text.trim().split("\n").slice(-n).join("\n");

const report = [
  `# LINARA Web — local QA`,
  "",
  `${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })} PHT · \`${branch}\` @ \`${commit}\`${dirty ? " (with uncommitted changes)" : ""}${FAST ? " · fast pass" : ""}`,
  "",
  `**${failed.length ? `${failed.length} step${failed.length > 1 ? "s" : ""} failed` : "All clear"}**`,
  "",
  "| Check | Result | Time | Detail |",
  "|---|---|---|---|",
  ...results.map(
    (r) =>
      `| ${r.name} | ${r.skipped ? "skipped" : r.ok ? "pass" : "**FAIL**"} | ${r.seconds}s | ${r.detail} |`,
  ),
  "",
  ...failed.flatMap((r) => [
    `## ${r.name}`,
    "",
    `Full log: \`${r.slug}.log\`. Last lines:`,
    "",
    "```",
    tail(r.output),
    "```",
    "",
  ]),
  ...(results.some((r) => r.slug === "e2e" && r.ok === false && !r.skipped)
    ? ["Browser test traces and screenshots: `npx playwright show-report`.", ""]
    : []),
].join("\n");

writeFileSync(join(outDir, "report.md"), report);
writeFileSync(join("qa-reports", "latest.md"), report);
console.log(`\nReport: ${join(outDir, "report.md")} (also qa-reports/latest.md)`);
process.exit(failed.length ? 1 : 0);
