import { currentT } from "@/lib/i18n/current-t";
import { createFileRoute } from "@tanstack/react-router";

import { PrivacyPolicy } from "@/features/legal/privacy-policy";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: currentT()("pages.titlePrivacy") }] }),
  component: PrivacyPolicy,
});
