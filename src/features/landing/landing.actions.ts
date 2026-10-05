import { createServerFn } from "@tanstack/react-start";

import {
  type LandingContent,
  type LandingContentLoader,
  createLandingContentLoader,
  sanityTargetFromEnv,
} from "@/features/landing/landing-content";

// One loader per server instance: it remembers the last good Studio copy and
// backs off after a failed read. Built on the first request, not at import,
// so the env is still read at request time.
let loader: LandingContentLoader | undefined;

/**
 * Landing copy from the LINARA Sanity Studio. Never throws: no config, an
 * outage or an unpublished document render the last good Studio copy this
 * instance read, or the checked-in copy when it has none.
 * Server-only so the project config never reaches the client bundle.
 */
export const getLandingContent = createServerFn({ method: "GET" }).handler(
  async (): Promise<LandingContent> => {
    loader ??= createLandingContentLoader({ target: sanityTargetFromEnv(process.env) });
    return loader();
  },
);
