import { createServerFn } from "@tanstack/react-start";

import {
  type LandingContentLoader,
  type LandingReply,
  createLandingContentLoader,
  sanityTargetFromEnv,
} from "@/features/landing/landing-content";

// One loader per server instance: it remembers the last good Studio copy and
// backs off after a failed read. Built on the first request, not at import,
// so the env is still read at request time.
let loader: LandingContentLoader | undefined;

/**
 * Landing copy from the LINARA Sanity Studio, and where it came from. Never
 * throws: no config, an outage or an unpublished document render the last
 * good Studio copy this instance read, or the checked-in copy when it has
 * none. The source lets a browser keep copy of its own over a new instance's
 * checked-in copy (landing-loader.ts).
 * Server-only so the project config never reaches the client bundle.
 */
export const getLandingContent = createServerFn({ method: "GET" }).handler(
  async (): Promise<LandingReply> => {
    loader ??= createLandingContentLoader({ target: sanityTargetFromEnv(process.env) });
    return loader();
  },
);
