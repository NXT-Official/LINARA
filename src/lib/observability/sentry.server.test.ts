import { afterEach, describe, expect, it, vi } from "vitest";

// The SDK is the one thing replaced: what's under test is what the server
// hands it and that a failed send can't break a response.
const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
  consoleLoggingIntegration: vi.fn(() => ({ name: "ConsoleLogs" })),
}));
vi.mock("@sentry/tanstackstart-react", () => sentry);

const DSN = "https://key@o1.ingest.us.sentry.io/2";

async function load({ prod = true, dsn = DSN }: { prod?: boolean; dsn?: string } = {}) {
  vi.resetModules();
  vi.stubEnv("PROD", prod);
  vi.stubEnv("SENTRY_DSN", dsn);
  return import("./sentry.server");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("sentry.server", () => {
  it("starts on import in a production build with a DSN", async () => {
    await load();
    expect(sentry.init).toHaveBeenCalledTimes(1);
  });

  it("never starts, or reports, under vite dev, a test run or without a DSN", async () => {
    const dev = await load({ prod: false });
    await dev.captureServerError(new Error("boom"));
    const noDsn = await load({ dsn: "" });
    await noDsn.captureServerError(new Error("boom"));
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports the error and waits for it to be sent before the 500 page goes out", async () => {
    const { captureServerError } = await load();
    const error = new Error("supabaseUrl is required.");
    let sent = false;
    sentry.flush.mockImplementationOnce(async () => {
      sent = true;
      return true;
    });
    await captureServerError(error);
    expect(sentry.captureException).toHaveBeenCalledWith(error);
    expect(sentry.flush).toHaveBeenCalledWith(2000);
    expect(sent).toBe(true);
  });

  it("never throws, even when Sentry does", async () => {
    const { captureServerError } = await load();
    sentry.flush.mockRejectedValueOnce(new Error("network down"));
    await expect(captureServerError(new Error("boom"))).resolves.toBeUndefined();
    sentry.captureException.mockImplementationOnce(() => {
      throw new Error("not initialised");
    });
    await expect(captureServerError(new Error("boom"))).resolves.toBeUndefined();
  });

  it("scrubs what the server sends: no headers, cookies, body or query values", async () => {
    await load();
    const { beforeSend } = sentry.init.mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(
      beforeSend({
        request: {
          url: "https://linara.app/manager/money?helper=7",
          headers: { cookie: "sb=secret" },
          cookies: { sb: "secret" },
          data: '{"wage":6000}',
        },
      }),
    ).toEqual({ request: { url: "https://linara.app/manager/money?helper=[Filtered]" } });
  });
});
