import { notFound, redirect } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LANDING_FALLBACK,
  type LandingContent,
  type LandingReply,
  type LandingSource,
} from "@/features/landing/landing-content";
import { createLandingRouteLoader } from "@/features/landing/landing-loader";
import { Route } from "@/routes/index";

// The real server function never loads here; each test says what it does.
const getLandingContent = vi.hoisted(() => vi.fn<() => Promise<LandingReply>>());
vi.mock("@/features/landing/landing.actions", () => ({ getLandingContent }));

// Failed loads log; the tests that care read these spies.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  getLandingContent.mockReset();
  vi.restoreAllMocks();
});

const STUDIO: LandingContent = {
  ...LANDING_FALLBACK,
  hero: { ...LANDING_FALLBACK.hero, kicker: "From Studio" },
  account: {
    hidden: true,
    badge: "",
    heading: "",
    body: "",
    complianceTitle: "",
    complianceBody: "",
  },
};
const STUDIO_LATER: LandingContent = {
  ...STUDIO,
  hero: { ...STUDIO.hero, kicker: "Published later" },
};
/**
 * The checked-in copy as a server sends it. Its own object, and told apart
 * from this bundle's LANDING_FALLBACK, so a test sees which one was served.
 */
const SERVER_FALLBACK: LandingContent = {
  ...LANDING_FALLBACK,
  hero: { ...LANDING_FALLBACK.hero, kicker: "Checked in on the server" },
};

/** What the server function answers with. */
const reply = (content: LandingContent, source: LandingSource = "studio"): LandingReply => ({
  content,
  source,
});

// What a browser's fetch rejects with when the network is gone.
const offline = async (): Promise<LandingReply> => {
  throw new TypeError("Failed to fetch");
};

/** A fetch that answers each call with the next outcome on the list. */
function answers(...outcomes: Array<LandingReply | Error>) {
  const fetchContent = vi.fn<() => Promise<LandingReply>>();
  for (const outcome of outcomes) {
    if (outcome instanceof Error) fetchContent.mockRejectedValueOnce(outcome);
    else fetchContent.mockResolvedValueOnce(outcome);
  }
  return fetchContent;
}

describe.each([true, false])("createLandingRouteLoader (browser: %s)", (browser) => {
  it("resolves with the fetched content", async () => {
    const landing = createLandingRouteLoader({ browser, fetchContent: async () => reply(STUDIO) });
    await expect(landing.load()).resolves.toBe(STUDIO);
  });

  it("with nothing to fall back on, a failed load serves the checked-in copy", async () => {
    const landing = createLandingRouteLoader({ browser, fetchContent: offline });
    await expect(landing.load()).resolves.toEqual(LANDING_FALLBACK);
  });

  it("re-throws a redirect untouched, for the router to follow", async () => {
    const signal = redirect({ to: "/login" });
    const redirects = async (): Promise<LandingReply> => {
      throw signal;
    };
    const landing = createLandingRouteLoader({ browser, fetchContent: redirects });
    await expect(landing.load()).rejects.toBe(signal);
    expect(landing.shouldReload()).toBeUndefined();
  });

  it("re-throws a not-found untouched, for the router to render", async () => {
    const signal = notFound();
    const missing = async (): Promise<LandingReply> => {
      throw signal;
    };
    const landing = createLandingRouteLoader({ browser, fetchContent: missing });
    await expect(landing.load()).rejects.toBe(signal);
    expect(landing.shouldReload()).toBeUndefined();
  });

  it("calls the server function unless handed another fetch", async () => {
    getLandingContent.mockResolvedValueOnce(reply(STUDIO));
    await expect(createLandingRouteLoader({ browser }).load()).resolves.toBe(STUDIO);
  });
});

