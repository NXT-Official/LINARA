import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createClientOnlyFn } from "@tanstack/react-start";

import { initClientSentry, reportCaughtError } from "./lib/observability/sentry.client";
import { routeTree } from "./routeTree.gen";

// Browser-only (a *.client file): this keeps it out of the server bundle.
const startSentry = createClientOnlyFn(initClientSentry);
const reportToSentry = createClientOnlyFn(reportCaughtError);

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Every route's error component (the root's and RouteError) shows an
    // error the router caught, which never reaches window.onerror.
    defaultOnCatch: (error) => {
      if (!router.isServer) reportToSentry(error);
    },
  });

  if (!router.isServer) startSentry(router);

  return router;
};
