import { describe, expect, it, vi } from "vitest";

import {
  LANDING_FALLBACK,
  LANDING_QUERY,
  landingHead,
  landingQueryUrl,
  loadLandingContent,
  normalizeLandingContent,
  sanityTargetFromEnv,
} from "@/features/landing/landing-content";

const TARGET = { projectId: "abc123", dataset: "production" };

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
});

describe("loadLandingContent — never throws", () => {
  const ok = (body: unknown) =>
    vi.fn(
      async () => new Response(JSON.stringify(body), { status: 200 }),
    ) as unknown as typeof fetch;

  it("returns normalized Studio content", async () => {
    const warn = vi.fn();
    const c = await loadLandingContent({
      target: TARGET,
      fetchImpl: ok({ result: { hero: { kicker: "From Studio" } } }),
      warn,
    });
    expect(c.hero.kicker).toBe("From Studio");
    expect(warn).not.toHaveBeenCalled();
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
    const c = await loadLandingContent({ target, fetchImpl, warn });
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
    expect(
      await loadLandingContent({ target: TARGET, fetchImpl: hung, warn, timeoutMs: 20 }),
    ).toEqual(LANDING_FALLBACK);
    expect(warn).toHaveBeenCalledOnce();
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
