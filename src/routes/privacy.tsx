import { createFileRoute } from "@tanstack/react-router";

import { PrivacyPolicy } from "@/features/legal/privacy-policy";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy policy | Linara" }] }),
  component: PrivacyPolicy,
});
