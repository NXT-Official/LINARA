import { useSyncExternalStore } from "react";

import type { BillingPayment, MyBilling } from "./plan.actions";
import {
  addonChange,
  checkSelection,
  periodRunning,
  planById,
  planMove,
  quote,
  type SelectionCheck,
} from "./plan.logic";
import { SAMPLE_SUBSCRIPTION, setCatalog } from "./plan.sample";
import {
  SUB_STATUSES,
  type ActiveSelection,
  type AddonLine,
  type Cycle,
  type MySubscription,
  type SubStatus,
  type Usage,
} from "./plan.types";
import type { Translate } from "@/lib/i18n/instance";

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

/** A payment in the history: a sample one, or a real one through Xendit. */
export type PlanPayment = SamplePayment | BillingPayment;

type PlanState = {
  subscription: MySubscription;
  selection: ActiveSelection | null;
  /** Newest first. */
  payments: PlanPayment[];
  /**
   * Billing is set up in this database: the plan is the one it holds, and
   * paying goes through Xendit. False: the sample preview, in this browser.
   */
  live: boolean;
  /** Live through Xendit's test mode, so nothing real is charged. */
  testMode: boolean;
  /** Live: what's in use across every household the manager owns. */
  usage: Usage | null;
  /** The signed-in account pays for the plan; false for a co-manager or remote admin. */
  owner: boolean;
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
  live: false,
  testMode: false,
  usage: null,
  owner: true,
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
  if (!accountId || state.live) return;
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
  const { planId, planVersion, cycle, addons, status, cancelAtPeriodEnd, periodStart, periodEnd } =
    v;
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
  // Older saved previews have no start; a bad one is dropped, not trusted.
  if (periodStart !== undefined && periodStart !== null && !isIsoDate(periodStart)) return null;
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
    periodStart: (periodStart as string | null | undefined) ?? null,
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
  return { ...SAMPLE_STATE, subscription, selection, payments };
}

/**
 * Loads the signed-in manager's plan (ManagerShell calls it as the session
 * resolves). Another account gets its own; signed out shows the sample.
 */
export function loadPlanFor(id: string | null) {
  if (id === accountId && !state.live) return;
  accountId = id;
  paying = false;
  setCatalog(null);
  state = (id && readSaved(id)) || SAMPLE_STATE;
  emit();
}

/** The server functions, loaded only once a signed-in manager needs them. */
const actions = () => import("./plan.actions");

let token: string | null = null;
/** Bumped per load, so an older answer arriving late can't overwrite a newer one. */
let loadSeq = 0;

function applyLive(billing: MyBilling) {
  setCatalog(billing.catalog);
  state = {
    subscription: billing.subscription,
    selection: billing.selection,
    payments: billing.payments,
    live: true,
    testMode: billing.testMode,
    usage: billing.usage,
    owner: billing.owner,
  };
  emit();
}

/**
 * Loads the signed-in manager's real plan (ManagerShell, as the session
 * resolves). Where billing isn't set up in the database yet, the sample
 * preview is used instead, as before. Resolves true once live.
 */
export async function connectPlan(
  id: string | null,
  sessionToken: string | null,
): Promise<boolean> {
  const seq = ++loadSeq;
  token = sessionToken;
  if (!id || !sessionToken) {
    loadPlanFor(id);
    return false;
  }
  let res: Awaited<ReturnType<Awaited<ReturnType<typeof actions>>["getMyBillingFn"]>>;
  try {
    res = await (await actions()).getMyBillingFn({ data: { token: sessionToken } });
  } catch (err) {
    // A co-manager or remote admin has no plan of their own to manage here,
    // and a network blip keeps what's showing; the database enforces either way.
    console.warn("[plan] Couldn't load the plan:", err);
    if (seq === loadSeq && accountId !== id) loadPlanFor(id);
    return false;
  }
  if (seq !== loadSeq) return state.live;
  if (res.missing) {
    loadPlanFor(id);
    return false;
  }
  accountId = id;
  paying = false;
  applyLive(res.billing);
  return true;
}

/** Reads the real plan again, e.g. while a Xendit payment is being confirmed. */
export async function refreshPlan(): Promise<boolean> {
  if (!state.live || !token) return false;
  return connectPlan(accountId, token);
}

const NOT_SAMPLE = "Billing is live here: this goes through Xendit.";

