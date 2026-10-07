import { createFileRoute, redirect } from "@tanstack/react-router";

import { ManagerAuthFlow } from "@/features/people/components/manager-auth-flow";

type LoginSearch = { mode?: "signup"; sent?: boolean };

// Log in only; signing up is /signup. `?mode=signup` is kept because the
// app's "New manager? Set up your household" WebView still opens it
// (LINARA_MOBILE app/manager.tsx). `?sent=true` is where sign-up lands while
// the confirmation email is on its way.
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    mode: search.mode === "signup" ? "signup" : undefined,
    sent: search.sent === true ? true : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.mode === "signup") {
      throw redirect({ to: "/signup", search: { step: "household" }, replace: true });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { sent } = Route.useSearch();
  return <ManagerAuthFlow page="login" confirmationSent={sent} />;
}
