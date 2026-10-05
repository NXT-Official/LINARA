import { describe, expect, it, vi } from "vitest";

import {
  LANDING_FALLBACK,
  LANDING_QUERY,
  type LandingContent,
  createLandingContentLoader,
  isLandingContent,
  isLandingReply,
  landingHead,
  landingQueryUrl,
  normalizeLandingContent,
  sanityTargetFromEnv,
} from "@/features/landing/landing-content";

const TARGET = { projectId: "abc123", dataset: "production" };

/** Every string value anywhere in a JSON-like value. */
function leafStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(leafStrings);
  return [];
}

const SECTIONS = ["seo", "header", "hero", "kitchen", "lenses", "account", "footer"] as const;
const HIDEABLE = ["kitchen", "lenses", "account"] as const;
type Hideable = (typeof HIDEABLE)[number];

/** A complete Studio document. Every string in it names the section it belongs to. */
function studioDocument(hidden?: Hideable) {
  return {
    seo: { title: "SEO-title", description: "SEO-description", socialDescription: "SEO-social" },
    header: { ctaLabel: "HEADER-cta" },
    hero: {
      kicker: "HERO-kicker",
      headlineLine1: "HERO-line-1",
      headlineLine2: "HERO-line-2",
      description: "HERO-description",
      ctaLabel: "HERO-cta",
    },
    kitchen: {
      hidden: hidden === "kitchen",
      heading: "KITCHEN-heading",
      body: "KITCHEN-body",
      cards: [
        { _key: "KITCHEN-key-0", icon: "wallet", title: "KITCHEN-card-0", body: "KITCHEN-text-0" },
        { _key: "KITCHEN-key-1", icon: "users", title: "KITCHEN-card-1", body: "KITCHEN-text-1" },
      ],
    },
    lenses: {
      hidden: hidden === "lenses",
      heading: "LENSES-heading",
      body: "LENSES-body",
      items: [
        { _key: "LENSES-key-0", title: "LENSES-item-0", body: "LENSES-text-0" },
        { _key: "LENSES-key-1", title: "LENSES-item-1", body: "LENSES-text-1" },
      ],
    },
    account: {
      hidden: hidden === "account",
      badge: "ACCOUNT-badge",
      heading: "ACCOUNT-heading",
      body: "ACCOUNT-body",
      complianceTitle: "ACCOUNT-compliance-title",
      complianceBody: "ACCOUNT-compliance: wages, SSS, PhilHealth and Pag-IBIG, under review",
    },
    footer: {
      copyright: "FOOTER-copyright",
      privacyLabel: "FOOTER-privacy",
      termsLabel: "FOOTER-terms",
    },
  };
}

/** What a hidden section is reduced to: its flag, and no copy. */
const BARE = {
  kitchen: { hidden: true, heading: "", body: "", cards: [] },
  lenses: { hidden: true, heading: "", body: "", items: [] },
  account: {
    hidden: true,
    badge: "",
    heading: "",
    body: "",
    complianceTitle: "",
    complianceBody: "",
  },
};

/**
 * `content` is what the server hands the page for hydration, so its JSON is
 * what a visitor can read in the page source. The hidden section must be bare
 * there, and every other section exactly as published.
 */
function expectOnlyHiddenIsBare(content: LandingContent, hidden: Hideable) {
  const doc = studioDocument(hidden);
  const wire = JSON.stringify(content);
  expect(leafStrings(doc[hidden]).length).toBeGreaterThan(4);
  for (const sentinel of leafStrings(doc[hidden])) expect(wire).not.toContain(sentinel);
  expect(content[hidden]).toEqual(BARE[hidden]);
  for (const section of SECTIONS.filter((name) => name !== hidden)) {
    for (const sentinel of leafStrings(doc[section])) expect(wire).toContain(sentinel);
    expect(content[section]).toEqual(doc[section]);
  }
}

