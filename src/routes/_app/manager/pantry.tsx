import { createFileRoute } from "@tanstack/react-router";

import { PantryPage } from "@/features/pantry/pages/pantry-page";

export const Route = createFileRoute("/_app/manager/pantry")({
  component: ManagerPantryRoute,
});

function ManagerPantryRoute() {
  return <PantryPage title="Pantry & groceries" />;
}
