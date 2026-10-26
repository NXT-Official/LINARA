import { useSyncExternalStore } from "react";

import { checkSelection, planById, quote, type SelectionCheck } from "./plan.logic";
import { SAMPLE_SUBSCRIPTION } from "./plan.sample";
import type { ActiveSelection, AddonLine, Cycle, MySubscription, SubStatus } from "./plan.types";

/**
 * The manager's sample plan, in this tab's memory only: it goes back to the
 * sample on reload and is never written anywhere. Billing isn't live; this
 * is what the screens will read once it is.
 */
type PlanState = { subscription: MySubscription; selection: ActiveSelection | null };

let state: PlanState = { subscription: SAMPLE_SUBSCRIPTION, selection: null };
const listeners = new Set<() => void>();

function set(next: PlanState) {
  state = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlan(): PlanState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export type ChangeResult = { ok: true } | { ok: false; message: string };

/** A plan change as the sample shows it: starts today, nothing is charged. */
export function changePlan(planId: string, cycle: Cycle, addons: AddonLine[]): ChangeResult {
  const q = quote(planId, cycle, addons);
  if (!q.ok) return q;
  const plan = planById(planId);
  if (!plan) return { ok: false, message: "That plan isn't offered." };
  const lines = addons.filter((a) => a.quantity > 0);
  const s = state.subscription;
  if (
    s.planId === planId &&
    s.cycle === cycle &&
    JSON.stringify(s.addons) === JSON.stringify(lines) &&
    s.status !== "restricted"
  ) {
    return { ok: false, message: "That's the plan you already have." };
  }
  const end = new Date();
  end.setUTCMonth(end.getUTCMonth() + (cycle === "annual" ? 12 : 1));
  set({
    subscription: {
      planId,
      planVersion: plan.version,
      cycle,
      addons: lines,
      status: "active",
      cancelAtPeriodEnd: false,
      periodEnd: q.amount > 0 && cycle !== "one_time" ? end.toISOString() : null,
    },
    selection: null,
  });
  return { ok: true };
}

/** Preview only: see the screens as a household on another status would. */
export function previewStatus(status: SubStatus) {
  set({ ...state, subscription: { ...state.subscription, status }, selection: null });
}

export function saveSelection(
  selection: ActiveSelection,
  available: { households: string[]; kasambahay: string[] },
): SelectionCheck {
  const check = checkSelection(state.subscription, selection, available);
  if (check.ok) set({ ...state, selection });
  return check;
}

export function resetPlan() {
  set({ subscription: SAMPLE_SUBSCRIPTION, selection: null });
}