describe("normalizeLandingContent", () => {
  it("returns the full fallback for a missing document", () => {
    expect(normalizeLandingContent(null)).toEqual(LANDING_FALLBACK);
    expect(normalizeLandingContent("nonsense")).toEqual(LANDING_FALLBACK);
  });

  it("round-trips the fallback unchanged (the seed is lossless)", () => {
    expect(normalizeLandingContent(structuredClone(LANDING_FALLBACK))).toEqual(LANDING_FALLBACK);
  });

  it("uses Studio values and falls back field by field", () => {
    const c = normalizeLandingContent({ hero: { kicker: "  New kicker  ", description: "" } });
    expect(c.hero.kicker).toBe("New kicker");
    expect(c.hero.description).toBe(LANDING_FALLBACK.hero.description);
    expect(c.hero.headlineLine1).toBe(LANDING_FALLBACK.hero.headlineLine1);
  });

  it("rejects over-long and non-string text", () => {
    const c = normalizeLandingContent({ hero: { kicker: "x".repeat(41), ctaLabel: 42 } });
    expect(c.hero.kicker).toBe(LANDING_FALLBACK.hero.kicker);
    expect(c.hero.ctaLabel).toBe(LANDING_FALLBACK.hero.ctaLabel);
  });

  it("accepts only real booleans for visibility", () => {
    expect(normalizeLandingContent({ kitchen: { hidden: "true" } }).kitchen.hidden).toBe(false);
    expect(normalizeLandingContent({ kitchen: { hidden: true } }).kitchen.hidden).toBe(true);
  });

  it("keeps every word of a document with nothing hidden", () => {
    expect(normalizeLandingContent(studioDocument())).toEqual(studioDocument());
  });

  it.each(HIDEABLE)("a hidden %s section keeps its flag and none of its copy", (hidden) => {
    expectOnlyHiddenIsBare(normalizeLandingContent(studioDocument(hidden)), hidden);
  });

  it("a hidden section does not fall back to the checked-in copy either", () => {
    const content = normalizeLandingContent({
      kitchen: { hidden: true },
      lenses: { hidden: true },
      account: { hidden: true },
    });
    expect(content.kitchen).toEqual(BARE.kitchen);
    expect(content.lenses).toEqual(BARE.lenses);
    expect(content.account).toEqual(BARE.account);
    expect(JSON.stringify(content)).not.toContain(LANDING_FALLBACK.account.complianceBody);
  });

  it("keeps the whole fallback list when any card is incomplete", () => {
    const c = normalizeLandingContent({
      kitchen: {
        cards: [
          { _key: "a", title: "Ok", body: "Fine" },
          { _key: "b", title: "No body" },
        ],
      },
    });
    expect(c.kitchen.cards).toEqual(LANDING_FALLBACK.kitchen.cards);
  });

  it("an empty list keeps the fallback list", () => {
    expect(normalizeLandingContent({ lenses: { items: [] } }).lenses.items).toEqual(
      LANDING_FALLBACK.lenses.items,
    );
  });

  it("caps list length and maps unknown icons to the code-owned set", () => {
    const cards = Array.from({ length: 9 }, (_, i) => ({
      _key: `k${i}`,
      icon: i === 0 ? "<svg onload=x>" : "clock",
      title: `T${i}`,
      body: "b",
    }));
    const c = normalizeLandingContent({ kitchen: { cards } });
    expect(c.kitchen.cards).toHaveLength(6);
    expect(c.kitchen.cards[0].icon).toBe("book-open");
    expect(c.kitchen.cards[1].icon).toBe("clock");
  });

  it("sanitises React keys", () => {
    const c = normalizeLandingContent({
      lenses: { items: [{ _key: "bad key!", title: "A", body: "a" }] },
    });
    expect(c.lenses.items[0]._key).toBe("item-0");
  });

  it("never carries fields outside the contract", () => {
    const c = normalizeLandingContent({ hero: { kicker: "k", injected: "x" }, extra: 1 });
    expect(Object.keys(c.hero)).toEqual(Object.keys(LANDING_FALLBACK.hero));
    expect(JSON.stringify(c)).not.toContain("injected");
    expect(Object.keys(c)).toEqual(Object.keys(LANDING_FALLBACK));
  });
});

/** LANDING_FALLBACK with one thing broken. */
function broken(change: (content: LandingContent) => void): unknown {
  const content = structuredClone(LANDING_FALLBACK);
  change(content);
  return content;
}

