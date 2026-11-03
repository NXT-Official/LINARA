import { currentT } from "@/lib/i18n/current-t";
import { createFileRoute } from "@tanstack/react-router";

import { TermsOfService } from "@/features/legal/terms-of-service";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: currentT()("pages.titleTerms") }] }),
  component: TermsOfService,
});
