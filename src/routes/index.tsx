import { createFileRoute } from "@tanstack/react-router";

import { LinaraApp } from "@/features/dashboard/components/linara-app";

export const Route = createFileRoute("/")({
  component: LinaraApp,
});
