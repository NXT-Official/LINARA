import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { PantryPage } from "@/features/pantry/pages/pantry-page";

export const Route = createFileRoute("/_app/manager/pantry")({
  head: () => ({ meta: [{ title: "Pantry | Linara" }] }),
  component: ManagerPantryRoute,
  errorComponent: RouteError,
});

function ManagerPantryRoute() {
  return <PantryPage title="Pantry & groceries" />;
}
