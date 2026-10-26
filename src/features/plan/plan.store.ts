import { useSyncExternalStore } from "react";

import { checkSelection, planById, quote, type SelectionCheck } from "./plan.logic";
import { SAMPLE_SUBSCRIPTION } from "./plan.sample";
import type { ActiveSelection, AddonLine, Cycle, MySubscription, SubStatus } from "./plan.types";

/**
 * The manager's sample plan, in this tab's memory only: it goes back to the
 * sample on reload and is never written anywhere. Billing isn't live; this
 * is what the screens will read once it is.
 */
export const PAYMENT_METHODS = ["gcash", "maya", "card", "qrph", "otc", "card_decline"] as const;
/** Xendit's channels for the Philippines, plus a test card that always declines. */
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const METHOD_LABEL: Record<PaymentMethod, { name: string; hint: string }> = {
  gcash: { name: "GCash", hint: "Pay from the GCash app." },
  maya: { name: "Maya", hint: "Pay from the Maya app." },
  card: { name: "Credit or debit card", hint: "Visa or Mastercard." },
  qrph: { name: "QR Ph", hint: "Scan with any bank or e-wallet app." },
  otc: { name: "Over the counter", hint: "7-Eleven, Cebuana and others." },
  card_decline: {
    name: "Test card that declines",
    hint: "For trying a failed payment.",
  },
};

export type SamplePayment = {
  id: string;
  reference: string;
  planId: string;
  cycle: Cycle;
  /** Centavos. */
  amount: number;
  method: PaymentMethod;
  status: "paid" | "failed";
  at: string;
  failureReason: string | null;
};

type PlanState = {
  subscription: MySubscription;
  selection: ActiveSelection | null;
  /** Newest first. */
  payments: SamplePayment[];
};

let state: PlanState = { subscription: SAMPLE_SUBSCRIPTION, selection: null, payments: [] };
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

/** The plan, cycle and add-ons it already has, and nothing is owed on it. */
export function isCurrentPlan(planId: string, cycle: Cycle, addons: AddonLine[]): boolean {
  const s = state.subscription;
  const lines = addons.filter((a) => a.quantity > 0);
  return (
    s.planId === planId &&
    s.cycle === cycle &&
    JSON.stringify(s.addons) === JSON.stringify(lines) &&
    s.status !== "restricted" &&
    s.status !== "past_due"
  );
}

/** A plan change as the sample shows it: starts today, nothing is charged. */
export function changePlan(planId: string, cycle: Cycle, addons: AddonLine[]): ChangeResult {
  const q = quote(planId, cycle, addons);
  if (!q.ok) return q;
  const plan = planById(planId);
  if (!plan) return { ok: false, message: "That plan isn't offered." };
  const lines = addons.filter((a) => a.quantity > 0);
  if (isCurrentPlan(planId, cycle, addons)) {
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
    payments: state.payments,
  });
  return { ok: true };
}

/** How long a sample payment takes to "go through", so the waiting state shows. */
export const PROCESSING_MS = 900;
let paying = false;

export type PayResult = { ok: true; payment: SamplePayment } | { ok: false; message: string };

/**
 * A sample payment: waits a moment, then succeeds and moves the household to
 * the plan, without charging anything. The test card always declines, so the
 * failure path can be tried; a declined payment changes nothing but the
 * history. A second tap while one is going through is refused.
 */
export async function payForPlan(
  planId: string,
  cycle: Cycle,
  addons: AddonLine[],
  method: PaymentMethod,
): Promise<PayResult> {
  if (paying) return { ok: false, message: "A payment is already going through." };
  if (!PAYMENT_METHODS.includes(method)) return { ok: false, message: "Choose how to pay." };
  const q = quote(planId, cycle, addons);
  if (!q.ok) return q;
  if (q.amount === 0) return { ok: false, message: "Nothing to pay on this plan." };
  if (isCurrentPlan(planId, cycle, addons)) {
    return { ok: false, message: "That's the plan you already have." };
  }
  paying = true;
  try {
    await new Promise((r) => setTimeout(r, PROCESSING_MS));
    const declined = method === "card_decline";
    const payment: SamplePayment = {
      id: `sample-${state.payments.length + 1}`,
      reference: `SAMPLE-${String(1001 + state.payments.length)}`,
      planId,
      cycle,
      amount: q.amount,
      method,
      status: declined ? "failed" : "paid",
      at: new Date().toISOString(),
      failureReason: declined ? "The card was declined." : null,
    };
    if (declined) {
      set({ ...state, payments: [payment, ...state.payments] });
      return { ok: false, message: "The card was declined. Nothing was charged; try another way." };
    }
    const end = new Date();
    end.setUTCMonth(end.getUTCMonth() + (cycle === "annual" ? 12 : 1));
    set({
      subscription: {
        planId,
        planVersion: planById(planId)?.version ?? 1,
        cycle,
        addons: addons.filter((a) => a.quantity > 0),
        status: "active",
        cancelAtPeriodEnd: false,
        periodEnd: cycle === "one_time" ? null : end.toISOString(),
      },
      selection: null,
      payments: [payment, ...state.payments],
    });
    return { ok: true, payment };
  } finally {
    paying = false;
  }
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
  paying = false;
  set({ subscription: SAMPLE_SUBSCRIPTION, selection: null, payments: [] });
}
