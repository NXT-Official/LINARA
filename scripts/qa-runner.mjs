/**
 * The local QA runner behind `npm run qa` (scripts/qa.mjs says which steps).
 * Kept identical in ../LINARA_MOBILE/scripts/qa-runner.mjs: change both.
 *
 * Runs every step even after a failure, turns each failure into an issue
 * (a type error, a lint rule in a file, a failing test), and keeps them in
 * qa-reports/issues.json across runs: an issue keeps its ID (W-3, M-1) until
 * a run of its check no longer finds it, which marks it fixed. A fast run
 * doesn't skip-close what it didn't check. Writes qa-reports/<time>/ (a log
 * per step, report.md) and qa-reports/latest.md. Exits 1 if a step failed.
 */
import { execSync, spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const env = { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CI: "1" };
// Colour codes some tools print anyway: ESC, then e.g. "[31m".
const ESC = String.fromCharCode(27);
const stripColour = (text) =>
  text
    .split(ESC)
    .map((part, i) => (i === 0 ? part : part.replace(/^\[[0-9;]*m/, "")))
    .join("");
const rel = (p) => relative(process.cwd(), p.trim()).replace(/\\/g, "/");

/** Runs a shell command, logging to <outDir>/<slug>.log. */
export function run(cmd, { outDir, slug, extraEnv = {} }) {
  return new Promise((resolve) => {
    const log = createWriteStream(join(outDir, `${slug}.log`));
    let output = "";
    const child = spawn(cmd, { shell: true, env: { ...env, ...extraEnv } });
    const take = (chunk) => {
      const text = stripColour(chunk.toString());
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

/**
 * Reads issues out of a tool's output. Each: a `key` that stays the same while
 * the problem does (no line numbers, which shift), a `title`, and `where`.
 */
export const parsers = {
  typecheck: (out) =>
    [...out.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/gm)].map((m) => ({
      key: `${rel(m[1])}:${m[3]}:${m[4]}`,
      title: m[4],
      where: `${rel(m[1])}:${m[2]}`,
    })),

  eslint: (out) => {
    const byFileRule = new Map();
    const lineEndings = new Set();
    let file = "";
    for (const line of out.split("\n")) {
      if (/^\S.*\.(m?[jt]sx?|cjs)\s*$/.test(line)) {
        file = rel(line);
        continue;
      }
      const m = /^\s+(\d+):\d+\s+(error|warning)\s+(.+?)\s{2,}(\S+)\s*$/.exec(line);
      if (!m || !file) continue;
      if (m[3].includes("␍")) {
        lineEndings.add(file);
        continue;
      }
      const key = `${file}:${m[4]}`;
      const seen = byFileRule.get(key);
      if (seen) seen.count++;
      else
        byFileRule.set(key, {
          key,
          title: `${m[3]} (${m[4]}, ${m[2]})`,
          where: `${file}:${m[1]}`,
          count: 1,
        });
    }
    const issues = [...byFileRule.values()].map((i) => ({
      ...i,
      title: i.count > 1 ? `${i.title} ×${i.count}` : i.title,
    }));
    if (lineEndings.size) {
      issues.push({
        key: "line-endings",
        title: `Windows line endings in ${lineEndings.size} files: re-check them out (see .gitattributes)`,
        where: [...lineEndings][0],
      });
    }
    return issues;
  },

  vitest: (out) =>
    [...new Set([...out.matchAll(/^ FAIL {2}(.+?)\s*$/gm)].map((m) => m[1]))].map((t) => ({
      key: t,
      title: t.split(" > ").slice(1).join(" > ") || "Test file failed to run",
      where: rel(t.split(" > ")[0].replace(/ \[.*$/, "")),
    })),

  // The supabase/tests runners print "ok   <check>" or "FAIL <check>".
  sqlRunner: (out) =>
    [...out.matchAll(/^FAIL (.+)$/gm)]
      .map((m) => m[1].split(" -> ")[0].trim())
      .map((check) => ({
        key: check,
        title: check,
        where: "supabase/tests",
      })),

  // "  1) [phone] › e2e\x.spec.ts:21:5 › group › test ─────"; the same test
  // failing on desktop and phone is one issue.
  playwright: (out) => {
    const byTest = new Map();
    for (const m of out.matchAll(/^\s*\d+\) \[([^\]]+)\] › (\S+?):(\d+):\d+ › (.+)$/gm)) {
      const test = m[4].replace(/[\s─]+$/, "");
      const key = `${rel(m[2])}:${test}`;
      const seen = byTest.get(key);
      if (seen) seen.projects.add(m[1]);
      else byTest.set(key, { key, test, where: `${rel(m[2])}:${m[3]}`, projects: new Set([m[1]]) });
    }
    return [...byTest.values()].map(({ key, test, where, projects }) => ({
      key,
      title: `${test} (${[...projects].sort().join(", ")})`,
      where,
    }));
  },
};

/** A one-line result per step, from the tool's own output. */
const summaries = {
  typecheck: (out) => {
    const n = (out.match(/error TS\d+/g) ?? []).length;
    return n ? `${n} error${n > 1 ? "s" : ""}` : "";
  },
  eslint: (out) => {
    const m = /(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/.exec(out);
    return m ? `${m[2]} errors, ${m[3]} warnings` : "0 errors, 0 warnings";
  },
  vitest: (out) => /Tests\s+(.+?)\s*\(\d+\)/.exec(out)?.[1] ?? "",
  sqlRunner: (out) => {
    const passed = (out.match(/^ok {2}/gm) ?? []).length;
    const failing = (out.match(/^FAIL /gm) ?? []).length;
    return `${passed} checks passed${failing ? `, ${failing} failing` : ""}`;
  },
  playwright: (out) =>
    [/\d+ passed/, /\d+ failed/, /\d+ skipped/, /\d+ flaky/]
      .map((re) => re.exec(out)?.[0])
      .filter(Boolean)
      .join(", "),
};

function loadTracker(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { next: 1, issues: {} };
  }
}

/**
 * @param {object} o
 * @param {string} o.app       "LINARA Web"
 * @param {string} o.prefix    issue IDs: "W" → W-1
 * @param {string} o.mode      shown in the report ("full", "fast", "live")
 * @param {Array}  o.steps     { name, slug, cmd | exec(ctx), parse, needs? }
 */
export async function runQa({ app, prefix, mode, steps }) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const outDir = join("qa-reports", stamp);
  mkdirSync(outDir, { recursive: true });

  const git = (args) => execSync(`git ${args}`, { encoding: "utf8" }).trim();
  const branch = git("rev-parse --abbrev-ref HEAD");
  const commit = git("rev-parse --short HEAD");
  const dirty = git("status --porcelain") !== "";
  console.log(`QA (${mode}) on ${branch} @ ${commit}${dirty ? " + uncommitted changes" : ""}`);

  const results = [];
  for (const step of steps) {
    process.stdout.write(`  ${step.name.padEnd(16)}`);
    const started = Date.now();
    let result;
    const blocker = step.needs && results.find((r) => r.slug === step.needs && !r.ok);
    if (blocker) {
      result = { ok: false, skipped: true, output: `Skipped: ${blocker.name} failed.` };
    } else {
      try {
        result = step.exec
          ? await step.exec({ outDir, slug: step.slug })
          : await run(step.cmd, { outDir, slug: step.slug });
      } catch (err) {
        result = { ok: false, output: String(err?.stack ?? err) };
      }
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    const parsed = result.skipped ? [] : (parsers[step.parse]?.(result.output) ?? []);
    // A failure the parser couldn't read is still one issue.
    const issues =
      !result.ok && !result.skipped && parsed.length === 0
        ? [{ key: "failed", title: `${step.name} failed (see ${step.slug}.log)`, where: "" }]
        : parsed;
    const detail = [summaries[step.parse]?.(result.output), result.note].filter(Boolean).join(" ");
    results.push({ ...step, ...result, seconds, detail, issues });
    console.log(
      `${result.skipped ? "– skipped" : result.ok ? "✓ pass" : "✗ FAIL"}  ${seconds}s  ${detail}`,
    );
  }

  // Carry issues across runs.
  const trackerFile = join("qa-reports", "issues.json");
  const tracker = loadTracker(trackerFile);
  const now = new Date().toISOString();
  const found = new Map();
  for (const r of results) {
    for (const i of r.issues)
      found.set(`${r.slug}:${i.key}`, { ...i, check: r.name, slug: r.slug });
  }
  const ran = new Set(results.filter((r) => !r.skipped).map((r) => r.slug));
  const fresh = [];
  const reopened = [];
  const fixed = [];
  for (const [key, i] of found) {
    const known = tracker.issues[key];
    if (!known) {
      tracker.issues[key] = {
        id: `${prefix}-${tracker.next++}`,
        ...i,
        firstSeen: now,
        status: "open",
      };
      fresh.push(key);
    } else {
      if (known.status === "fixed") reopened.push(key);
      Object.assign(known, i, { status: "open", lastSeen: now, fixedAt: undefined });
    }
    tracker.issues[key].lastSeen = now;
  }
  for (const [key, known] of Object.entries(tracker.issues)) {
    if (known.status === "open" && ran.has(known.slug) && !found.has(key)) {
      known.status = "fixed";
      known.fixedAt = now;
      fixed.push(key);
    }
  }
  writeFileSync(trackerFile, JSON.stringify(tracker, null, 2));

  const open = Object.entries(tracker.issues).filter(([, i]) => i.status === "open");
  const failed = results.filter((r) => !r.ok);
  const cell = (s) => String(s ?? "").replace(/\|/g, "\\|");
  const tail = (text, n = 30) => text.trim().split("\n").slice(-n).join("\n");
  const label = (key) =>
    fresh.includes(key) ? " **new**" : reopened.includes(key) ? " **back**" : "";

  const headline = [
    open.length ? `${open.length} open issue${open.length > 1 ? "s" : ""}` : "No open issues",
    fresh.length ? `${fresh.length} new` : "",
    fixed.length ? `${fixed.length} fixed since last run` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const report = [
    `# ${app} — local QA (${mode})`,
    "",
    `${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })} PHT · \`${branch}\` @ \`${commit}\`${dirty ? " (with uncommitted changes)" : ""}`,
    "",
    `**${headline}**`,
    "",
    "| Check | Result | Time | Detail |",
    "|---|---|---|---|",
    ...results.map(
      (r) =>
        `| ${r.name} | ${r.skipped ? "skipped" : r.ok ? "pass" : "**FAIL**"} | ${r.seconds}s | ${cell(r.detail)} |`,
    ),
    "",
    ...(open.length
      ? [
          "## Open issues",
          "",
          "| ID | Check | Issue | Where | Since |",
          "|---|---|---|---|---|",
          ...open.map(
            ([key, i]) =>
              `| ${i.id}${label(key)} | ${i.check} | ${cell(i.title)} | \`${cell(i.where)}\` | ${i.firstSeen.slice(0, 10)} |`,
          ),
          "",
        ]
      : []),
    ...(fixed.length
      ? [
          "## Fixed since last run",
          "",
          ...fixed.map((key) => {
            const i = tracker.issues[key];
            return `- ${i.id} · ${i.check}: ${i.title}`;
          }),
          "",
        ]
      : []),
    ...failed
      .filter((r) => !r.skipped)
      .flatMap((r) => [
        `## ${r.name}: last lines`,
        "",
        `Full log: \`${r.slug}.log\`.`,
        "",
        "```",
        tail(r.output),
        "```",
        "",
      ]),
    ...(steps.some((s) => s.parse === "playwright") && failed.some((r) => r.parse === "playwright")
      ? ["Browser test traces and screenshots: `npx playwright show-report`.", ""]
      : []),
  ].join("\n");

  writeFileSync(join(outDir, "report.md"), report);
  writeFileSync(join("qa-reports", "latest.md"), report);
  console.log(`\n${headline}`);
  for (const [key, i] of open) {
    console.log(`  ${i.id}${label(key).replaceAll("*", "")}  ${i.check}: ${i.title}`);
  }
  console.log(`\nReport: ${join(outDir, "report.md")} (also qa-reports/latest.md)`);
  return failed.length ? 1 : 0;
}
