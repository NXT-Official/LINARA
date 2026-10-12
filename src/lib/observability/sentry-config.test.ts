import { describe, expect, it } from "vitest";

import {
  COLLECT_NO_PERSONAL_DATA,
  LINARA_WEB_DSN,
  resolveSentryBuildConfig,
  scrubBreadcrumb,
  scrubEvent,
  scrubLog,
  scrubSpan,
  scrubText,
  scrubUrl,
  sendHooks,
  surfaceFor,
  tagAttributes,
  tagEvent,
  userFromStorage,
} from "./sentry-config";

const WEB_DSN =
  "https://53f092679e0f92f60403893d6a97fa4e@o4512240981311488.ingest.us.sentry.io/4512241040031744";

describe("resolveSentryBuildConfig", () => {
  it("reports to linara-web from a Vercel build with nothing else set", () => {
    expect(resolveSentryBuildConfig({ VERCEL: "1" }, "production").dsn).toBe(WEB_DSN);
    expect(LINARA_WEB_DSN).toBe(WEB_DSN);
  });

  it("stays off on a developer machine and in CI, where VERCEL is unset", () => {
    expect(resolveSentryBuildConfig({}, "production").dsn).toBe("");
    expect(resolveSentryBuildConfig({ VERCEL: "0" }, "production").dsn).toBe("");
  });

  it("uses an explicit SENTRY_DSN anywhere, and SENTRY_DSN=off turns a Vercel build off", () => {
    const own = "https://key@o1.ingest.us.sentry.io/2";
    expect(resolveSentryBuildConfig({ SENTRY_DSN: own }, "production").dsn).toBe(own);
    expect(resolveSentryBuildConfig({ SENTRY_DSN: own, VERCEL: "1" }, "production").dsn).toBe(own);
    expect(resolveSentryBuildConfig({ SENTRY_DSN: "off", VERCEL: "1" }, "production").dsn).toBe("");
  });

  it("names main's deploys production and every other branch after the branch", () => {
    const env = (ref: string) =>
      resolveSentryBuildConfig({ VERCEL: "1", VERCEL_GIT_COMMIT_REF: ref }, "production")
        .environment;
    expect(env("main")).toBe("production");
    expect(env("nicoleDev")).toBe("nicoledev");
    expect(env("jamesDev")).toBe("jamesdev");
  });

  it("falls back to the vite mode off Vercel, and SENTRY_ENVIRONMENT wins over both", () => {
    expect(resolveSentryBuildConfig({}, "development").environment).toBe("development");
    expect(
      resolveSentryBuildConfig(
        { SENTRY_ENVIRONMENT: "staging", VERCEL_GIT_COMMIT_REF: "main" },
        "production",
      ).environment,
    ).toBe("staging");
  });

  it("tags the release with the deployed commit, or nothing when there isn't one", () => {
    expect(
      resolveSentryBuildConfig({ VERCEL_GIT_COMMIT_SHA: "abc123" }, "production").release,
    ).toBe("abc123");
    expect(resolveSentryBuildConfig({}, "production").release).toBe("");
  });
});

