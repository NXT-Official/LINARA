import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { RouteError } from "@/components/shared/route-error";
import { MyPlanPage } from "@/features/plan/pages/my-plan-page";
import { ADDONS, CATALOG } from "@/features/plan/plan.sample";

type PlanSearch = {
  /** An add-on to start buying, from a limit message ("Add one"). */
  addon?: string;
  /** A plan to upgrade to, from a locked feature ("Upgrade to Normal"). */
  upgrade?: string;
  /** Back from Xendit's page with this payment (billing-checkout). */
  payment?: string;
  /** Which way Xendit sent them back: "paid" (success page) or "failed". */
  result?: "paid" | "failed";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_app/manager/plan")({
  validateSearch: (search: Record<string, unknown>): PlanSearch => ({
    addon: ADDONS.some((a) => a.id === search.addon) ? (search.addon as string) : undefined,
    upgrade:
      typeof search.upgrade === "string" && CATALOG.some((p) => p.id === search.upgrade)
        ? search.upgrade
        : undefined,
    payment:
      typeof search.payment === "string" && UUID.test(search.payment) ? search.payment : undefined,
    result: search.result === "paid" || search.result === "failed" ? search.result : undefined,
  }),
  head: () => ({ meta: [{ title: "Your plan | Linara" }] }),
  component: ManagerPlanRoute,
  errorComponent: RouteError,
});

function ManagerPlanRoute() {
  const { addon, upgrade, payment, result } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const clearAddon = useCallback(() => {
    void navigate({ search: (s) => ({ ...s, addon: undefined }), replace: true });
  }, [navigate]);
  const clearUpgrade = useCallback(() => {
    void navigate({ search: (s) => ({ ...s, upgrade: undefined }), replace: true });
  }, [navigate]);
  const clearPayment = useCallback(() => {
    void navigate({
      search: (s) => ({ ...s, payment: undefined, result: undefined }),
      replace: true,
    });
  }, [navigate]);
  return (
    <MyPlanPage
      buyAddon={addon}
      onBuyAddonUsed={clearAddon}
      upgradeTo={upgrade}
      onUpgradeUsed={clearUpgrade}
      paymentId={payment}
      paymentResult={result}
      onPaymentSeen={clearPayment}
    />
  );
}