describe("createLandingRouteLoader in a browser", () => {
  it("serves the copy the page was server-rendered with when a later load fails", async () => {
    const landing = createLandingRouteLoader({ browser: true, fetchContent: offline });
    landing.seed(STUDIO);
    await expect(landing.load()).resolves.toEqual(STUDIO);
  });

  it("replaces what it remembers with every successful load", async () => {
    const fetchContent = answers(reply(STUDIO_LATER), new TypeError("Failed to fetch"));
    const landing = createLandingRouteLoader({ browser: true, fetchContent });
    landing.seed(STUDIO);
    await expect(landing.load()).resolves.toBe(STUDIO_LATER);
    await expect(landing.load()).resolves.toEqual(STUDIO_LATER);
  });

  it("remembers a successful load without any seed", async () => {
    const fetchContent = answers(reply(STUDIO), new TypeError("Failed to fetch"));
    const landing = createLandingRouteLoader({ browser: true, fetchContent });
    await landing.load();
    await expect(landing.load()).resolves.toEqual(STUDIO);
  });

  it("is seeded only by the server-rendered copy, before it loads anything itself", async () => {
    const landing = createLandingRouteLoader({ browser: true, fetchContent: offline });
    // The visitor landed elsewhere and the first load of `/` failed: the page
    // now shows the checked-in copy, and seeding with it changes nothing.
    await landing.load();
    landing.seed(STUDIO);
    await expect(landing.load()).resolves.toEqual(LANDING_FALLBACK);
  });

  it("does not count a failed load as fresh: the next visit asks again", async () => {
    const fetchContent = answers(new TypeError("Failed to fetch"), reply(STUDIO));
    const landing = createLandingRouteLoader({ browser: true, fetchContent });
    // Untouched: the route's staleTime decides.
    expect(landing.shouldReload()).toBeUndefined();
    await landing.load();
    expect(landing.shouldReload()).toBe(true);
    await landing.load();
    expect(landing.shouldReload()).toBeUndefined();
  });
});

// A new server instance that has never read the Studio answers with the
// checked-in copy, as a normal reply, while Sanity is down.
describe('a "fallback" reply in a browser', () => {
  it("is a failed load while it holds the copy the page was server-rendered with", async () => {
    const fetchContent = async () => reply(SERVER_FALLBACK, "fallback");
    const landing = createLandingRouteLoader({ browser: true, fetchContent });
    landing.seed(STUDIO);
    await expect(landing.load()).resolves.toEqual(STUDIO);
    expect(landing.shouldReload()).toBe(true);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      "[landing] Could not load the homepage copy (Error: The server had no Studio copy to send); " +
        "showing the copy this browser last received.",
    );
  });

  it("is a failed load while it holds a copy it loaded", async () => {
    const fetchContent = answers(reply(STUDIO, "last-good"), reply(SERVER_FALLBACK, "fallback"));
    const landing = createLandingRouteLoader({ browser: true, fetchContent });
    await landing.load();
    await expect(landing.load()).resolves.toEqual(STUDIO);
    expect(landing.shouldReload()).toBe(true);
  });

  it("with no copy in hand, is accepted and remembered", async () => {
    const fetchContent = answers(reply(SERVER_FALLBACK, "fallback"), new TypeError("offline"));
    const landing = createLandingRouteLoader({ browser: true, fetchContent });
    await expect(landing.load()).resolves.toBe(SERVER_FALLBACK);
    expect(landing.shouldReload()).toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
    // Remembered: a failure now serves it, not this bundle's checked-in copy.
    await expect(landing.load()).resolves.toEqual(SERVER_FALLBACK);
  });

  it("leaves the next visit to ask again, and a Studio reply then is accepted", async () => {
    const fetchContent = answers(reply(SERVER_FALLBACK, "fallback"), reply(STUDIO_LATER));
    const landing = createLandingRouteLoader({ browser: true, fetchContent });
    landing.seed(STUDIO);
    await expect(landing.load()).resolves.toEqual(STUDIO);
    expect(landing.shouldReload()).toBe(true);
    await expect(landing.load()).resolves.toBe(STUDIO_LATER);
    expect(landing.shouldReload()).toBeUndefined();
  });
});

describe.each<LandingSource>(["studio", "last-good"])('a "%s" reply in a browser', (source) => {
  it("is accepted over the copy the page was server-rendered with, and remembered", async () => {
    const fetchContent = answers(reply(STUDIO_LATER, source), new TypeError("offline"));
    const landing = createLandingRouteLoader({ browser: true, fetchContent });
    landing.seed(STUDIO);
    await expect(landing.load()).resolves.toBe(STUDIO_LATER);
    expect(landing.shouldReload()).toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
    await expect(landing.load()).resolves.toEqual(STUDIO_LATER);
  });

  it("after a failed load, is accepted and the staleTime decides again", async () => {
    const fetchContent = answers(reply(SERVER_FALLBACK, "fallback"), reply(STUDIO_LATER, source));
    const landing = createLandingRouteLoader({ browser: true, fetchContent });
    landing.seed(STUDIO);
    await landing.load();
    expect(landing.shouldReload()).toBe(true);
    await expect(landing.load()).resolves.toBe(STUDIO_LATER);
    expect(landing.shouldReload()).toBeUndefined();
  });
});