describe("isLandingContent", () => {
  it("accepts everything the normalizer produces, hidden sections included", () => {
    expect(isLandingContent(LANDING_FALLBACK)).toBe(true);
    expect(isLandingContent(normalizeLandingContent(null))).toBe(true);
    expect(isLandingContent(normalizeLandingContent(studioDocument()))).toBe(true);
    for (const hidden of HIDEABLE) {
      expect(isLandingContent(normalizeLandingContent(studioDocument(hidden))), hidden).toBe(true);
    }
    const allHidden = normalizeLandingContent({
      kitchen: { hidden: true },
      lenses: { hidden: true },
      account: { hidden: true },
    });
    expect(isLandingContent(allHidden)).toBe(true);
  });

  it.each<[string, unknown]>([
    ["nothing", undefined],
    ["null", null],
    ["a string", "<html>Bad gateway</html>"],
    ["a list", []],
    ["a raw Response", new Response("<html></html>")],
    ["a JSON error body", { message: "Bad gateway" }],
    ["copy without a footer", broken((c) => Reflect.deleteProperty(c, "footer"))],
    ["SEO without a title", broken((c) => Reflect.deleteProperty(c.seo, "title"))],
    ["a label that is not text", broken((c) => Object.assign(c.header, { ctaLabel: 42 }))],
    ["cards that are not a list", broken((c) => Object.assign(c.kitchen, { cards: "three" }))],
    ["a card without its body", broken((c) => Reflect.deleteProperty(c.kitchen.cards[1], "body"))],
    [
      "a card icon the page has no component for",
      broken((c) => Object.assign(c.kitchen.cards[0], { icon: "rocket" })),
    ],
    ["a lens without a title", broken((c) => Object.assign(c.lenses.items[0], { title: null }))],
    [
      "a visibility flag that is not a boolean",
      broken((c) => Object.assign(c.account, { hidden: "yes" })),
    ],
  ])("refuses %s", (_name, value) => {
    expect(isLandingContent(value)).toBe(false);
  });
});

describe("isLandingReply", () => {
  it.each(["studio", "last-good", "fallback"])("accepts renderable copy from %s", (source) => {
    expect(isLandingReply({ content: LANDING_FALLBACK, source })).toBe(true);
    const hidden = normalizeLandingContent(studioDocument("account"));
    expect(isLandingReply({ content: hidden, source })).toBe(true);
  });

  it.each<[string, unknown]>([
    ["nothing", undefined],
    ["null", null],
    ["a list", [LANDING_FALLBACK, "studio"]],
    ["a raw Response", new Response("<html></html>")],
    ["a JSON error body", { message: "Bad gateway" }],
    ["landing content that does not say where it came from", structuredClone(LANDING_FALLBACK)],
    ["a reply without a source", { content: LANDING_FALLBACK }],
    ["a source the page does not know", { content: LANDING_FALLBACK, source: "cache" }],
    ["a source that is not text", { content: LANDING_FALLBACK, source: 1 }],
    ["a reply without its copy", { source: "studio" }],
    [
      "copy the page cannot render",
      { content: broken((c) => Reflect.deleteProperty(c, "footer")), source: "studio" },
    ],
  ])("refuses %s", (_name, value) => {
    expect(isLandingReply(value)).toBe(false);
  });
});

describe("sanityTargetFromEnv", () => {
  it("needs both values in a URL-safe shape", () => {
    expect(
      sanityTargetFromEnv({ SANITY_PROJECT_ID: "abc123", SANITY_DATASET: "production" }),
    ).toEqual(TARGET);
    expect(sanityTargetFromEnv({ SANITY_PROJECT_ID: "abc123" })).toBeNull();
    expect(
      sanityTargetFromEnv({ SANITY_PROJECT_ID: "evil.com/x", SANITY_DATASET: "p" }),
    ).toBeNull();
    expect(sanityTargetFromEnv({ SANITY_PROJECT_ID: "abc", SANITY_DATASET: "../x" })).toBeNull();
  });
});

describe("landingQueryUrl", () => {
  it("targets the read-only CDN of the configured project, published perspective", () => {
    const url = new URL(landingQueryUrl(TARGET));
    expect(url.origin).toBe("https://abc123.apicdn.sanity.io");
    expect(url.pathname).toBe("/v2026-08-01/data/query/production");
    expect(url.searchParams.get("query")).toBe(LANDING_QUERY);
    expect(url.searchParams.get("perspective")).toBe("published");
  });

  it("asks only for a document with LINARA's kitchen section", () => {
    expect(LANDING_QUERY.startsWith('*[_id == "landingPage" && defined(kitchen)][0]{')).toBe(true);
  });
});

