import { useSyncExternalStore } from "react";

import { addonChange, checkSelection, planById, quote, type SelectionCheck } from "./plan.logic";
import { SAMPLE_SUBSCRIPTION } from "./plan.sample";
import {
  SUB_STATUSES,
  type ActiveSelection,
  type AddonLine,
  type Cycle,
  type MySubscription,
  type SubStatus,
} from "./plan.types";

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
  /** A plan (change or what's owed) or add-ons bought on the plan it has. */
  kind: "plan" | "addons";
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

/**
 * The manager's sample plan. Billing isn't live; this is what the screens
 * will read once it is. The plan belongs to the manager's account, not to a
 * household, so it's kept per account in this browser: switching household
 * reloads the page, and the plan has to be the same after it. It never
 * leaves the browser, and anything saved that doesn't read back as a valid
 * plan is ignored in favour of the sample.
 */
const SAMPLE_STATE: PlanState = {
  subscription: SAMPLE_SUBSCRIPTION,
  selection: null,
  payments: [],
};
const MAX_SAVED_PAYMENTS = 200;
const storageKey = (accountId: string) => `linara_plan_preview:${accountId}`;

let state: PlanState = SAMPLE_STATE;
/** Whose plan is loaded; null before sign-in (nothing is saved then). */
let accountId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function save() {
  if (!accountId) return;
  try {
    window.localStorage.setItem(storageKey(accountId), JSON.stringify(state));
  } catch {
    // Storage full or blocked: the plan still works for this page.
  }
}

function set(next: PlanState) {
  state = next;
  save();
  emit();
}

const isString = (v: unknown): v is string => typeof v === "string";
const isIsoDate = (v: unknown) => isString(v) && !Number.isNaN(Date.parse(v));
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function readSubscription(v: unknown): MySubscription | null {
  if (!isRecord(v)) return null;
  const { planId, planVersion, cycle, addons, status, cancelAtPeriodEnd, periodEnd } = v;
  if (!isString(planId) || !planById(planId)) return null;
  if (cycle !== "monthly" && cycle !== "annual" && cycle !== "one_time") return null;
  if (!Array.isArray(addons)) return null;
  const lines: AddonLine[] = [];
  for (const a of addons) {
    if (!isRecord(a) || !isString(a.addonId) || typeof a.quantity !== "number") return null;
    lines.push({ addonId: a.addonId, quantity: a.quantity });
  }
  // The same check a real change goes through: a priced cycle, add-ons in range.
  if (!quote(planId, cycle, lines).ok) return null;
  if (!SUB_STATUSES.includes(status as SubStatus)) return null;
  if (typeof cancelAtPeriodEnd !== "boolean") return null;
  if (periodEnd !== null && !isIsoDate(periodEnd)) return null;
  if (typeof planVersion !== "number" || !Number.isInteger(planVersion) || planVersion < 1) {
    return null;
  }
  return {
    planId,
    planVersion,
    cycle,
    addons: lines,
    status: status as SubStatus,
    cancelAtPeriodEnd,
    periodEnd: periodEnd as string | null,
  };
}

function readSelection(v: unknown): ActiveSelection | null | undefined {
  if (v === null) return null;
  if (!isRecord(v)) return undefined;
  const { households, kasambahay } = v;
  if (!Array.isArray(households) || !households.every(isString)) return undefined;
  if (!Array.isArray(kasambahay) || !kasambahay.every(isString)) return undefined;
  return { households, kasambahay };
}

function readPayment(v: unknown): SamplePayment | null {
  if (!isRecord(v)) return null;
  const {
    id,
    kind = "plan",
    reference,
    planId,
    cycle,
    amount,
    method,
    status,
    at,
    failureReason,
  } = v;
  if (kind !== "plan" && kind !== "addons") return null;
  if (!isString(id) || !isString(reference) || !isString(planId) || !isIsoDate(at)) return null;
  if (cycle !== "monthly" && cycle !== "annual" && cycle !== "one_time") return null;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) return null;
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) return null;
  if (status !== "paid" && status !== "failed") return null;
  if (failureReason !== null && !isString(failureReason)) return null;
  return {
    id,
    kind,
    reference,
    planId,
    cycle,
    amount,
    method: method as PaymentMethod,
    status,
    at: at as string,
    failureReason: failureReason as string | null,
  };
}