/** Changes what the router was handed, as a careless consumer might. Returns the undo. */
function tamper(content: LandingContent) {
  const { kicker } = content.hero;
  const { title } = content.kitchen.cards[0];
  content.hero.kicker = "Changed by a caller";
  content.kitchen.cards[0].title = "Changed by a caller";
  return () => {
    content.hero.kicker = kicker;
    content.kitchen.cards[0].title = title;
  };
}

describe("what a failed load serves is the page's own copy", () => {
  it("a seeded copy the page then changed is served as it was seeded", async () => {
    const landing = createLandingRouteLoader({ browser: true, fetchContent: offline });
    const page = structuredClone(STUDIO);
    landing.seed(page);
    tamper(page);
    expect(await landing.load()).toEqual(STUDIO);
  });

  it("a loaded copy the page then changed is served as it was loaded", async () => {
    const fetchContent = answers(reply(structuredClone(STUDIO)), new TypeError("Failed to fetch"));
    const landing = createLandingRouteLoader({ browser: true, fetchContent });
    tamper(await landing.load());
    expect(await landing.load()).toEqual(STUDIO);
  });

  it.each<[string, boolean, LandingContent | undefined]>([
    ["the remembered copy", true, STUDIO],
    ["the checked-in copy, in a browser", true, undefined],
    ["the checked-in copy, on the server", false, undefined],
  ])(
    "%s, changed after it was served, is served unchanged next time",
    async (_name, browser, seed) => {
      const pristine = structuredClone(seed ?? LANDING_FALLBACK);
      const landing = createLandingRouteLoader({ browser, fetchContent: offline });
      if (seed) landing.seed(structuredClone(seed));
      const undo = tamper(await landing.load());
      try {
        expect(await landing.load()).toEqual(pristine);
      } finally {
        undo();
      }
    },
  );
});

