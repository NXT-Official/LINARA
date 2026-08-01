import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { PantryPage } from "@/features/pantry/pages/pantry-page";

export const Route = createFileRoute("/_app/helper/pantry")({
  head: () => ({ meta: [{ title: "Pantry | Linara" }] }),
  component: PantryPage,
  errorComponent: RouteError,
});
