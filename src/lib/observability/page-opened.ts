/**
 * One "Page opened" per page a manager opens, named by its route template
 * (`/_app/manager/pass`) and never by its address, which can carry ids.
 */

/** The parts of a TanStack router this needs; the real router fits it. */
export type RouterLike = {
  getMatchedRoutes: (pathname: string) => readonly [ReadonlyArray<{ id: string }>, ...unknown[]];
  subscribe: (
    event: "onResolved",
    fn: (event: { toLocation: { pathname: string } }) => void,
  ) => () => void;
};

const ROOT_ROUTE_ID = "__root__";

/** The deepest matched route's id, e.g. `/_app/manager/people/$personId`. */
export function routeTemplate(routes: ReadonlyArray<{ id: string }>): string {
  const deepest = routes[routes.length - 1];
  return deepest && deepest.id !== ROOT_ROUTE_ID ? deepest.id : "(not found)";
}

/**
 * Reports the page the app opened on, then every resolved navigation to a
 * different path. A search change (a Schedule tab) or router.invalidate()
 * resolves on the same path and isn't a new page. The first page is
 * reported straight away because a server-rendered page can hydrate without
 * ever resolving on the client.
 * src: https://unpkg.com/@tanstack/router-core@1.171.34/dist/esm/load-client.js (hydrate skips onResolved) · 1.171.34 · 2026-10-12
 */
export function watchPagesOpened(
  router: RouterLike,
  initialPathname: string,
  report: (routeTemplate: string) => void,
): () => void {
  let current = initialPathname;
  report(routeTemplate(router.getMatchedRoutes(initialPathname)[0]));
  return router.subscribe("onResolved", ({ toLocation }) => {
    if (toLocation.pathname === current) return;
    current = toLocation.pathname;
    report(routeTemplate(router.getMatchedRoutes(current)[0]));
  });
}
