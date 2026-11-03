import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import { inMobileApp } from "@/lib/mobile-app";

import {
  addonFor,
  addonsBlocked,
  cheapestPlanWith,
  formatCentavos,
  hasFeature,
  type AddCheck,
} from "../plan.logic";
import { FEATURES } from "../plan.sample";
import { usePlan } from "../plan.store";
import type { FeatureKey } from "../plan.types";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

/**
 * Shows its children when the plan includes the feature, a quiet lock when it
 * doesn't. The primary manager gets the upgrade in one tap: Your plan opens
 * Change plan with the cheapest plan that has it picked. Inside the Android
 * app, and for a co-manager, it only points at the plan.
 */
export function PlanGate({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const t = useT();
  const { subscription, owner } = usePlan();
  if (hasFeature(subscription, feature)) return <>{children}</>;
  const f = FEATURES.find((x) => x.key === feature);
  const from = cheapestPlanWith(feature);
  const canUpgrade = !!from && owner && !inMobileApp();
  return (
    <section
      role="status"
      className="flex items-start gap-3 rounded-3xl border border-dashed border-border bg-card/40 p-5 sm:p-7"
    >
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {t("plan.isntOnYourPlan", { name: f?.name ?? t("plan.thisFeature") })}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {from
            ? t("plan.includedFromSavedStays", { plan: from.name })
            : t("plan.anythingSavedStays")}
        </p>
        <Link
          to="/manager/plan"
          search={canUpgrade && from ? { upgrade: from.id } : undefined}
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {canUpgrade && from ? t("plan.upgradeTo", { plan: from.name }) : t("plan.seeYourPlan")}
        </Link>
      </div>
    </section>
  );
}

/**
 * Why an add button is off, with the way out: buying one more as an add-on
 * when that's what's missing and the plan takes add-ons, otherwise the plan.
 * Renders nothing when it fits.
 */
export function LimitNotice({ check, className = "" }: { check: AddCheck; className?: string }) {
  const t = useT();
  const { subscription } = usePlan();
  if (check.ok) return null;
  const addon = check.reason === "limit" && check.limitKey ? addonFor(check.limitKey) : undefined;
  const canBuy = !!addon && !addonsBlocked(subscription) && !inMobileApp();
  const link =
    "font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <p
      role="status"
      className={`rounded-xl px-3 py-2 text-sm ${check.reason === "restricted" ? "bg-status-late-soft text-status-late-ink" : "bg-terracotta-soft text-hearth-ink"} ${className}`}
    >
      {check.message}{" "}
      {canBuy && addon ? (
        <Link to="/manager/plan" search={{ addon: addon.id }} className={link}>
          {richText(t("plan.addOneForAMonth"), { value: formatCentavos(addon.monthlyPrice) })}
        </Link>
      ) : (
        <Link to="/manager/plan" className={link}>
          {t("plan.seeYourPlan")}
        </Link>
      )}
    </p>
  );
}
