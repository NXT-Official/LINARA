import { createFileRoute } from "@tanstack/react-router";

import { ManagerAuthFlow } from "@/features/people/components/manager-auth-flow";

type LoginSearch = { mode?: "signup" };

// Opens on Log in; `?mode=signup` (the app's "New manager? Set up your
// household" link) opens on Set up your household instead.
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch =>
    search.mode === "signup" ? { mode: "signup" } : {},
  component: LoginPage,
});

function LoginPage() {
  const { mode } = Route.useSearch();
  return <ManagerAuthFlow initialMode={mode === "signup" ? "signup" : "login"} />;
}
