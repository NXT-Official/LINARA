import { describe, expect, it } from "vitest";

import { routeTemplate, watchPagesOpened, type RouterLike } from "./page-opened";

const ROOT = { id: "__root__" };
const ROUTES: Record<string, ReadonlyArray<{ id: string }>> = {
  "/manager/pass": [ROOT, { id: "/_app" }, { id: "/_app/manager" }, { id: "/_app/manager/pass" }],
  "/manager/schedule": [
    ROOT,
    { id: "/_app" },
    { id: "/_app/manager" },
    { id: "/_app/manager/schedule" },
  ],
  "/login": [ROOT, { id: "/login" }],
};

/** A router with the two parts watchPagesOpened uses: the route table and onResolved. */
function fakeRouter() {
  const listeners: Array<(event: { toLocation: { pathname: string } }) => void> = [];
  const router: RouterLike = {
    getMatchedRoutes: (pathname) => [ROUTES[pathname] ?? [ROOT], {}, undefined],
    subscribe: (_event, fn) => {
      listeners.push(fn);
      return () => listeners.splice(listeners.indexOf(fn), 1);
    },
  };
  const resolve = (pathname: string) => listeners.forEach((fn) => fn({ toLocation: { pathname } }));
  return { router, resolve, listeners };
}

describe("routeTemplate", () => {
  it("is the deepest route's id, never the address with its ids", () => {
    expect(routeTemplate(ROUTES["/manager/pass"] ?? [])).toBe("/_app/manager/pass");
    expect(routeTemplate([ROOT, { id: "/_app" }, { id: "/_app/manager/people/$personId" }])).toBe(
      "/_app/manager/people/$personId",
    );
  });

  it("says so when nothing but the root matched", () => {
    expect(routeTemplate([ROOT])).toBe("(not found)");
    expect(routeTemplate([])).toBe("(not found)");
  });
});

describe("watchPagesOpened", () => {
  it("reports the page the app opened on", () => {
    const { router } = fakeRouter();
    const opened: string[] = [];
    watchPagesOpened(router, "/manager/pass", (route) => opened.push(route));
    expect(opened).toEqual(["/_app/manager/pass"]);
  });

  it("reports each navigation to another page once it has resolved", () => {
    const { router, resolve } = fakeRouter();
    const opened: string[] = [];
    watchPagesOpened(router, "/login", (route) => opened.push(route));
    resolve("/manager/pass");
    resolve("/manager/schedule");
    resolve("/nowhere");
    expect(opened).toEqual([
      "/login",
      "/_app/manager/pass",
      "/_app/manager/schedule",
      "(not found)",
    ]);
  });

  it("doesn't report the same page again when only the search or a refresh resolves", () => {
    const { router, resolve } = fakeRouter();
    const opened: string[] = [];
    watchPagesOpened(router, "/manager/schedule", (route) => opened.push(route));
    // The first load after hydration, a tab switch (?tab=) and router.invalidate()
    // all resolve on the same path.
    resolve("/manager/schedule");
    resolve("/manager/schedule");
    expect(opened).toEqual(["/_app/manager/schedule"]);
  });

  it("stops reporting once unsubscribed", () => {
    const { router, resolve, listeners } = fakeRouter();
    const opened: string[] = [];
    const stop = watchPagesOpened(router, "/login", (route) => opened.push(route));
    stop();
    resolve("/manager/pass");
    expect(listeners).toHaveLength(0);
    expect(opened).toEqual(["/login"]);
  });
});
