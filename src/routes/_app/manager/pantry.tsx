import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { PantryPage } from "@/features/pantry/pages/pantry-page";
import { PlanGate } from "@/features/plan/components/plan-gate";
import { useT } from "@/lib/i18n/locale-context";

export const Route = createFileRoute("/_app/manager/pantry")({
  head: () => ({ meta: [{ title: "Pantry | Linara" }] }),
  component: ManagerPantryRoute,
  errorComponent: RouteError,
});

function ManagerPantryRoute() {
  const t = useT();
  return (
    <PlanGate feature="pantry">
      <PantryPage title={t("pages.pantryGroceries")} />
    </PlanGate>
  );
}
