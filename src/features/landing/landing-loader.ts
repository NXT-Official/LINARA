import { isNotFound, isRedirect } from "@tanstack/react-router";

import { LANDING_FALLBACK, type LandingContent } from "@/features/landing/landing-content";
import { getLandingContent } from "@/features/landing/landing.actions";

/**
 * Loader for `/`. On the server the server function runs in-process and
 * never throws. On in-app navigation it is a network call, and that can fail
 * (offline, flaky mobile data in the helper app's WebView). The homepage
 * renders the checked-in copy then, instead of the root error screen, whose
 * "Go home" button would only run this loader again.
 */
export async function loadLandingForRoute(
  fetchContent: () => Promise<LandingContent> = () => getLandingContent(),
): Promise<LandingContent> {
  try {
    return await fetchContent();
  } catch (error) {
    // Redirects and not-founds are the router's control flow, not failures.
    // src: https://tanstack.com/router/v1/docs/framework/react/api/router/isRedirectFunction · @tanstack/react-router 1.170.41 · 2026-10-05
    // src: https://tanstack.com/router/v1/docs/framework/react/api/router/isNotFoundFunction · @tanstack/react-router 1.170.41 · 2026-10-05
    if (isRedirect(error) || isNotFound(error)) throw error;
    return LANDING_FALLBACK;
  }
}
