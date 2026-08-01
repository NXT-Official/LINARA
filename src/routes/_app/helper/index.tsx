import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/helper/")({
  beforeLoad: () => {
    throw redirect({ to: "/helper/today" });
  },
});
