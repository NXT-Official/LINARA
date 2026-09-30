import { createFileRoute } from "@tanstack/react-router";

import { PasswordResetFlow } from "@/features/people/components/password-reset-flow";

export const Route = createFileRoute("/reset-password")({
  component: PasswordResetFlow,
});