/**
 * MILA's `landingPage`: same Sanity organization, env var names, dataset name
 * and document id as LINARA's. Only the shape tells them apart.
 */
const MILA_RESULT = {
  seo: {
    title: "Mila — Your stylist. Every morning.",
    description: "x",
    socialDescription: "y",
  },
  hero: {
    kicker: "Your AI stylist",
    headlineLine1: "Your stylist.",
    headlineLine2: "Every morning.",
    subhead: "s",
  },
  howItWorks: {},
  footer: { wordmark: "MILA", tagline: "t" },
};

describe("createLandingContentLoader — never throws", () => {
  const ok = (body: unknown) =>
    vi.fn(
      async () => new Response(JSON.stringify(body), { status: 200 }),
    ) as unknown as typeof fetch;

  it("returns normalized Studio content", async () => {
    const warn = vi.fn();
    const { content: c } = await createLandingContentLoader({
      target: TARGET,
      fetchImpl: ok({ result: { kitchen: { hidden: false }, hero: { kicker: "From Studio" } } }),
      warn,
    })();
    expect(c.hero.kicker).toBe("From Studio");
    expect(warn).not.toHaveBeenCalled();
  });

  it("refuses another product's document and serves the fallback path instead", async () => {
    const warn = vi.fn();
    const { content: c } = await createLandingContentLoader({
      target: TARGET,
      fetchImpl: ok({ result: MILA_RESULT }),
      warn,
    })();
    const served = leafStrings(c);
    for (const foreign of leafStrings(MILA_RESULT)) expect(served).not.toContain(foreign);
    for (const word of ["Mila", "MILA", "stylist"]) expect(JSON.stringify(c)).not.toContain(word);

    const { content: unpublished } = await createLandingContentLoader({
      target: TARGET,
      fetchImpl: ok({ result: null }),
      warn: vi.fn(),
    })();
    expect(c).toEqual(unpublished);
    expect(c).toEqual(LANDING_FALLBACK);

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toMatch(/"landingPage" in abc123\/production does not look like LINARA's/);
    expect(message).toContain("fallback copy v2026-10-04");
  });

  it.each([
    ["missing", { hero: { kicker: "Foreign" } }],
    ["null", { kitchen: null, hero: { kicker: "Foreign" } }],
    ["a string", { kitchen: "yes", hero: { kicker: "Foreign" } }],
    ["a list", { kitchen: [{ heading: "h" }], hero: { kicker: "Foreign" } }],
  ])("refuses a document whose kitchen is %s", async (_name, result) => {
    const warn = vi.fn();
    const { content: c } = await createLandingContentLoader({
      target: TARGET,
      fetchImpl: ok({ result }),
      warn,
    })();
    expect(c).toEqual(LANDING_FALLBACK);
    expect(String(warn.mock.calls[0][0])).toMatch(/does not look like LINARA's/);
  });

  it.each([
    ["not configured", null, ok({ result: {} }), /not configured/],
    [
      "unpublished",
      TARGET,
      ok({ result: null }),
      /No published "landingPage" in abc123\/production/,
    ],
    [
      "HTTP error",
      TARGET,
      vi.fn(
        async () => new Response("secret-ish body", { status: 503 }),
      ) as unknown as typeof fetch,
      /responded 503/,
    ],
    [
      "network failure",
      TARGET,
      vi.fn(async () => {
        throw new Error("ECONNRESET token=abc");
      }) as unknown as typeof fetch,
      /request failed/,
    ],
    [
      "bad JSON",
      TARGET,
      vi.fn(async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch,
      /request failed/,
    ],
  ])("%s → fallback + one sanitized warning", async (_name, target, fetchImpl, pattern) => {
    const warn = vi.fn();
    const { content: c } = await createLandingContentLoader({ target, fetchImpl, warn })();
    expect(c).toEqual(LANDING_FALLBACK);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toMatch(pattern);
    expect(message).toContain("fallback copy v2026-10-04");
    expect(message).not.toMatch(/secret-ish|token=|ECONNRESET/);
  });

  it("aborts a hung request", async () => {
    const hung = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    ) as unknown as typeof fetch;
    const warn = vi.fn();
    const load = createLandingContentLoader({
      target: TARGET,
      fetchImpl: hung,
      warn,
      timeoutMs: 20,
    });
    expect((await load()).content).toEqual(LANDING_FALLBACK);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("createLandingContentLoader — one server instance over time", () => {
  /** What an editor published: two sections hidden and a corrected compliance line. */
  const STUDIO = {
    kitchen: { hidden: true },
    lenses: { hidden: true },
    account: { complianceBody: "Corrected compliance line." },
    hero: { kicker: "From Studio" },
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  type Respond = (init?: RequestInit) => Promise<Response>;

  /** An isolated loader with its own clock and a fetch the test can re-point. */
  function instance(target: typeof TARGET | null = TARGET, timeoutMs = 20) {
    const state: { now: number; respond: Respond } = {
      now: 0,
      respond: async () => json({ result: STUDIO }),
    };
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => state.respond(init));
    const warn = vi.fn();
    const load = createLandingContentLoader({
      target,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      warn,
      now: () => state.now,
      timeoutMs,
    });
    return { state, fetchImpl, warn, load };
  }

  /** Never answers; rejects the way fetch does when its signal aborts. */
  const hung: Respond = (init) =>
    new Promise<Response>((_, reject) =>
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
    );

  /**
   * A response, or a failure, the test hands over by hand. Like a misbehaving
   * fetch, it ignores the abort.
   */
  function answerLater() {
    let answer: (response: Response) => void = () => {};
    let fail: (error: Error) => void = () => {};
    const promise = new Promise<Response>((resolve, reject) => {
      answer = resolve;
      fail = reject;
    });
    return { respond: () => promise, answer, fail };
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Whether `promise` settles before `ms` of real time pass. */
  const settlesWithin = (promise: Promise<unknown>, ms: number) =>
    Promise.race([promise.then(() => true), sleep(ms).then(() => false)]);

  const FAILURES: Array<[string, Respond]> = [
    ["a non-200", async () => json({ error: "down" }, 503)],
    ["a timeout", hung],
    [
      "a thrown error",
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
    ["bad JSON", async () => new Response("<html>", { status: 200 })],
    ["an unpublished document", async () => json({ result: null })],
    ["another product's document", async () => json({ result: MILA_RESULT })],
  ];

  it.each(FAILURES)(
    "after a good read, %s still serves what editors published",
    async (_name, failure) => {
      const { state, warn, load } = instance();
      const { content: good } = await load();
      expect(good.kitchen.hidden).toBe(true);
      expect(good.lenses.hidden).toBe(true);
      expect(good.account.complianceBody).toBe("Corrected compliance line.");
      expect(warn).not.toHaveBeenCalled();

      state.respond = failure;
      const { content: served } = await load();
      expect(served).toEqual(good);
      expect(served.kitchen.hidden).toBe(true);
      expect(served.lenses.hidden).toBe(true);
      expect(served.account.complianceBody).toBe("Corrected compliance line.");
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0][0]);
      expect(message).toContain("serving the last good Studio copy");
      expect(message).not.toContain("fallback copy");
    },
  );

  it.each(HIDEABLE)(
    "a hidden %s section's copy is not served, fresh or from the last good read",
    async (hidden) => {
      const { state, fetchImpl, load } = instance();
      state.respond = async () => json({ result: studioDocument(hidden) });
      expectOnlyHiddenIsBare((await load()).content, hidden);

      state.respond = async () => json({ error: "down" }, 503);
      const { content: lastGood } = await load();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expectOnlyHiddenIsBare(lastGood, hidden);

      // And again from inside the back-off window, where nothing is fetched.
      expectOnlyHiddenIsBare((await load()).content, hidden);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    },
  );

  it.each(FAILURES)("with no good read yet, %s serves LANDING_FALLBACK", async (_name, failure) => {
    const { state, fetchImpl, warn, load } = instance();
    state.respond = failure;
    expect((await load()).content).toEqual(LANDING_FALLBACK);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("serving fallback copy v2026-10-04.");
  });

  it("asks for the published document of the configured project, with a 4-second abort", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      const fetchImpl = vi.fn(async () => json({ result: STUDIO }));
      const load = createLandingContentLoader({
        target: TARGET,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        warn: vi.fn(),
      });
      await load();
      expect(timeout).toHaveBeenCalledExactlyOnceWith(4000);
      expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(landingQueryUrl(TARGET), {
        headers: { accept: "application/json" },
        signal: timeout.mock.results[0].value,
      });
    } finally {
      timeout.mockRestore();
    }
  });

  it("after a failure, stays off Sanity for 30 seconds, then tries again", async () => {
    const { state, fetchImpl, warn, load } = instance();
    state.respond = async () => json({ error: "down" }, 503);
    expect((await load()).content).toEqual(LANDING_FALLBACK);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("Next attempt in 30s.");

    // Sanity is back, but the window has not passed: no fetch, no second warning.
    state.respond = async () => json({ result: STUDIO });
    state.now += 29_999;
    expect((await load()).content).toEqual(LANDING_FALLBACK);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);

    state.now += 1;
    expect((await load()).content.hero.kicker).toBe("From Studio");
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // The window is over: the very next call reads again.
    await load();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("a long outage costs one read and one warning per 30 seconds", async () => {
    const { state, fetchImpl, warn, load } = instance();
    state.respond = async () => json({ error: "down" }, 503);
    await load();
    state.now += 30_000;
    await load();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(2);

    // The failed retry opened a new window of its own.
    state.now += 29_999;
    await load();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(2);

    state.now += 1;
    await load();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("inside the 30 seconds, serves the last good copy without fetching", async () => {
    const { state, fetchImpl, warn, load } = instance();
    const { content: good } = await load();
    state.respond = async () => json({ error: "down" }, 503);
    await load();
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    state.now += 15_000;
    expect((await load()).content).toEqual(good);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("requests that arrive together during an outage share one read and one warning", async () => {
    const { state, fetchImpl, warn, load } = instance();
    state.respond = async () => json({ error: "down" }, 503);
    const served = await Promise.all([load(), load(), load(), load(), load()]);
    for (const { content } of served) expect(content).toEqual(LANDING_FALLBACK);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("when the quiet period ends, requests that arrive together start one retry", async () => {
    const { state, fetchImpl, warn, load } = instance();
    state.respond = hung;
    await load();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    state.now += 30_000;
    const served = await Promise.all([load(), load(), load(), load(), load()]);
    for (const { content } of served) expect(content).toEqual(LANDING_FALLBACK);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("with a good copy in hand, nobody waits for a read already under way", async () => {
    // A long timeout: only the test decides when this read answers.
    const { state, fetchImpl, load } = instance(TARGET, 60_000);
    const { content: good } = await load();
    const later = answerLater();
    state.respond = later.respond;

    const first = load();
    const others = Promise.all([load(), load(), load()]);
    expect(await settlesWithin(others, 0)).toBe(true);
    for (const reply of await others) expect(reply).toEqual({ content: good, source: "last-good" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // The request that started the read gets what it found.
    const published = { ...STUDIO, hero: { kicker: "Published later" } };
    later.answer(json({ result: published }));
    expect(await first).toEqual({ content: normalizeLandingContent(published), source: "studio" });
  });

  it.each<[string, Respond]>([
    ["never answers", () => new Promise<Response>(() => {})],
    [
      "sends headers, then stalls the body",
      async () => new Response(new ReadableStream({ pull: () => new Promise<void>(() => {}) })),
    ],
  ])(
    "a fetch that ignores its abort and %s keeps nobody past the deadline",
    async (_name, respond) => {
      const { state, warn, load } = instance();
      state.respond = respond;
      const served = load();
      expect(await settlesWithin(served, 500)).toBe(true);
      expect((await served).content).toEqual(LANDING_FALLBACK);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("Sanity request failed (TimeoutError)");
    },
  );

  it.each<[string, string, number, (later: ReturnType<typeof answerLater>) => void]>([
    [
      "answers 503",
      "after the quiet period",
      31_000,
      (later) => later.answer(json({ error: "down" }, 503)),
    ],
    [
      "rejects",
      "after the quiet period",
      31_000,
      (later) => later.fail(new TypeError("fetch failed")),
    ],
    [
      "answers 503",
      "inside the quiet period",
      10_000,
      (later) => later.answer(json({ error: "down" }, 503)),
    ],
  ])(
    "a read given up at its deadline whose fetch %s %s warns once and holds back no retry",
    async (_how, _when, elapsed, giveUp) => {
      const { state, fetchImpl, warn, load } = instance();
      const later = answerLater();
      state.respond = later.respond;
      await load();
      // Given up at its 20 ms deadline: one warning and a 30-second quiet period.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("Sanity request failed (TimeoutError)");

      // Its fetch, which ignored the abort, gives up too, with no request in between.
      state.now = elapsed;
      giveUp(later);
      await sleep(10);
      expect(warn).toHaveBeenCalledTimes(1);

      // The read's one quiet period is over: the next request reads Sanity.
      state.now = Math.max(elapsed, 30_000);
      state.respond = async () => json({ result: STUDIO });
      await load();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(1);
    },
  );

  it("a read that fails after a newer one succeeded neither warns nor opens a quiet period", async () => {
    const { state, fetchImpl, warn, load } = instance();
    const older = answerLater();
    state.respond = older.respond;
    void load();
    // Past its 20 ms deadline: the loader has given up on that read.
    await sleep(60);
    state.now += 30_000;
    state.respond = async () => json({ result: STUDIO });
    expect((await load()).content.hero.kicker).toBe("From Studio");

    older.answer(json({ error: "down" }, 503));
    await sleep(10);
    for (const [message] of warn.mock.calls) expect(String(message)).not.toContain("503");
    // No quiet period: the next request reads again.
    await load();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("a read that succeeds after a newer one did does not replace the newer copy", async () => {
    const { state, load } = instance();
    const older = answerLater();
    state.respond = older.respond;
    void load();
    await sleep(60);
    state.now += 30_000;
    state.respond = async () => json({ result: { ...STUDIO, hero: { kicker: "Newer" } } });
    expect((await load()).content.hero.kicker).toBe("Newer");

    older.answer(json({ result: { ...STUDIO, hero: { kicker: "Older" } } }));
    await sleep(10);
    // An outage now serves the last good copy, and that is the newer one.
    state.respond = async () => json({ error: "down" }, 503);
    expect((await load()).content.hero.kicker).toBe("Newer");
  });

  /** Changes what a caller was served, as a careless consumer might. Returns the undo. */
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

  describe("what it serves is the caller's own copy", () => {
    it("the last good copy", async () => {
      const { state, load } = instance();
      state.respond = async () => json({ result: studioDocument() });
      const undo = tamper((await load()).content);
      try {
        state.respond = async () => json({ error: "down" }, 503);
        expect((await load()).content).toEqual(studioDocument());
        // And again from inside the quiet period.
        expect((await load()).content).toEqual(studioDocument());
      } finally {
        undo();
      }
    });

    it.each<[string, typeof TARGET | null]>([
      ["during an outage", TARGET],
      ["with Sanity not configured", null],
    ])("the checked-in copy %s", async (_name, target) => {
      const pristine = structuredClone(LANDING_FALLBACK);
      const { state, load } = instance(target);
      state.respond = async () => json({ error: "down" }, 503);
      const undo = tamper((await load()).content);
      try {
        expect((await load()).content).toEqual(pristine);
        expect(LANDING_FALLBACK).toEqual(pristine);
      } finally {
        undo();
      }
    });
  });

  it.each<[string, Respond, string]>([
    ["a timeout", hung, "TimeoutError"],
    [
      "a DNS failure",
      async () => {
        throw new TypeError("fetch failed token=abc", {
          cause: new Error("getaddrinfo ENOTFOUND abc123.apicdn.sanity.io"),
        });
      },
      "TypeError",
    ],
    ["bad JSON", async () => new Response("<html>", { status: 200 }), "SyntaxError"],
    ["a rejection that is not an error", () => Promise.reject("boom token=abc"), "Error"],
    [
      "an error with an unsafe name",
      () => Promise.reject(Object.assign(new Error("x"), { name: "token=abc\nforged line" })),
      "Error",
    ],
  ])("%s is logged by its error name and nothing else", async (_name, respond, errorName) => {
    const { state, warn, load } = instance();
    state.respond = respond;
    expect((await load()).content).toEqual(LANDING_FALLBACK);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toBe(
      `[landing] Sanity request failed (${errorName}) for abc123/production; ` +
        "serving fallback copy v2026-10-04. Next attempt in 30s.",
    );
  });

  it.each([
    ["absent", {}],
    ["malformed", { SANITY_PROJECT_ID: "evil.com/x", SANITY_DATASET: "production" }],
  ])("project id %s: warns once across three calls and never fetches", async (_name, env) => {
    const { state, fetchImpl, warn, load } = instance(sanityTargetFromEnv(env));
    for (let call = 0; call < 3; call += 1) {
      expect((await load()).content).toEqual(LANDING_FALLBACK);
      // Well past the retry window, so the silence is not the back-off.
      state.now += 60_000;
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toBe(
      "[landing] Sanity is not configured; serving fallback copy v2026-10-04.",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // The server function hands this on, so a browser can tell a new instance's
  // checked-in copy from Studio copy (landing-loader.ts).
  describe("says where the copy it serves came from", () => {
    const FRESH = normalizeLandingContent(STUDIO);
    const CHECKED_IN = { content: LANDING_FALLBACK, source: "fallback" };

    it('"studio" for a request that read Sanity', async () => {
      const { load } = instance();
      expect(await load()).toEqual({ content: FRESH, source: "studio" });
    });

    it('"studio" for every request that waited for the same read', async () => {
      const { fetchImpl, load } = instance();
      const replies = await Promise.all([load(), load(), load()]);
      for (const reply of replies) expect(reply).toEqual({ content: FRESH, source: "studio" });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it.each(FAILURES)(
      '"last-good" after %s, and through the quiet period that follows',
      async (_name, failure) => {
        const { state, load } = instance();
        await load();
        state.respond = failure;
        expect(await load()).toEqual({ content: FRESH, source: "last-good" });
        state.now += 15_000;
        expect(await load()).toEqual({ content: FRESH, source: "last-good" });
      },
    );

    it.each(FAILURES)(
      '"fallback" for %s with no good read yet, and through the quiet period',
      async (_name, failure) => {
        const { state, load } = instance();
        state.respond = failure;
        expect(await load()).toEqual(CHECKED_IN);
        state.now += 15_000;
        expect(await load()).toEqual(CHECKED_IN);
      },
    );

    it('"fallback" with Sanity not configured', async () => {
      const { state, load } = instance(null);
      expect(await load()).toEqual(CHECKED_IN);
      state.now += 60_000;
      expect(await load()).toEqual(CHECKED_IN);
    });

    it('"last-good" for what a read given up at its deadline finds afterwards', async () => {
      const { state, fetchImpl, load } = instance();
      const later = answerLater();
      state.respond = later.respond;
      expect(await load()).toEqual(CHECKED_IN);
      // Still the newest read, so what it finds is kept: no request waited for it.
      later.answer(json({ result: STUDIO }));
      await sleep(10);
      expect(await load()).toEqual({ content: FRESH, source: "last-good" });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });
});

describe("createLandingContentLoader — its own clock", () => {
  it.each([
    ["back an hour", -3_600_000],
    ["forward an hour", 3_600_000],
  ])("keeps the 30-second quiet period when the wall clock steps %s", async (_name, step) => {
    // Time since start-up and time of day, moved separately.
    let elapsed = 1_000;
    let wall = Date.UTC(2026, 9, 5, 4, 0);
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    vi.spyOn(Date, "now").mockImplementation(() => wall);
    try {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ error: "down" }), { status: 503 }),
      );
      const load = createLandingContentLoader({
        target: TARGET,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        warn: vi.fn(),
      });
      await load();
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      // The server's clock is corrected (NTP) while the quiet period runs.
      wall += step;
      elapsed += 29_999;
      await load();
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      elapsed += 1;
      await load();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("landingHead", () => {
  it("emits Studio SEO tags, nothing without data", () => {
    expect(landingHead(undefined)).toEqual({});
    const meta = landingHead(normalizeLandingContent({ seo: { title: "New title" } })).meta;
    expect(meta).toContainEqual({ title: "New title" });
    expect(meta).toContainEqual({ property: "og:title", content: "New title" });
  });
});
