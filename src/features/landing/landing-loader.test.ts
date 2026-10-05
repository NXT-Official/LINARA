import { notFound, redirect } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

import { LANDING_FALLBACK, type LandingContent } from "@/features/landing/landing-content";
import { loadLandingForRoute } from "@/features/landing/landing-loader";
import { Route } from "@/routes/index";

// The real server function never loads here; each test says what it does.
const getLandingContent = vi.hoisted(() => vi.fn<() => Promise<LandingContent>>());
vi.mock("@/features/landing/landing.actions", () => ({ getLandingContent }));

const STUDIO: LandingContent = {
  ...LANDING_FALLBACK,
  hero: { ...LANDING_FALLBACK.hero, kicker: "From Studio" },
};

// What a browser's fetch rejects with when the network is gone.
const offline = async (): Promise<LandingContent> => {
  throw new TypeError("Failed to fetch");
};

describe("loadLandingForRoute", () => {
  it("resolves with the fetched content", async () => {
    await expect(loadLandingForRoute(async () => STUDIO)).resolves.toBe(STUDIO);
  });

  it("resolves with the checked-in copy when the fetch rejects", async () => {
    await expect(loadLandingForRoute(offline)).resolves.toEqual(LANDING_FALLBACK);
  });

  it("re-throws a redirect untouched, for the router to follow", async () => {
    const signal = redirect({ to: "/login" });
    const redirects = async (): Promise<LandingContent> => {
      throw signal;
    };
    await expect(loadLandingForRoute(redirects)).rejects.toBe(signal);
  });

  it("re-throws a not-found untouched, for the router to render", async () => {
    const signal = notFound();
    const missing = async (): Promise<LandingContent> => {
      throw signal;
    };
    await expect(loadLandingForRoute(missing)).rejects.toBe(signal);
  });

  it("calls the server function unless handed another fetch", async () => {
    getLandingContent.mockResolvedValueOnce(STUDIO);
    await expect(loadLandingForRoute()).resolves.toBe(STUDIO);
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

  it("loads what the server function returns", async () => {
    getLandingContent.mockResolvedValueOnce(STUDIO);
    await expect(routeLoader()()).resolves.toBe(STUDIO);
  });
});
