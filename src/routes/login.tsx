import { createFileRoute } from "@tanstack/react-router";

import { ManagerAuthFlow } from "@/features/people/components/manager-auth-flow";

export const Route = createFileRoute("/login")({
  component: ManagerAuthFlow,
});