describe("scrubUrl", () => {
  it("drops the fragment, where a password-recovery link carries its tokens", () => {
    expect(
      scrubUrl("https://linara.app/reset-password#access_token=eyJhbGc.x.y&type=recovery"),
    ).toBe("https://linara.app/reset-password");
    expect(scrubUrl("/email-confirmed#error=otp_expired")).toBe("/email-confirmed");
  });

  it("keeps every query key but filters every value outside the app's own few", () => {
    expect(
      scrubUrl(
        "https://abc.supabase.co/rest/v1/tasks?select=*&household_id=eq.7d1c2a9e-1111-2222-3333-444455556666",
      ),
    ).toBe("https://abc.supabase.co/rest/v1/tasks?select=[Filtered]&household_id=[Filtered]");
    expect(scrubUrl("/auth/v1/token?grant_type=password")).toBe(
      "/auth/v1/token?grant_type=[Filtered]",
    );
    expect(scrubUrl("/manager/money?helper=3f0c")).toBe("/manager/money?helper=[Filtered]");
  });

  it("leaves the app's own search params readable (tabs, views, a day, the sign-up step)", () => {
    expect(scrubUrl("/manager/schedule?tab=leave&day=2026-10-12")).toBe(
      "/manager/schedule?tab=leave&day=2026-10-12",
    );
    expect(scrubUrl("/manager/pass?view=board")).toBe("/manager/pass?view=board");
    expect(scrubUrl("/login?mode=signup&sent=true")).toBe("/login?mode=signup&sent=true");
    expect(scrubUrl("/email-confirmed?for=helper")).toBe("/email-confirmed?for=helper");
    expect(scrubUrl("/signup?step=household")).toBe("/signup?step=household");
  });

  it("filters an allowed key whose value isn't a plain short word", () => {
    expect(scrubUrl("/manager/schedule?tab=someone%40example.com")).toBe(
      "/manager/schedule?tab=[Filtered]",
    );
    expect(scrubUrl("/manager/pass?view=" + "a".repeat(80))).toBe("/manager/pass?view=[Filtered]");
  });

  it("drops credentials written into the address", () => {
    expect(scrubUrl("https://user:secret@abc.supabase.co/rest/v1/x")).toBe(
      "https://abc.supabase.co/rest/v1/x",
    );
  });

  it("masks an email address sitting in a path", () => {
    expect(scrubUrl("/invite/someone@example.com/accept")).toBe("/invite/[email]/accept");
  });

  it("leaves a URL with nothing sensitive in it alone", () => {
    expect(scrubUrl("https://linara.app/manager/pass")).toBe("https://linara.app/manager/pass");
    expect(scrubUrl("/_app/manager/people")).toBe("/_app/manager/people");
    expect(scrubUrl("")).toBe("");
  });

  it("handles a key with no value and a stray separator", () => {
    expect(scrubUrl("/x?debug&&token=abc")).toBe("/x?debug&token=[Filtered]");
  });

  it("never throws, even on a malformed escape", () => {
    expect(scrubUrl("/x?tab=%E0%A4%A")).toBe("/x?tab=[Filtered]");
    expect(scrubUrl("/x?%E0%A4%A=1")).toBe("/x?[Filtered]=[Filtered]");
  });
});

