import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { usePlanUsage } from "../hooks/use-plan-usage";
import { overLimits, planById } from "../plan.logic";
import { usePlan } from "../plan.store";

/** One line on People: which plan, anything that needs a look, and the way to it. */
export function PlanSummary() {
  const { subscription: sub } = usePlan();
  const usage = usePlanUsage();
  const name = planById(sub.planId)?.name ?? "Unknown plan";
  const over = overLimits(sub, usage).length > 0;
  const note =
    sub.status === "restricted"
      ? "Payment overdue"
      : sub.status === "past_due"
        ? "Payment didn't go through"
        : over
          ? "Over the plan's limits"
          : null;

  return (
    <Link
      to="/manager/plan"
      className="group flex min-h-14 items-center justify-between gap-3 rounded-3xl bg-card px-5 py-4 shadow-soft transition-colors duration-150 ease-out hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-7"
    >
      <span className="min-w-0">
        <span className="block font-display text-lg text-foreground">Your plan: {name}</span>
        <span className="block text-xs text-muted-foreground">
          {note ?? "Prices, limits and what's included."}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {note ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${sub.status === "restricted" ? "bg-status-late-soft text-status-late-ink" : "bg-terracotta-soft text-hearth-ink"}`}
          >
            Needs a look
          </span>
        ) : null}
        <ChevronRight
          className="size-4 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden
        />
      </span>
    </Link>
  );
}
