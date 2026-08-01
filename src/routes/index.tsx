import { createFileRoute, redirect } from "@tanstack/react-router";

/** There is no separate landing page — the household opens on the manager's Pass. */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/manager/pass" });
  },
});
