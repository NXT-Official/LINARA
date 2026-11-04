import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleEasWebhook, type RelayConfig } from "./handler.ts";

// Signed the way Expo's example server does (docs.expo.dev/eas/webhooks),
// independently of handler.ts.
const SECRET = "test-secret-at-least-16";
const sign = (body: string, secret = SECRET) =>
  "sha1=" + createHmac("sha1", secret).update(body, "utf8").digest("hex");

const config: RelayConfig = {
  secret: SECRET,
  appsScriptUrl: "https://script.google.com/macros/s/abc/exec",
  appsScriptToken: "apps-token",
  profiles: ["preview"],
  timeoutMs: 200,
};

const build = (over: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({
  id: "147a3212-49fd-446f-b4e3-a6519acf264a",
  buildDetailsPageUrl:
    "https://expo.dev/accounts/naaxtechs-team/projects/linara-mobile/builds/147a3212",
  platform: "android",
  status: "finished",
  artifacts: { buildUrl: "https://expo.dev/artifacts/eas/abc.apk" },
  metadata: {
    buildProfile: "preview",
    appVersion: "1.0.2",
    appBuildVersion: "12",
    gitCommitHash: "564b61ebdd403d28b5dc616a12ce160b91585b5b",
    gitCommitMessage: "Add home screen",
    ...meta,
  },
  completedAt: "2026-11-04T06:15:00.000Z",
  ...over,
});

function post(
  body: string,
  signature: string | null = sign(body),
  headers: Record<string, string> = {},
) {
  const h: Record<string, string> = { "Content-Type": "application/json", ...headers };
  if (signature !== null) h["expo-signature"] = signature;
  return new Request("https://fn.example/eas-build-webhook", { method: "POST", body, headers: h });
}

const okFetch = (reply: unknown = { ok: true, duplicate: false }, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(reply), { status }));

function forwarded(fetchFn: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) };
}