/** What's saved for an account, or null when there's nothing usable. */
function readSaved(id: string): PlanState | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(storageKey(id));
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const subscription = readSubscription(parsed.subscription);
  const selection = readSelection(parsed.selection);
  if (!subscription || selection === undefined || !Array.isArray(parsed.payments)) return null;
  const payments: SamplePayment[] = [];
  for (const p of parsed.payments.slice(0, MAX_SAVED_PAYMENTS)) {
    const payment = readPayment(p);
    if (!payment) return null;
    payments.push(payment);
  }
  return { subscription, selection, payments };
}

/**
 * Loads the signed-in manager's plan (ManagerShell calls it as the session
 * resolves). Another account gets its own; signed out shows the sample.
 */
export function loadPlanFor(id: string | null) {
  if (id === accountId) return;
  accountId = id;
  paying = false;
  state = (id && readSaved(id)) || SAMPLE_STATE;
  emit();
}

/** The current state, for code outside React. */
export function getPlanState(): PlanState {
  return state;
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
      kind: "plan",
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
/**
 * Buys add-ons on the plan it has, as a sample: charges the added ones for
 * the period that's running and keeps the plan and its renewal date. The
 * test card declines; a second tap while one is going through is refused.
 */
export async function payForAddons(lines: AddonLine[], method: PaymentMethod): Promise<PayResult> {
  if (paying) return { ok: false, message: "A payment is already going through." };
  if (!PAYMENT_METHODS.includes(method)) return { ok: false, message: "Choose how to pay." };
  const change = addonChange(state.subscription, lines);
  if (!change.ok) return change;
  if (change.dueNow === 0) return { ok: false, message: "Nothing to pay for this change." };
  paying = true;
  try {
    await new Promise((r) => setTimeout(r, PROCESSING_MS));
    const sub = state.subscription;
    // The plan may have changed while this was going through.
    const again = addonChange(sub, lines);
    if (!again.ok) return again;
    const declined = method === "card_decline";
    const payment: SamplePayment = {
      id: `sample-${state.payments.length + 1}`,
      kind: "addons",
      reference: `SAMPLE-${String(1001 + state.payments.length)}`,
      planId: sub.planId,
      cycle: sub.cycle,
      amount: again.dueNow,
      method,
      status: declined ? "failed" : "paid",
      at: new Date().toISOString(),
      failureReason: declined ? "The card was declined." : null,
    };
    if (declined) {
      set({ ...state, payments: [payment, ...state.payments] });
      return { ok: false, message: "The card was declined. Nothing was charged; try another way." };
    }
    set({
      ...state,
      subscription: { ...sub, addons: lines.filter((l) => l.quantity > 0) },
      payments: [payment, ...state.payments],
    });
    return { ok: true, payment };
  } finally {
    paying = false;
  }
}

/** Removes add-ons (nothing to pay, nothing refunded). Refuses a change that costs more. */
export function removeAddons(lines: AddonLine[]): ChangeResult {
  const change = addonChange(state.subscription, lines);
  if (!change.ok) return change;
  if (change.dueNow > 0) return { ok: false, message: "That adds add-ons: pay for them first." };
  set({
    ...state,
    subscription: { ...state.subscription, addons: lines.filter((l) => l.quantity > 0) },
  });
  return { ok: true };
}

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
  if (accountId) {
    try {
      window.localStorage.removeItem(storageKey(accountId));
    } catch {
      // Blocked storage: nothing was saved there either.
    }
  }
  state = SAMPLE_STATE;
  emit();
}