export type CheckoutResult = { ok: true; invoiceUrl: string } | { ok: false; message: string };

/**
 * Live: opens a Xendit payment page for a plan (a change, or what's owed)
 * or add-ons, then sends the browser there. The amount is worked out in the
 * database, never here. A second tap while one is opening is refused.
 */
export async function checkout(
  kind: "plan" | "addons",
  planId: string | null,
  cycle: Cycle | null,
  addons: AddonLine[],
): Promise<CheckoutResult> {
  if (!state.live || !token) return { ok: false, message: "Billing isn't set up here yet." };
  if (paying) return { ok: false, message: "A payment is already being opened." };
  paying = true;
  try {
    const res = await (
      await actions()
    ).startCheckoutFn({
      data: {
        token,
        kind,
        planId,
        cycle,
        addons: addons.filter((a) => a.quantity > 0),
        returnUrl: window.location.origin,
      },
    });
    if (!res.ok) return res;
    window.location.assign(res.invoiceUrl);
    return { ok: true, invoiceUrl: res.invoiceUrl };
  } catch {
    return { ok: false, message: "Couldn't start the payment. Try again." };
  } finally {
    paying = false;
  }
}

async function liveChange(run: (token: string) => Promise<ChangeResult>): Promise<ChangeResult> {
  if (!state.live || !token) return { ok: false, message: "Billing isn't set up here yet." };
  let res: ChangeResult;
  try {
    res = await run(token);
  } catch {
    return { ok: false, message: "Couldn't save that. Check your connection and try again." };
  }
  if (res.ok) await refreshPlan();
  return res;
}

/** Live: moves to Free now (nothing to pay). */
export function changeToFreeLive(): Promise<ChangeResult> {
  return liveChange(async (t) => (await actions()).changeToFreeFn({ data: { token: t } }));
}

/** Live: the plan ends at its renewal date, then it's Free. */
export function cancelPlanLive(): Promise<ChangeResult> {
  return liveChange(async (t) => (await actions()).cancelPlanFn({ data: { token: t } }));
}

/** Live: keeps a cancelled plan after all, before its renewal date. */
export function resumePlanLive(): Promise<ChangeResult> {
  return liveChange(async (t) => (await actions()).resumePlanFn({ data: { token: t } }));
}

/** Live: fewer add-ons (nothing to pay, nothing refunded). */
export function removeAddonsLive(lines: AddonLine[]): Promise<ChangeResult> {
  return liveChange(async (t) =>
    (await actions()).removeAddonsFn({
      data: { token: t, addons: lines.filter((l) => l.quantity > 0) },
    }),
  );
}

/** Live: what stays active when over the limits. */
export function saveSelectionLive(selection: ActiveSelection): Promise<ChangeResult> {
  return liveChange(async (t) =>
    (await actions()).saveSelectionFn({ data: { token: t, selection } }),
  );
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

/**
 * A plan change as the sample shows it: starts today, nothing is charged.
 * Sets the plan directly (tests and the preview's own setup); what a manager
 * can move to is planMove's call, checked by the screens and payForPlan.
 */
export function changePlan(planId: string, cycle: Cycle, addons: AddonLine[]): ChangeResult {
  if (state.live) return { ok: false, message: NOT_SAMPLE };
  const q = quote(planId, cycle, addons);
  if (!q.ok) return q;
  const plan = planById(planId);
  if (!plan) return { ok: false, message: "That plan isn't offered." };
  const lines = addons.filter((a) => a.quantity > 0);
  if (isCurrentPlan(planId, cycle, addons)) {
    return { ok: false, message: "That's the plan you already have." };
  }
  const start = new Date();
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + (cycle === "annual" ? 12 : 1));
  const renews = q.amount > 0 && cycle !== "one_time";
  set({
    ...state,
    subscription: {
      planId,
      planVersion: plan.version,
      cycle,
      addons: lines,
      status: "active",
      cancelAtPeriodEnd: false,
      periodStart: renews ? start.toISOString() : null,
      periodEnd: renews ? end.toISOString() : null,
    },
    selection: null,
    payments: state.payments,
  });
  return { ok: true };
}