describe("eas-build-webhook: who may call", () => {
  it("rejects non-POST without forwarding", async () => {
    const f = okFetch();
    const res = await handleEasWebhook(
      new Request("https://fn.example", { method: "GET" }),
      config,
      f,
    );
    expect(res.status).toBe(405);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses to run unconfigured instead of forwarding unsigned data", async () => {
    const body = JSON.stringify(build());
    for (const missing of ["secret", "appsScriptUrl", "appsScriptToken"] as const) {
      const f = okFetch();
      const res = await handleEasWebhook(post(body), { ...config, [missing]: "" }, f);
      expect(res.status).toBe(500);
      expect(f).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["no signature header", null],
    ["empty signature", ""],
    ["signed with another secret", sign(JSON.stringify(build()), "someone-elses-secret")],
    ["wrong length", "sha1=abc"],
    ["sha256 prefix", "sha256=" + "0".repeat(40)],
    ["garbage", "not a signature at all"],
  ])("401 and no forward for %s", async (_name, sig) => {
    const f = okFetch();
    const res = await handleEasWebhook(post(JSON.stringify(build()), sig), config, f);
    expect(res.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects a body changed after signing", async () => {
    const original = JSON.stringify(build());
    const tampered = JSON.stringify(build({ buildDetailsPageUrl: "https://expo.dev/evil" }));
    const f = okFetch();
    const res = await handleEasWebhook(post(tampered, sign(original)), config, f);
    expect(res.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("accepts the bare-hex and uppercase forms of a valid signature", async () => {
    const body = JSON.stringify(build());
    for (const sig of [sign(body).slice(5), sign(body).toUpperCase(), ` ${sign(body)} `]) {
      const f = okFetch();
      const res = await handleEasWebhook(post(body, sig), config, f);
      expect(res.status).toBe(200);
      expect(f).toHaveBeenCalledOnce();
    }
  });

  it("verifies non-ASCII bodies byte-for-byte (UTF-8)", async () => {
    const body = JSON.stringify(build({}, { gitCommitMessage: "Ayusin ang ñ at 日本語 😀" }));
    const f = okFetch();
    const res = await handleEasWebhook(post(body), config, f);
    expect(res.status).toBe(200);
    expect(forwarded(f).body.build.gitCommitMessage).toBe("Ayusin ang ñ at 日本語 😀");
  });

  it("413 for oversized bodies, by header or by actual size", async () => {
    const f = okFetch();
    const big = JSON.stringify(build({ junk: "x".repeat(300 * 1024) }));
    expect((await handleEasWebhook(post(big), config, f)).status).toBe(413);
    const lying = post(JSON.stringify(build()), undefined, {
      "content-length": String(10 * 1024 * 1024),
    });
    expect((await handleEasWebhook(lying, config, f)).status).toBe(413);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("eas-build-webhook: what gets forwarded", () => {
  it.each([
    ["not JSON", "{oops"],
    ["a JSON array", "[1,2]"],
    ["JSON null", "null"],
    ["no id", JSON.stringify({ ...build(), id: undefined })],
    ["numeric id", JSON.stringify(build({ id: 12345678 }))],
    ["id with markup", JSON.stringify(build({ id: "<script>alert(1)</script>" }))],
  ])("400 and no forward when the signed body is %s", async (_name, body) => {
    const f = okFetch();
    const res = await handleEasWebhook(post(body), config, f);
    expect(res.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it.each(["production", "development", "", undefined])(
    "acks but does not log the %s profile",
    async (profile) => {
      const f = okFetch();
      const res = await handleEasWebhook(
        post(JSON.stringify(build({}, { buildProfile: profile }))),
        config,
        f,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).ignored).toBe("profile");
      expect(f).not.toHaveBeenCalled();
    },
  );

  it("forwards a finished preview build with the token and the install links", async () => {
    const f = okFetch();
    const res = await handleEasWebhook(post(JSON.stringify(build())), config, f);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, logged: build().id, duplicate: false });
    const { url, init, body } = forwarded(f);
    expect(url).toBe(config.appsScriptUrl);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("follow");
    expect(body).toEqual({
      token: "apps-token",
      build: {
        id: build().id,
        platform: "android",
        status: "finished",
        profile: "preview",
        appVersion: "1.0.2",
        appBuildVersion: "12",
        gitCommitHash: "564b61ebdd403d28b5dc616a12ce160b91585b5b",
        gitCommitMessage: "Add home screen",
        detailsUrl: build().buildDetailsPageUrl,
        buildUrl: "https://expo.dev/artifacts/eas/abc.apk",
        errorMessage: "",
        completedAt: "2026-11-04T06:15:00.000Z",
      },
    });
    // The signing secret never leaves the function.
    expect(String(init.body)).not.toContain(SECRET);
  });

  it("logs a failed build with its error and no download link", async () => {
    const f = okFetch();
    const body = JSON.stringify(
      build({ status: "errored", error: { message: "Gradle failed", errorCode: "X" } }),
    );
    expect((await handleEasWebhook(post(body), config, f)).status).toBe(200);
    const sent = forwarded(f).body.build;
    expect(sent.status).toBe("errored");
    expect(sent.errorMessage).toBe("Gradle failed");
    expect(sent.buildUrl).toBe("");
  });

  it.each([
    "javascript:alert(1)",
    "http://expo.dev/artifacts/eas/abc.apk",
    "https://evil.example/expo.dev/abc.apk",
    "https://expo.dev.evil.example/abc.apk",
    "https://notexpo.dev/abc.apk",
    "not a url",
    42,
  ])("drops a non-Expo link: %s", async (link) => {
    const f = okFetch();
    const body = JSON.stringify(
      build({ buildDetailsPageUrl: link, artifacts: { buildUrl: link } }),
    );
    expect((await handleEasWebhook(post(body), config, f)).status).toBe(200);
    const sent = forwarded(f).body.build;
    expect(sent.detailsUrl).toBe("");
    expect(sent.buildUrl).toBe("");
  });

  it("caps very long text fields", async () => {
    const f = okFetch();
    const body = JSON.stringify(build({}, { gitCommitMessage: "a".repeat(5000) }));
    await handleEasWebhook(post(body), config, f);
    expect(forwarded(f).body.build.gitCommitMessage).toHaveLength(500);
  });

  it("tolerates wrong-typed nested fields instead of crashing", async () => {
    const f = okFetch();
    const body = JSON.stringify({ id: build().id, metadata: "preview", artifacts: [], error: 5 });
    const res = await handleEasWebhook(post(body), { ...config, profiles: [""] }, f);
    expect(res.status).toBe(200);
    expect(forwarded(f).body.build.profile).toBe("");
  });
});

describe("eas-build-webhook: when the Doc side fails, EAS must retry (502)", () => {
  const body = JSON.stringify(build());

  it("network error", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await handleEasWebhook(post(body), config, f)).status).toBe(502);
  });

  it("Apps Script hangs past the timeout", async () => {
    const f = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const started = Date.now();
    expect((await handleEasWebhook(post(body), { ...config, timeoutMs: 50 }, f)).status).toBe(502);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("200 with an HTML error page (web app not shared with Anyone)", async () => {
    const f = vi.fn(
      async () => new Response("<html>Sorry, unable to open the file</html>", { status: 200 }),
    );
    expect((await handleEasWebhook(post(body), config, f)).status).toBe(502);
  });

  it("Code.gs says no (bad token, DOC_ID unset)", async () => {
    expect(
      (await handleEasWebhook(post(body), config, okFetch({ ok: false, error: "Unauthorized" })))
        .status,
    ).toBe(502);
  });

  it("ok:true but an HTTP error status", async () => {
    expect((await handleEasWebhook(post(body), config, okFetch({ ok: true }, 500))).status).toBe(
      502,
    );
  });

  it("truthy but not true ok", async () => {
    expect((await handleEasWebhook(post(body), config, okFetch({ ok: "yes" }))).status).toBe(502);
  });

  it("a retry Code.gs already wrote is a 200, not a second entry", async () => {
    const res = await handleEasWebhook(post(body), config, okFetch({ ok: true, duplicate: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
  });
});
