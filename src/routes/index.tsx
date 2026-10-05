import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { landingHead } from "@/features/landing/landing-content";
import {
  landingShouldReload,
  loadLandingForRoute,
  seedLandingContent,
} from "@/features/landing/landing-loader";
import { LandingView } from "@/features/landing/landing-view";

export const Route = createFileRoute("/")({
  // Always resolves with copy to render. On any Sanity problem the server
  // function serves the last good Studio copy, or the checked-in copy when it
  // has none. When the call itself fails (in-app navigation with no
  // connection) or answers with something that is not landing content,
  // loadLandingForRoute serves the copy this browser last received, or the
  // checked-in copy when it has none. So this loader can neither 500 the page
  // nor send it to the error screen.
  // Only a router redirect or not-found passes through.
  loader: () => loadLandingForRoute(),
  // A failed load is not fresh: the next visit asks again.
  shouldReload: () => landingShouldReload(),
  staleTime: 5 * 60 * 1000,
  // Studio-edited SEO; the deepest route's tags win over __root's defaults.
  head: ({ loaderData }) => landingHead(loaderData),
  component: LandingPage,
});

function LandingPage() {
  const content = Route.useLoaderData();

  // On the first render after hydration this is the copy the server rendered
  // the page with: the browser keeps it for a later load that fails. Effects
  // never run on the server.
  useEffect(() => seedLandingContent(content), [content]);

  // Password-reset emails land here when the sender passed no redirect (the
  // Supabase Site URL default, e.g. from a LINARA_MOBILE build without
  // EXPO_PUBLIC_WEB_APP_URL). Hand the recovery fragment to the reset page.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("error_code=otp_expired")) {
      window.location.replace(`/reset-password${hash}`);
    }
  }, []);

  return <LandingView content={content} />;
}
