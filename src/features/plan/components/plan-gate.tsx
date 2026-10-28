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

/** Shows its children when the plan includes the feature, a quiet lock when it doesn't. */
export function PlanGate({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const { subscription } = usePlan();
  if (hasFeature(subscription, feature)) return <>{children}</>;
  const f = FEATURES.find((x) => x.key === feature);
  const from = cheapestPlanWith(feature);
  return (
    <section
      role="status"
      className="flex items-start gap-3 rounded-3xl border border-dashed border-border bg-card/40 p-5 sm:p-7"
    >
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {f?.name ?? "This feature"} isn't on your plan
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {from ? `It's included from ${from.name}. ` : ""}Anything saved before stays.
        </p>
        <Link
          to="/manager/plan"
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          See your plan
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
          Add one for {formatCentavos(addon.monthlyPrice)} a month
        </Link>
      ) : (
        <Link to="/manager/plan" className={link}>
          See your plan
        </Link>
      )}
    </p>
  );
}
