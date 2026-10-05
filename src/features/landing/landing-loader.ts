import { isNotFound, isRedirect } from "@tanstack/react-router";

import {
  LANDING_FALLBACK,
  LANDING_FALLBACK_VERSION,
  type LandingContent,
  isLandingReply,
} from "@/features/landing/landing-content";
import { getLandingContent } from "@/features/landing/landing.actions";

/** Longest error text one log line carries. */
const LOGGED_ERROR_MAX = 200;

/**
 * "Name: message" on one line. Never the stack: one failed load is one line.
 * For a non-JSON error response the Start client throws the whole body as the
 * message (a proxy's HTML page), so it is flattened and cut short.
 */
function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > LOGGED_ERROR_MAX ? `${line.slice(0, LOGGED_ERROR_MAX)}…` : line;
}

export interface LandingRouteLoaderOptions {
  /**
   * True in a browser. Only a browser remembers copy: a server renders many
   * visitors, and the server function keeps its own last good copy.
   */
  browser: boolean;
  /**
   * The server function unless a test passes its own. Unknown on purpose:
   * what it resolves with is checked before the page gets it.
   */
  fetchContent?: () => Promise<unknown>;
}

export interface LandingRouteLoader {
  /** The `/` route's loader. Rejects only with a router redirect or not-found. */
  load: () => Promise<LandingContent>;
  /** Hands over the copy the server rendered the page with (browser only). */
  seed: (content: LandingContent) => void;
  /** The `/` route's shouldReload: true after a failed load, else the staleTime decides. */
  shouldReload: () => true | undefined;
}

/**
 * Loads the homepage copy for the `/` route. On the server the server
 * function runs in-process and never throws. On in-app navigation it is a
 * network call, and that can fail (offline, flaky mobile data in the helper
 * app's WebView). The homepage then renders the copy this browser last
 * received, so nothing an editor hid comes back and no edit reverts. It does
 * the same when a reply carries only the server's checked-in copy (source
 * "fallback": an instance with no good read, during a Sanity outage). Only a
 * browser that has received none renders the checked-in copy, hidden sections
 * and all: that is why LANDING_FALLBACK is in the client bundle. Either way
 * the visitor gets a homepage, not the root error screen, whose "Go home"
 * button would only run this loader again.
 */
export function createLandingRouteLoader({
  browser,
  fetchContent = () => getLandingContent(),
}: LandingRouteLoaderOptions): LandingRouteLoader {
  // Kept and served as copies: the router hands loader data to the page, and
  // nothing the page does to it may reach what a later failure serves.
  let remembered: LandingContent | undefined;
  let loadedHere = false;
  let lastLoadFailed = false;

  return {
    load: async () => {
      if (browser) loadedHere = true;
      try {
        const reply = await fetchContent();
        // The Start client resolves with whatever answered: a raw Response
        // for a non-JSON 2xx (a captive portal, a proxy's page), the body for
        // any other JSON. Either would crash the page, so it is a failure.
        // src: https://github.com/TanStack/router/blob/main/packages/start-client-core/src/client-rpc/serverFnFetcher.ts · @tanstack/start-client-core 1.170.34 · 2026-10-05
        if (!isLandingReply(reply)) {
          throw new TypeError(
            `Not landing content: ${Object.prototype.toString.call(reply).slice(8, -1)}`,
          );
        }
        if (browser) {
          // A server instance with no good read (new, while Sanity is down)
          // answers with the checked-in copy, as a normal reply. Copy this
          // browser holds is never worse and keeps hidden what an editor hid,
          // so with any in hand, that reply is a failed load.
          if (reply.source === "fallback" && remembered) {
            throw new Error("The server had no Studio copy to send");
          }
          remembered = structuredClone(reply.content);
          lastLoadFailed = false;
        }
        return reply.content;
      } catch (error) {
        // Redirects and not-founds are the router's control flow, not failures.
        // src: https://tanstack.com/router/v1/docs/framework/react/api/router/isRedirectFunction · @tanstack/react-router 1.170.41 · 2026-10-05
        // src: https://tanstack.com/router/v1/docs/framework/react/api/router/isNotFoundFunction · @tanstack/react-router 1.170.41 · 2026-10-05
        if (isRedirect(error) || isNotFound(error)) throw error;
        const fallback = `fallback copy v${LANDING_FALLBACK_VERSION}`;
        const failure = `[landing] Could not load the homepage copy (${describeError(error)})`;
        if (browser) {
          lastLoadFailed = true;
          // Usually the visitor's connection, so a warning.
          console.warn(
            `${failure}; showing ${remembered ? "the copy this browser last received" : fallback}.`,
          );
        } else {
          // The server function runs in-process and is built never to throw:
          // this is a bug, and every visitor is getting the checked-in copy.
          console.error(`${failure}; serving ${fallback}.`);
        }
        return structuredClone(remembered ?? LANDING_FALLBACK);
      }
    },
    seed: (content) => {
      // Only the copy the server rendered the page with. Once this browser
      // has loaded `/` itself, the page shows that load's result, which can be
      // a fallback, not copy it received.
      if (browser && !loadedHere) remembered = structuredClone(content);
    },
    // The router keeps whatever a load resolved with fresh for the route's
    // staleTime, a fallback included. true makes the next visit load again;
    // undefined leaves the staleTime in charge (router-core 1.171.34,
    // createLoaderTask). Never false: that would turn the staleTime off.
    // src: https://tanstack.com/router/v1/docs/framework/react/api/router/RouteOptionsType#shouldreload-property · @tanstack/react-router 1.170.41 · 2026-10-05
    shouldReload: () => (lastLoadFailed ? true : undefined),
  };
}

// One per JavaScript realm. In a browser that is the open page, which keeps
// its copy until it is closed; on the server `browser` is false, so the
// module-level instance holds nothing between visitors.
const forThisPage = createLandingRouteLoader({ browser: typeof document !== "undefined" });

/** The `/` route's loader. */
export const loadLandingForRoute = forThisPage.load;
/** The `/` route's shouldReload. */
export const landingShouldReload = forThisPage.shouldReload;
/** Called by the `/` page with the copy it was rendered with. */
export const seedLandingContent = forThisPage.seed;