/** Sample: moves to Free now, only when no paid period runs (as billing_change_to_free). */
export function changeToFree(): ChangeResult {
  if (state.live) return { ok: false, message: NOT_SAMPLE };
  const move = planMove(state.subscription, "free", "monthly", []);
  if (!move.ok) {
    return move.lower
      ? {
          ok: false,
          message: move.message.replace(
            "To move to a lower plan, cancel this one. You keep it until",
            "To move to Free, cancel your plan. You keep it until",
          ),
        }
      : move;
  }
  return changePlan("free", "monthly", []);
}

/** Sample: the plan ends at its renewal date (as billing_cancel_plan). */
export function cancelPlan(): ChangeResult {
  if (state.live) return { ok: false, message: NOT_SAMPLE };
  const s = state.subscription;
  if (!periodRunning(s)) return { ok: false, message: "There's no paid plan running to cancel." };
  if (s.cancelAtPeriodEnd) return { ok: false, message: "Your plan already ends then." };
  set({ ...state, subscription: { ...s, cancelAtPeriodEnd: true } });
  return { ok: true };
}

/** Sample: keeps a cancelled plan (as billing_resume_plan). */
export function resumePlan(): ChangeResult {
  if (state.live) return { ok: false, message: NOT_SAMPLE };
  const s = state.subscription;
  if (!periodRunning(s) || !s.cancelAtPeriodEnd) {
    return { ok: false, message: "Your plan isn't set to end." };
  }
  set({ ...state, subscription: { ...s, cancelAtPeriodEnd: false } });
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
  if (state.live) return { ok: false, message: NOT_SAMPLE };
  if (paying) return { ok: false, message: "A payment is already going through." };
  if (!PAYMENT_METHODS.includes(method)) return { ok: false, message: "Choose how to pay." };
  const q = quote(planId, cycle, addons);
  if (!q.ok) return q;
  if (q.amount === 0) return { ok: false, message: "Nothing to pay on this plan." };
  // The same rule and price as the database: up only, prorated while a period runs.
  const move = planMove(state.subscription, planId, cycle, addons);
  if (!move.ok) return move;
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
      amount: move.dueNow,
      method,
      status: declined ? "failed" : "paid",
      at: new Date().toISOString(),
      failureReason: declined ? "The card was declined." : null,
    };
    if (declined) {
      set({ ...state, payments: [payment, ...state.payments] });
      return { ok: false, message: "The card was declined. Nothing was charged; try another way." };
    }
    const start = new Date();
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + (cycle === "annual" ? 12 : 1));
    const kept = move.keepsPeriod ? state.subscription : null;
    set({
      ...state,
      subscription: {
        planId,
        planVersion: planById(planId)?.version ?? 1,
        cycle,
        addons: addons.filter((a) => a.quantity > 0),
        status: "active",
        cancelAtPeriodEnd: false,
        periodStart: kept
          ? (kept.periodStart ?? null)
          : cycle === "one_time"
            ? null
            : start.toISOString(),
        periodEnd: kept ? kept.periodEnd : cycle === "one_time" ? null : end.toISOString(),
      },
      selection: null,
      payments: [payment, ...state.payments],
    });
    return { ok: true, payment };
  } finally {
    paying = false;
  }
}

/**
 * Buys add-ons on the plan it has, as a sample: charges the added ones for
 * the period that's running and keeps the plan and its renewal date. The
 * test card declines; a second tap while one is going through is refused.
 */
export async function payForAddons(lines: AddonLine[], method: PaymentMethod): Promise<PayResult> {
  if (state.live) return { ok: false, message: NOT_SAMPLE };
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
  if (state.live) return { ok: false, message: NOT_SAMPLE };
  const change = addonChange(state.subscription, lines);
  if (!change.ok) return change;
  if (change.dueNow > 0) return { ok: false, message: "That adds add-ons: pay for them first." };
  set({
    ...state,
    subscription: { ...state.subscription, addons: lines.filter((l) => l.quantity > 0) },
  });
  return { ok: true };
}

/** Preview only: see the screens as a household on another status would. */
export function previewStatus(status: SubStatus) {
  if (state.live) return;
  set({ ...state, subscription: { ...state.subscription, status }, selection: null });
}

export function saveSelection(
  selection: ActiveSelection,
  available: { households: string[]; kasambahay: string[] },
  t?: Translate,
): SelectionCheck {
  if (state.live) return { ok: false, message: NOT_SAMPLE };
  const check = checkSelection(state.subscription, selection, available, t);
  if (check.ok) set({ ...state, selection });
  return check;
}

export function resetPlan() {
  if (state.live) return;
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
