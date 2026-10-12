import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guards on the three places Sentry is hooked in. Each hook is one line in a
// file that is otherwise about something else, and losing it fails nothing:
// errors just quietly stop arriving.
const source = (file: string) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** The statements in `code`, comments removed, so a commented-out hook doesn't count. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Sentry wiring", () => {
  it("router.tsx starts browser reporting and reports what route error components catch", () => {
    const router = code(source("router.tsx"));
    expect(router).toMatch(/createClientOnlyFn\(initClientSentry\)/);
    expect(router).toMatch(/createClientOnlyFn\(reportCaughtError\)/);
    expect(router).toMatch(/defaultOnCatch:[\s\S]*?reportToSentry\(error\)/);
    expect(router).toMatch(/if \(!router\.isServer\) startSentry\(router\)/);
  });

  it("server.ts starts server reporting before anything else and reports both 500 paths", () => {
    const server = code(source("server.ts"));
    const firstImport = server.match(/^import .*$/m)?.[0];
    expect(firstImport).toBe(
      'import { captureServerError } from "./lib/observability/sentry.server";',
    );
    // h3's swallowed error, then the entry's own catch.
    expect(server).toMatch(
      /const error = consumeLastCapturedError\(\)[^\n]*\n\s*console\.error\(error\);\s*await captureServerError\(error\);/,
    );
    expect(server).toMatch(
      /catch \(error\) \{\s*console\.error\(error\);\s*await captureServerError\(error\);/,
    );
  });

  it("start.ts reports the errors its middleware turns into a page, never a redirect", () => {
    const start = code(source("start.ts"));
    expect(start).toMatch(
      /"statusCode" in error\) \{\s*throw error;\s*\}[\s\S]*?await captureServerError\(error\);[\s\S]*?renderErrorPage/,
    );
  });
});