describe("a failed load is logged, in one line", () => {
  const failing = (error: unknown) => async (): Promise<LandingReply> => {
    throw error;
  };

  it("on the server with console.error, naming what it serves", async () => {
    const landing = createLandingRouteLoader({
      browser: false,
      fetchContent: failing(new TypeError("fetch failed")),
    });
    await landing.load();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "[landing] Could not load the homepage copy (TypeError: fetch failed); " +
        "serving fallback copy v2026-10-04.",
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each<[string, LandingContent | undefined, string]>([
    ["with a copy to fall back on", STUDIO, "showing the copy this browser last received."],
    ["with none", undefined, "showing fallback copy v2026-10-04."],
  ])("in a browser with console.warn, %s", async (_name, seed, serving) => {
    const landing = createLandingRouteLoader({
      browser: true,
      fetchContent: failing(new TypeError("Failed to fetch")),
    });
    if (seed) landing.seed(seed);
    await landing.load();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      `[landing] Could not load the homepage copy (TypeError: Failed to fetch); ${serving}`,
    );
    expect(console.error).not.toHaveBeenCalled();
  });

  it("puts a multi-line message on one line, cut short, and never the stack", async () => {
    // What the Start client throws for a proxy's error page: the whole body.
    const page = `Bad gateway\n<html>\n  <body>${"proxy error ".repeat(500)}</body>\n</html>`;
    const landing = createLandingRouteLoader({
      browser: true,
      fetchContent: failing(new Error(page)),
    });
    await landing.load();
    const [args] = vi.mocked(console.warn).mock.calls;
    expect(args).toHaveLength(1);
    const line = String(args[0]);
    expect(line).toMatch(
      /^\[landing\] Could not load the homepage copy \(Error: Bad gateway <html> <body>proxy error /,
    );
    expect(line).not.toMatch(/[\r\n]/);
    expect(line.length).toBeLessThan(400);
    expect(line).not.toMatch(/\bat .*landing-loader/);
  });

  it("names a rejection that is not an error by what it is", async () => {
    const landing = createLandingRouteLoader({ browser: false, fetchContent: failing("offline") });
    await landing.load();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "[landing] Could not load the homepage copy (offline); serving fallback copy v2026-10-04.",
    );
  });

  it.each([
    ["a successful load", async () => reply(STUDIO)],
    ["a redirect", failing(redirect({ to: "/login" }))],
    ["a not-found", failing(notFound())],
  ])("logs nothing for %s", async (_name, fetchContent) => {
    for (const browser of [true, false]) {
      await createLandingRouteLoader({ browser, fetchContent })
        .load()
        .catch(() => {});
    }
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe("a result that is not landing content is a failed load", () => {
  // What the Start client resolves with when something other than the server
  // function answered (@tanstack/start-client-core 1.170.34, serverFnFetcher):
  // a raw Response for a non-JSON 2xx, the body for other JSON.
  const NOT_CONTENT: Array<[string, unknown]> = [
    [
      "a raw Response (a non-JSON 200, e.g. a captive portal)",
      new Response("<html>Sign in to continue</html>", {
        headers: { "content-type": "text/html" },
      }),
    ],
    ["nothing (a JSON body without a result)", undefined],
    ["a JSON error body", { message: "Bad gateway" }],
    // Not what this server function sends: a reply says where its copy came from.
    ["landing content that does not say where it came from", structuredClone(STUDIO)],
    ["a reply from a source this page does not know", { content: STUDIO, source: "cache" }],
    ["a reply whose copy the page cannot render", { content: { message: "x" }, source: "studio" }],
  ];

  it.each(NOT_CONTENT)(
    "%s, in a browser: the remembered copy, and the next visit asks again",
    async (_name, result) => {
      const landing = createLandingRouteLoader({ browser: true, fetchContent: async () => result });
      landing.seed(STUDIO);
      await expect(landing.load()).resolves.toEqual(STUDIO);
      expect(landing.shouldReload()).toBe(true);
      expect(console.warn).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining("(TypeError: Not landing content:"),
      );
    },
  );

  it.each(NOT_CONTENT)("%s, on the server: the checked-in copy", async (_name, result) => {
    const landing = createLandingRouteLoader({ browser: false, fetchContent: async () => result });
    await expect(landing.load()).resolves.toEqual(LANDING_FALLBACK);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("(TypeError: Not landing content:"),
    );
  });
});

describe("createLandingRouteLoader on the server", () => {
  it("remembers nothing: after a successful load, a failure serves the checked-in copy", async () => {
    const fetchContent = answers(reply(STUDIO), new TypeError("fetch failed"));
    const landing = createLandingRouteLoader({ browser: false, fetchContent });
    await expect(landing.load()).resolves.toBe(STUDIO);
    await expect(landing.load()).resolves.toEqual(LANDING_FALLBACK);
  });

  it("ignores a seed", async () => {
    const landing = createLandingRouteLoader({ browser: false, fetchContent: offline });
    landing.seed(STUDIO);
    await expect(landing.load()).resolves.toEqual(LANDING_FALLBACK);
  });

  it("never asks the router to reload", async () => {
    const landing = createLandingRouteLoader({ browser: false, fetchContent: offline });
    await landing.load();
    expect(landing.shouldReload()).toBeUndefined();
  });

  it.each<[LandingSource, LandingContent]>([
    ["studio", STUDIO],
    ["last-good", STUDIO],
    ["fallback", SERVER_FALLBACK],
  ])("serves a %s reply's copy as it is, even after a successful load", async (source, content) => {
    const fetchContent = answers(reply(STUDIO_LATER), reply(content, source));
    const landing = createLandingRouteLoader({ browser: false, fetchContent });
    landing.seed(STUDIO_LATER);
    await expect(landing.load()).resolves.toBe(STUDIO_LATER);
    await expect(landing.load()).resolves.toBe(content);
    expect(landing.shouldReload()).toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

/** The `/` route's own loader, as the router calls it on navigation. */
function routeLoader() {
  // Read as unknown: the option's type also allows forms that aren't callable.
  const loader: unknown = Route.options.loader;
  if (typeof loader !== "function") throw new Error("The / route has no loader function.");
  return loader as () => Promise<LandingContent>;
}

describe("the / route", () => {
  it("loads the checked-in copy, not the error screen, when the server function can't be reached", async () => {
    getLandingContent.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(routeLoader()()).resolves.toEqual(LANDING_FALLBACK);
  });

  it("loads the copy the server function returns, without the reply around it", async () => {
    getLandingContent.mockResolvedValueOnce(reply(STUDIO));
    await expect(routeLoader()()).resolves.toBe(STUDIO);
  });

  // This file runs without a DOM, as server rendering does.
  it("keeps nothing between server renders", async () => {
    getLandingContent.mockResolvedValueOnce(reply(STUDIO));
    await routeLoader()();
    getLandingContent.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(routeLoader()()).resolves.toEqual(LANDING_FALLBACK);
  });
});
