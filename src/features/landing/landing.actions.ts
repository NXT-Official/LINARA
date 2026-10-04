import { createServerFn } from "@tanstack/react-start";

import {
  type LandingContent,
  loadLandingContent,
  sanityTargetFromEnv,
} from "@/features/landing/landing-content";

/**
 * Landing copy from the LINARA Sanity Studio. Never throws: no config, an
 * outage or an unpublished document all render the checked-in copy.
 * Server-only so the project config never reaches the client bundle.
 */
export const getLandingContent = createServerFn({ method: "GET" }).handler(
  async (): Promise<LandingContent> =>
    loadLandingContent({ target: sanityTargetFromEnv(process.env) }),
);
