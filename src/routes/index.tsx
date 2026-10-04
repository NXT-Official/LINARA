import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { landingHead } from "@/features/landing/landing-content";
import { getLandingContent } from "@/features/landing/landing.actions";
import { LandingView } from "@/features/landing/landing-view";

export const Route = createFileRoute("/")({
  // Never throws (fallback copy on any Sanity problem), so the page can't 500.
  loader: () => getLandingContent(),
  staleTime: 5 * 60 * 1000,
  // Studio-edited SEO; the deepest route's tags win over __root's defaults.
  head: ({ loaderData }) => landingHead(loaderData),
  component: LandingPage,
});

function LandingPage() {
  const content = Route.useLoaderData();

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
