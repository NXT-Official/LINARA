// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { hydrate } from "@tanstack/react-router/ssr/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LANDING_FALLBACK,
  type LandingContent,
  type LandingReply,
  normalizeLandingContent,
} from "@/features/landing/landing-content";

// The real server function never loads here; each step says what it does.
const getLandingContent = vi.hoisted(() => vi.fn<() => Promise<LandingReply>>());
vi.mock("@/features/landing/landing.actions", () => ({ getLandingContent }));

afterEach(() => {
  cleanup();
  getLandingContent.mockReset();
  vi.restoreAllMocks();
  delete window.$_TSR;
});

/** What an editor published: the account card (and its compliance line) hidden. */
const STUDIO = normalizeLandingContent({
  hero: { kicker: "From Studio" },
  account: { hidden: true },
});
const STUDIO_EDITED = normalizeLandingContent({
  hero: { kicker: "Edited in Studio" },
  account: { hidden: true },
});

/**
 * The real `/` route under a bare root, beside a page to navigate away to.
 * Imported afresh each time, as on a new page: the browser's memory of the
 * copy (landing-loader.ts) starts empty.
 */
async function landingRouter() {
  vi.resetModules();
  const { Route: HomeRoute } = await import("@/routes/index");
  const root = createRootRoute({ component: Outlet });
  // What src/routeTree.gen.ts does for the app's own tree.
  const home = HomeRoute.update({
    id: "/",
    path: "/",
    getParentRoute: () => root,
  } as unknown as Parameters<typeof HomeRoute.update>[0]);
  const privacy = createRoute({
    getParentRoute: () => root,
    path: "/privacy",
    component: () => <p>Privacy</p>,
  });
  return createRouter({
    routeTree: root.addChildren([home, privacy]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
}

/**
 * Hydrates the router the way Start's client entry does, from the data the
 * server left in the page: `/` rendered with `content` at `renderedAt`.
 */
async function hydrateLanding(
  router: Awaited<ReturnType<typeof landingRouter>>,
  content: LandingContent,
  renderedAt: number,
) {
  const matches = router.matchRoutes(router.latestLocation).map((match) => ({
    i: match.id,
    s: "success" as const,
    u: renderedAt,
    ssr: true,
    ...(match.routeId === "/" ? { l: content } : {}),
  }));
  window.$_TSR = {
    router: { manifest: undefined, matches },
    buffer: [],
    h: () => {},
    e: () => {},
    c: () => {},
    p: (script) => script(),
  };
  await hydrate(router);
}

describe("the / route in a browser", () => {
  it("keeps the Studio copy it landed on when a later load fails, and asks again on the next visit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // The router resets the scroll position on navigation; jsdom can't scroll.
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const router = await landingRouter();
    // Rendered on the server ten minutes ago: past the five-minute staleTime,
    // so coming back to `/` loads the copy again.
    await hydrateLanding(router, STUDIO, Date.now() - 10 * 60_000);
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("From Studio")).toBeTruthy();
    expect(screen.queryByText(LANDING_FALLBACK.account.complianceTitle)).toBeNull();
    expect(getLandingContent).not.toHaveBeenCalled();

    // Away and back with the connection gone.
    await act(() => router.navigate({ to: "/privacy" }));
    getLandingContent.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(() => router.navigate({ to: "/" }));
    await waitFor(() => expect(getLandingContent).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("From Studio")).toBeTruthy();
    // Nothing the editor hid came back, and no edit reverted.
    expect(screen.queryByText(LANDING_FALLBACK.account.complianceTitle)).toBeNull();
    expect(screen.queryByText(LANDING_FALLBACK.hero.kicker)).toBeNull();

    // The next visit asks again, well inside the five minutes a successful
    // load would count as fresh.
    getLandingContent.mockResolvedValueOnce({ content: STUDIO_EDITED, source: "studio" });
    await act(() => router.navigate({ to: "/privacy" }));
    await act(() => router.navigate({ to: "/" }));
    await waitFor(() => expect(getLandingContent).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Edited in Studio")).toBeTruthy();
  });

  it("keeps the Studio copy it landed on when a new server instance has only the checked-in copy", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const router = await landingRouter();
    // Rendered by an instance holding Studio copy with the account card
    // hidden, ten minutes ago: coming back to `/` loads the copy again.
    await hydrateLanding(router, STUDIO, Date.now() - 10 * 60_000);
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("From Studio")).toBeTruthy();
    expect(screen.queryByText(LANDING_FALLBACK.account.complianceTitle)).toBeNull();

    // Sanity goes down, and the next navigation's call lands on a new
    // instance that never had a good read: a normal 200, the checked-in copy.
    await act(() => router.navigate({ to: "/privacy" }));
    getLandingContent.mockResolvedValueOnce({
      content: structuredClone(LANDING_FALLBACK),
      source: "fallback",
    });
    await act(() => router.navigate({ to: "/" }));
    await waitFor(() => expect(getLandingContent).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("From Studio")).toBeTruthy();
    // The account card, compliance line and all, stays hidden.
    expect(screen.queryByText(LANDING_FALLBACK.account.complianceTitle)).toBeNull();
    expect(screen.queryByText(LANDING_FALLBACK.account.heading)).toBeNull();
    expect(screen.queryByText(LANDING_FALLBACK.hero.kicker)).toBeNull();

    // Not counted as fresh: the next visit asks again, well inside the five
    // minutes, and takes the Studio copy it gets.
    getLandingContent.mockResolvedValueOnce({ content: STUDIO_EDITED, source: "studio" });
    await act(() => router.navigate({ to: "/privacy" }));
    await act(() => router.navigate({ to: "/" }));
    await waitFor(() => expect(getLandingContent).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Edited in Studio")).toBeTruthy();
    expect(screen.queryByText(LANDING_FALLBACK.account.complianceTitle)).toBeNull();

    // That one is fresh: the visit after it asks nothing.
    await act(() => router.navigate({ to: "/privacy" }));
    await act(() => router.navigate({ to: "/" }));
    expect(await screen.findByText("Edited in Studio")).toBeTruthy();
    expect(getLandingContent).toHaveBeenCalledTimes(2);
  });
});