describe("scrubText", () => {
  it("scrubs every URL inside a message", () => {
    expect(
      scrubText(
        "GET https://abc.supabase.co/rest/v1/tasks?id=eq.5 failed after https://linara.app/reset-password#access_token=t",
      ),
    ).toBe(
      "GET https://abc.supabase.co/rest/v1/tasks?id=[Filtered] failed after https://linara.app/reset-password",
    );
  });

  it("masks emails, phone numbers, tokens and bearer credentials", () => {
    expect(scrubText("No account for maria.santos@example.com")).toBe("No account for [email]");
    expect(scrubText("Payout to 09171234567 failed")).toBe("Payout to [phone] failed");
    expect(scrubText("Payout to 0917 123 4567 failed")).toBe("Payout to [phone] failed");
    expect(scrubText("Payout to +639171234567 failed")).toBe("Payout to +[phone] failed");
    expect(scrubText("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_DEF-123 expired")).toBe(
      "jwt [token] expired",
    );
    expect(scrubText("Authorization: Bearer abc.def-123")).toBe("Authorization: Bearer [token]");
  });

  it("masks a helper's push token in what Expo answered", () => {
    expect(
      scrubText(
        '{"details":{"error":"DeviceNotRegistered","expoPushToken":"ExponentPushToken[xAbC123]"}}',
      ),
    ).toBe('{"details":{"error":"DeviceNotRegistered","expoPushToken":"[Filtered]"}}');
    expect(scrubText("Not sent to ExponentPushToken[xAbC123]")).toBe(
      "Not sent to ExponentPushToken[token]",
    );
  });

  it("masks an element's label, alt or title text wherever a selector turns up", () => {
    // Web-vital spans (INP, LCP, CLS) name the element; planner and pay
    // labels carry helpers' names.
    expect(
      scrubText('body > div.planner > button.chip[aria-label="Remove Carmen Ortiz from Tuesday"]'),
    ).toBe("body > div.planner > button.chip[aria-label]");
    expect(scrubText('img[alt="Carmen Ortiz"][title="Carmen"] > span[name="helper"]')).toBe(
      "img[alt][title] > span[name]",
    );
  });

  it("masks a quoted value in an error message but keeps quoted names of tables and constraints", () => {
    expect(scrubText('invalid input syntax for type uuid: "Lorna Bautista"')).toBe(
      'invalid input syntax for type uuid: "[Filtered]"',
    );
    expect(scrubText('"failed to parse filter (eq.Lorna Bautista)" (line 1, column 4)')).toBe(
      '"[Filtered]" (line 1, column 4)',
    );
    const identifiers =
      'new row for relation "helpers" violates check constraint "helpers_wage_check" on "public.helpers"';
    expect(scrubText(identifiers)).toBe(identifiers);
  });

  it("drops the whole word the cut lands in, so half an email never goes out", () => {
    expect(scrubText(`${"x ".repeat(995)}maria.santos@gmail.com was refused`)).toBe(
      `${"x ".repeat(995)}…`,
    );
    const kept = scrubText(`${"x ".repeat(997)}word12 and more`);
    expect(kept.endsWith("word12…")).toBe(true);
    const started = performance.now();
    expect(scrubText("y".repeat(50_000))).toBe("…");
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("caps a huge string so scrubbing it can't stall the page", () => {
    for (const huge of [
      "a".repeat(50_000),
      "x.".repeat(25_000) + "@",
      "https://".repeat(6_000),
      '"'.repeat(50_000),
    ]) {
      const started = performance.now();
      const scrubbed = scrubText(huge);
      expect(performance.now() - started).toBeLessThan(50);
      expect(scrubbed.length).toBeLessThanOrEqual(2_100);
      expect(scrubbed.endsWith("…")).toBe(true);
    }
    const started = performance.now();
    scrubUrl("/x?" + "a".repeat(50_000));
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("leaves ordinary text, ids and amounts alone", () => {
    const plain =
      "Pay period 7d1c2a9e-1111-2222-3333-444455556666 closed at 6000.00 on 2026-10-12 12:30";
    expect(scrubText(plain)).toBe(plain);
  });
});

/** A Storage holding exactly these keys. */
function storageWith(values: Record<string, string>): Pick<Storage, "getItem"> {
  return { getItem: (key: string) => values[key] ?? null };
}

describe("userFromStorage", () => {
  it("is the signed-in manager's id and nothing else from storage", () => {
    // Not the household: a login that ends in needs_bootstrap leaves the
    // previous account's household id behind, so it can name the wrong one.
    expect(
      userFromStorage(
        storageWith({
          linara_manager_user_id: "0b6f5f7e-aaaa-bbbb-cccc-000000000001",
          linara_manager_household_id: "7d1c2a9e-aaaa-bbbb-cccc-000000000002",
          linara_manager_token: "eyJhbGciOiJIUzI1NiJ9.x.y",
        }),
      ),
    ).toEqual({ id: "0b6f5f7e-aaaa-bbbb-cccc-000000000001" });
  });

  it("is nobody when signed out or the key is blank", () => {
    expect(userFromStorage(storageWith({}))).toEqual({ id: null });
    expect(
      userFromStorage(
        storageWith({ linara_manager_user_id: "  ", linara_manager_household_id: "h-1" }),
      ),
    ).toEqual({ id: null });
    expect(userFromStorage(null)).toEqual({ id: null });
  });

  it("is nobody, not an exception, when the browser refuses storage", () => {
    const refusing: Pick<Storage, "getItem"> = {
      getItem: () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    };
    expect(userFromStorage(refusing)).toEqual({ id: null });
  });
});

describe("surfaceFor", () => {
  it("tells LINARA_MOBILE's WebView apart from a browser by its user agent", () => {
    expect(
      surfaceFor(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129 Mobile LinaraApp",
      ),
    ).toBe("mobile-webview");
    expect(surfaceFor("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1")).toBe("web");
    expect(surfaceFor(undefined)).toBe("web");
  });
});

describe("COLLECT_NO_PERSONAL_DATA", () => {
  it("turns off every category Sentry would otherwise collect from people", () => {
    // Unset, Sentry v11 collects all of these, IP-based user info included.
    expect(COLLECT_NO_PERSONAL_DATA).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    });
  });
});

describe("scrubEvent", () => {
  it("keeps the page address but drops its query values, fragment, headers, cookies and body", () => {
    const event = {
      request: {
        url: "https://linara.app/reset-password?email=a%40b.co#access_token=t",
        query_string: "email=a%40b.co",
        headers: { "User-Agent": "Mozilla/5.0", Referer: "https://linara.app/login" },
        cookies: { sb: "secret" },
        data: { password: "hunter2" },
        env: { REMOTE_ADDR: "203.0.113.9" },
        method: "GET",
      },
    };
    scrubEvent(event);
    expect(event.request).toEqual({
      url: "https://linara.app/reset-password?email=[Filtered]",
      method: "GET",
    });
  });

  it("scrubs the message, the exception text and the transaction name", () => {
    const event = {
      message: "Invite to maria@example.com failed",
      transaction: "/reset-password#access_token=t",
      exception: {
        values: [
          { type: "Error", value: "fetch https://abc.supabase.co/rest/v1/x?id=eq.9 failed" },
          { type: "TypeError" },
        ],
      },
    };
    scrubEvent(event);
    expect(event.message).toBe("Invite to [email] failed");
    expect(event.transaction).toBe("/reset-password");
    expect(event.exception.values).toEqual([
      { type: "Error", value: "fetch https://abc.supabase.co/rest/v1/x?id=[Filtered] failed" },
      { type: "TypeError" },
    ]);
  });

  it("keeps nothing about the user but the id", () => {
    const event = {
      user: { id: "u-1", email: "maria@example.com", ip_address: "203.0.113.9", username: "Maria" },
    };
    scrubEvent(event);
    expect(event.user).toEqual({ id: "u-1" });

    const anonymous: { user?: { id?: string; ip_address?: string } } = {
      user: { ip_address: "203.0.113.9" },
    };
    scrubEvent(anonymous);
    expect(anonymous.user).toBeUndefined();
  });

  it("drops `extra`, where a thrown plain object arrives whole", () => {
    // Reviewer's probe: `throw { code, details }` from a failed insert.
    const event = {
      exception: { values: [{ value: "Object captured as exception with keys: code, details" }] },
      extra: {
        __serialized__: {
          code: "23514",
          details: "Failing row contains (Rosa Reyes, 34-7654321-0)",
        },
        arguments: [],
      },
    };
    scrubEvent(event);
    expect(event).toEqual({
      exception: { values: [{ value: "Object captured as exception with keys: code, details" }] },
    });
  });

  it("scrubs the breadcrumbs it carries", () => {
    const event = {
      breadcrumbs: [
        { category: "navigation", data: { from: "/login#x", to: "/manager?helper=7" } },
      ],
    };
    scrubEvent(event);
    expect(event.breadcrumbs[0]?.data).toEqual({
      from: "/login",
      to: "/manager?helper=[Filtered]",
    });
  });
});

describe("scrubBreadcrumb", () => {
  it("scrubs a fetch breadcrumb's address and leaves its status alone", () => {
    const crumb = {
      category: "fetch",
      data: {
        method: "GET",
        url: "https://abc.supabase.co/rest/v1/payslips?helper_id=eq.42&select=*",
        status_code: 200,
      },
    };
    scrubBreadcrumb(crumb);
    expect(crumb.data).toEqual({
      method: "GET",
      url: "https://abc.supabase.co/rest/v1/payslips?helper_id=[Filtered]&select=[Filtered]",
      status_code: 200,
    });
  });

  it("scrubs a navigation breadcrumb, including the recovery link's fragment", () => {
    const crumb = {
      category: "navigation",
      data: { from: "/reset-password#access_token=t&type=recovery", to: "/manager/pass?view=line" },
    };
    scrubBreadcrumb(crumb);
    expect(crumb.data).toEqual({ from: "/reset-password", to: "/manager/pass?view=line" });
  });

  it("keeps a console breadcrumb's own text and an error's message, never the values logged", () => {
    // Reviewer's probe: names, gov ID numbers and a wage in what was logged.
    const crumb: {
      category: string;
      level: string;
      message?: string;
      data: Record<string, unknown>;
    } = {
      category: "console",
      level: "error",
      message: "[useX] Failed to add helper: [object Object] Maria Santos 34-1234567-8",
      data: {
        arguments: [
          "[useX] Failed to add helper:",
          {
            message: "violates check",
            details: "Failing row contains (Maria Santos, 34-1234567-8, 6000.00)",
          },
          "Maria Santos",
          new TypeError("Failed to fetch"),
        ],
        logger: "console",
      },
    };
    scrubBreadcrumb(crumb);
    expect(crumb).toEqual({
      category: "console",
      level: "error",
      message: "[useX] Failed to add helper: violates check {} TypeError: Failed to fetch",
      data: { logger: "console" },
    });
  });

  it("keeps nothing of a console breadcrumb that starts with an object", () => {
    const crumb: { category: string; message?: string; data: Record<string, unknown> } = {
      category: "console",
      message: "[object Object] note",
      data: {
        arguments: [{ helperName: "Juana Dela Cruz", wage: 6000 }, "note"],
        logger: "console",
      },
    };
    scrubBreadcrumb(crumb);
    expect(crumb).toEqual({ category: "console", message: "{} {}", data: { logger: "console" } });
  });

  it("leaves a console breadcrumb it already rebuilt as it is", () => {
    const crumb = { category: "console", message: "[x] failed: TypeError: Failed to fetch" };
    scrubBreadcrumb(crumb);
    expect(crumb.message).toBe("[x] failed: TypeError: Failed to fetch");
  });

  it("keeps which element was clicked but not the label, title or alt text naming a person", () => {
    const crumb = {
      category: "ui.click",
      message:
        'div.card > button.rounded-md[aria-label="Remove Maria Santos"] > img[alt="Maria Santos"][title="Maria"]',
    };
    scrubBreadcrumb(crumb);
    expect(crumb.message).toBe("div.card > button.rounded-md[aria-label] > img[alt][title]");
  });
});

describe("scrubSpan", () => {
  it("scrubs an outgoing request's name and address attributes", () => {
    const span = {
      name: "GET https://abc.supabase.co/rest/v1/tasks?household_id=eq.7",
      attributes: {
        "sentry.op": "http.client",
        "url.full": "https://abc.supabase.co/rest/v1/tasks?household_id=eq.7",
        "http.url": "https://abc.supabase.co/rest/v1/tasks?household_id=eq.7",
        "http.query": "?household_id=eq.7",
        "url.query": "household_id=eq.7&select=*",
        "http.fragment": "#access_token=t",
        "url.fragment": "access_token=t&type=recovery",
        "http.response.status_code": 200,
      },
    };
    scrubSpan(span);
    expect(span.name).toBe("GET https://abc.supabase.co/rest/v1/tasks?household_id=[Filtered]");
    expect(span.attributes).toEqual({
      "sentry.op": "http.client",
      "url.full": "https://abc.supabase.co/rest/v1/tasks?household_id=[Filtered]",
      "http.url": "https://abc.supabase.co/rest/v1/tasks?household_id=[Filtered]",
      "http.query": "?household_id=[Filtered]",
      "url.query": "household_id=[Filtered]&select=[Filtered]",
      "http.response.status_code": 200,
    });
  });

  it("drops request and response header attributes, the referer included", () => {
    const span = {
      name: "/_app/manager/pass",
      attributes: {
        "url.template": "/_app/manager/pass",
        "http.request.header.referer": ["https://linara.app/login?mode=signup"],
        "http.response.header.set-cookie": ["sb=secret"],
      },
    };
    scrubSpan(span);
    expect(span.attributes).toEqual({ "url.template": "/_app/manager/pass" });
  });

  it("scrubs an attribute given in Sentry's { value } form", () => {
    const span = {
      name: "pageload",
      attributes: { "url.full": { value: "https://linara.app/login#access_token=t" } },
    };
    scrubSpan(span);
    expect(span.attributes).toEqual({ "url.full": { value: "https://linara.app/login" } });
  });
});

describe("scrubLog", () => {
  it("scrubs the log line and every attribute that could carry an address or contact detail", () => {
    const log = {
      level: "error",
      message: "Payout to 09171234567 failed: https://api.xendit.co/payouts?ref=abc",
      attributes: {
        "linara.route": "/_app/manager/money",
        "url.full": "https://linara.app/manager/money?helper=7#x",
        "sentry.message.parameter.0": "maria@example.com",
        "linara.attempt": 2,
      },
    };
    scrubLog(log);
    expect(log.message).toBe(
      "Payout to [phone] failed: https://api.xendit.co/payouts?ref=[Filtered]",
    );
    expect(log.attributes).toEqual({
      "linara.route": "/_app/manager/money",
      "url.full": "https://linara.app/manager/money?helper=[Filtered]",
      "sentry.message.parameter.0": "[email]",
      "linara.attempt": 2,
    });
  });

  // The console integration's own attributes, as beforeSendLog receives them.
  const CONSOLE_BASE = {
    "sentry.origin": "auto.log.console",
    "sentry.environment": "production",
    "sentry.sdk.name": "sentry.javascript.tanstackstart-react",
  };

  it("rebuilds a console log from its template, keeping an error's message but not its details", () => {
    // Reviewer's probe: console.error("[useX] Failed to add helper:", { message, details }).
    const log = {
      level: "error",
      message:
        '[useX] Failed to add helper: {"message":"violates check","details":"Failing row contains (Maria Santos, 34-1234567-8, 6000.00)"}',
      attributes: {
        ...CONSOLE_BASE,
        "sentry.message.template": "[useX] Failed to add helper: {}",
        "sentry.message.parameter.0": {
          message: "violates check",
          details: "Failing row contains (Maria Santos, 34-1234567-8, 6000.00)",
        },
      },
    };
    scrubLog(log);
    expect(log).toEqual({
      level: "error",
      message: "[useX] Failed to add helper: violates check",
      attributes: { ...CONSOLE_BASE, "sentry.message.template": "[useX] Failed to add helper: {}" },
    });
  });

  it("reads a parameter that is already JSON text the same way", () => {
    const log = {
      message: "x",
      attributes: {
        ...CONSOLE_BASE,
        "sentry.message.template": "[push] Push not sent: {} {}",
        "sentry.message.parameter.0":
          '{"name":"TypeError","message":"Failed to fetch","stack":"…"}',
        "sentry.message.parameter.1": "Maria Santos",
      },
    };
    scrubLog(log);
    expect(log.message).toBe("[push] Push not sent: TypeError: Failed to fetch {}");
  });

  it("keeps none of an object logged first: its keys were copied in as attributes", () => {
    // Reviewer's probe: console.warn({ helperName, wage }, "note").
    const log = {
      level: "warn",
      message: '{"helperName":"Juana Dela Cruz","wage":6000} note',
      attributes: { ...CONSOLE_BASE, helperName: "Juana Dela Cruz", wage: 6000 },
    };
    scrubLog(log);
    expect(log).toEqual({ level: "warn", message: "{}", attributes: CONSOLE_BASE });
  });

  it("keeps the name and message of an error logged on its own", () => {
    const log = {
      message:
        '{"message":"supabaseUrl is required.","name":"Error","stack":"Error: supabaseUrl is required.\\n    at x"}',
      attributes: { ...CONSOLE_BASE },
    };
    scrubLog(log);
    expect(log.message).toBe("Error: supabaseUrl is required.");
  });

  it("keeps a single line of text the app wrote, scrubbed", () => {
    const log = {
      message: "[landing] Sanity unreachable for maria@example.com; serving fallback copy.",
      attributes: { ...CONSOLE_BASE },
    };
    scrubLog(log);
    expect(log.message).toBe("[landing] Sanity unreachable for [email]; serving fallback copy.");
  });

  it("keeps Sentry's typed { value } form when checking where a log came from", () => {
    const log = {
      message: '{"helperName":"Juana Dela Cruz"}',
      attributes: { "sentry.origin": { value: "auto.log.console" }, helperName: "Juana Dela Cruz" },
    };
    scrubLog(log);
    expect(log).toEqual({
      message: "{}",
      attributes: { "sentry.origin": { value: "auto.log.console" } },
    });
  });
});

describe("tagEvent", () => {
  it("puts the signed-in manager's id on the event and the surface in its tags", () => {
    const event: { user?: { id?: string }; tags?: Record<string, unknown> } = {
      tags: { existing: "kept" },
    };
    tagEvent(event, { id: "u-1" }, "mobile-webview");
    expect(event.user).toEqual({ id: "u-1" });
    expect(event.tags).toEqual({ existing: "kept", "linara.surface": "mobile-webview" });
  });

  it("leaves the user off when nobody is signed in, and still says where it came from", () => {
    const event: { user?: { id?: string }; tags?: Record<string, unknown> } = {
      user: { id: "stale" },
    };
    tagEvent(event, { id: null }, "web");
    expect(event.user).toBeUndefined();
    expect(event.tags).toEqual({ "linara.surface": "web" });
  });
});

describe("tagAttributes", () => {
  it("adds the manager's id and the surface as log or span attributes", () => {
    const log: { attributes?: Record<string, unknown> } = { attributes: { "linara.route": "/" } };
    tagAttributes(log, { id: "u-1" }, "web");
    expect(log.attributes).toEqual({
      "linara.route": "/",
      "user.id": "u-1",
      "linara.surface": "web",
    });

    const anonymous: { attributes?: Record<string, unknown> } = {};
    tagAttributes(anonymous, { id: null }, "mobile-webview");
    expect(anonymous.attributes).toEqual({ "linara.surface": "mobile-webview" });
  });
});

describe("web-vital spans", () => {
  it("never send the label of the element they measured", () => {
    const span = {
      name: 'body > div > button[aria-label="Remove Carmen Ortiz"]',
      attributes: {
        "sentry.op": "ui.interaction.click",
        "inp.element": 'body > div > button[aria-label="Remove Carmen Ortiz"]',
        "lcp.element": 'body > img[alt="Carmen Ortiz"]',
        "cls.source.1": 'body > div[title="Carmen Ortiz"]',
      },
    };
    scrubSpan(span);
    expect(span).toEqual({
      name: "body > div > button[aria-label]",
      attributes: {
        "sentry.op": "ui.interaction.click",
        "inp.element": "body > div > button[aria-label]",
        "lcp.element": "body > img[alt]",
        "cls.source.1": "body > div[title]",
      },
    });
  });
});

describe("console lines with printf tokens", () => {
  // Sentry builds no template when the first argument has a %s/%o token,
  // and the line is every argument joined. Reviewer's exact call:
  // console.error("Insert failed: %o", { details: "Failing row contains (Carmen Ortiz, 34-1111111-1)" })
  const details = { details: "Failing row contains (Carmen Ortiz, 34-1111111-1)" };

  it("keep only the text before the first token, as a breadcrumb", () => {
    const crumb: { category: string; message?: string; data: Record<string, unknown> } = {
      category: "console",
      message: "Insert failed: %o [object Object]",
      data: { arguments: ["Insert failed: %o", details], logger: "console" },
    };
    scrubBreadcrumb(crumb);
    expect(crumb).toEqual({
      category: "console",
      message: "Insert failed: {}",
      data: { logger: "console" },
    });
  });

  it("keep only the text before the first token, as a log", () => {
    const log = {
      level: "error",
      message: `Insert failed: %o ${JSON.stringify(details)}`,
      attributes: { "sentry.origin": "auto.log.console" },
    };
    scrubLog(log);
    expect(log.message).toBe("Insert failed: {}");
  });
});

describe("sendHooks", () => {
  const tagging = () => ({ identity: { id: "u-1" }, surface: "web" as const });

  it("scrubs and tags what each hook is given", () => {
    const hooks = sendHooks(tagging);
    expect(hooks.beforeSend({ message: "for maria@example.com" })).toEqual({
      message: "for [email]",
      user: { id: "u-1" },
      tags: { "linara.surface": "web" },
    });
    expect(hooks.beforeSendLog({ message: "x", attributes: {} })?.attributes).toEqual({
      "user.id": "u-1",
      "linara.surface": "web",
    });
    expect(hooks.beforeBreadcrumb({ category: "navigation", data: { to: "/x#t" } })).toEqual({
      category: "navigation",
      data: { to: "/x" },
    });
    // The server has nobody signed in to tag.
    expect(sendHooks().beforeSend({ message: "m" })).toEqual({ message: "m" });
  });

  // An object whose reading throws, the way a broken scrub would.
  const throwing = () => {
    const bag: Record<string, unknown> = {};
    Object.defineProperty(bag, "boom", {
      enumerable: true,
      get: () => {
        throw new Error("scrubbing failed");
      },
    });
    return bag;
  };

  it("drops an error, log or breadcrumb it couldn't scrub instead of sending it raw", () => {
    const hooks = sendHooks(tagging);
    expect(
      hooks.beforeSend({
        request: { url: "/r#access_token=t" },
        breadcrumbs: [{ data: throwing() }],
      }),
    ).toBeNull();
    expect(hooks.beforeSendLog({ message: "m", attributes: throwing() })).toBeNull();
    expect(hooks.beforeBreadcrumb({ category: "fetch", data: throwing() })).toBeNull();
  });

  it("drops a tagging failure the same way", () => {
    const hooks = sendHooks(() => {
      throw new Error("storage gone");
    });
    expect(hooks.beforeSend({ message: "m" })).toBeNull();
  });

  it("blanks a span it couldn't scrub: Sentry would send the original if it threw", () => {
    const span = {
      trace_id: "t1",
      span_id: "s1",
      name: 'button[aria-label="Remove Carmen Ortiz"]',
      start_timestamp: 1,
      status: "ok",
      is_segment: true,
      attributes: throwing(),
      links: [{ attributes: { note: "Carmen Ortiz" } }],
    };
    expect(sendHooks(tagging).beforeSendSpan(span)).toEqual({
      trace_id: "t1",
      span_id: "s1",
      name: "[Filtered]",
      start_timestamp: 1,
      status: "ok",
      is_segment: true,
      attributes: {},
    });
  });
});
