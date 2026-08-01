import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/manager/")({
  beforeLoad: () => {
    throw redirect({ to: "/manager/pass" });
  },
});
