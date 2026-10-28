import { ADDONS, CATALOG, FEATURES } from "./plan.sample";
import type {
  ActiveSelection,
  AddonLine,
  CatalogPlan,
  Cycle,
  FeatureKey,
  LimitKey,
  MySubscription,
  Usage,
} from "./plan.types";

export const GRACE_DAYS = 7;
export const MAX_ADDON_QUANTITY = 10;

export const LIMIT_LABEL: Record<LimitKey, { one: string; many: string; title: string }> = {
  households: { one: "household", many: "households", title: "Households" },
  kasambahay: { one: "kasambahay", many: "kasambahay", title: "Kasambahay" },
  co_managers: { one: "co-manager", many: "co-managers", title: "Co-managers" },
};

export const CYCLE_LABEL: Record<Cycle, { name: string; per: string }> = {
  monthly: { name: "Monthly", per: "a month" },
  annual: { name: "Yearly", per: "a year" },
  one_time: { name: "One-time", per: "once" },
};

const MONTHS: Record<Cycle, number | null> = { monthly: 1, annual: 12, one_time: null };

const pesos = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const wholePesos = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});
/** "₱199", "₱1,299.50". */
export function formatCentavos(centavos: number): string {
  return (centavos % 100 === 0 ? wholePesos : pesos).format(centavos / 100);
}

export function planById(id: string): CatalogPlan | undefined {
  return CATALOG.find((p) => p.id === id);
}

/** "1 household", "Unlimited kasambahay". */
export function limitText(key: LimitKey, value: number | null): string {
  const l = LIMIT_LABEL[key];
  if (value === null) return `Unlimited ${l.many}`;
  return `${value} ${value === 1 ? l.one : l.many}`;
}

/** The plan's limits plus what the add-ons raise them by. */
export function limitsFor(sub: MySubscription): Record<LimitKey, number | null> {
  const plan = planById(sub.planId);
  const base = plan?.limits ?? { households: 1, kasambahay: 1, co_managers: 0 };
  const limits = { ...base };
  for (const line of sub.addons) {
    const addon = ADDONS.find((a) => a.id === line.addonId);
    const current = addon ? limits[addon.limitKey] : null;
    if (!addon || current === null || line.quantity <= 0) continue;
    limits[addon.limitKey] = current + addon.step * line.quantity;
  }
  return limits;
}

/**
 * Whether the household can use a feature: it's on every plan, or the plan
 * includes it, and nothing has turned it off for everyone. An unknown plan
 * unlocks only what's on every plan.
 */
export function hasFeature(sub: MySubscription, key: FeatureKey): boolean {
  const feature = FEATURES.find((f) => f.key === key);
  if (!feature || feature.offForEveryone) return false;
  if (feature.everyPlan) return true;
  return planById(sub.planId)?.features[key] ?? false;
}

/** The cheapest published plan that includes a feature, to name in a lock. */
export function cheapestPlanWith(key: FeatureKey): CatalogPlan | undefined {
  return CATALOG.find((p) => p.features[key]);
}

export type AddCheck =
  | { ok: true }
  | { ok: false; reason: "limit" | "restricted"; message: string; limitKey?: LimitKey };

/**
 * Whether one more household, kasambahay or co-manager fits. A restricted
 * plan (grace over) adds nothing until it's paid.
 */
export function canAdd(sub: MySubscription, usage: Usage, key: LimitKey): AddCheck {
  if (sub.status === "restricted") {
    return {
      ok: false,
      reason: "restricted",
      message: "Your plan's payment is overdue, so nothing new can be added until it's paid.",
    };
  }
  const limit = limitsFor(sub)[key];
  if (limit === null || usage[key] + 1 <= limit) return { ok: true };
  const plan = planById(sub.planId)?.name ?? "Your plan";
  return {
    ok: false,
    reason: "limit",
    limitKey: key,
    message:
      limit === 0
        ? `${plan} doesn't include ${LIMIT_LABEL[key].many}.`
        : `${plan} allows ${limitText(key, limit)}, and you have ${usage[key]}.`,
  };
}

/** The limits that what's in use goes over, e.g. after moving to a smaller plan. */
export function overLimits(sub: MySubscription, usage: Usage): LimitKey[] {
  const limits = limitsFor(sub);
  return (Object.keys(limits) as LimitKey[]).filter((k) => {
    const limit = limits[k];
    return limit !== null && usage[k] > limit;
  });
}

/** When the grace period after a failed renewal ends; null when nothing is due. */
export function graceEndsAt(sub: MySubscription): string | null {
  if (!sub.periodEnd || (sub.status !== "past_due" && sub.status !== "restricted")) return null;
  const d = new Date(sub.periodEnd);
  d.setUTCDate(d.getUTCDate() + GRACE_DAYS);
  return d.toISOString();
}

export type SelectionCheck = { ok: true } | { ok: false; message: string };

/**
 * A choice of what stays active: only things that exist, each once, at least
 * one household, and no more of each than the plan allows.
 */
export function checkSelection(
  sub: MySubscription,
  selection: ActiveSelection,
  available: { households: string[]; kasambahay: string[] },
): SelectionCheck {
  const limits = limitsFor(sub);
  for (const key of ["households", "kasambahay"] as const) {
    const picked = selection[key];
    if (new Set(picked).size !== picked.length) {
      return { ok: false, message: "Something is picked twice." };
    }
    if (picked.some((id) => !available[key].includes(id))) {
      return { ok: false, message: "Something picked isn't there any more. Pick again." };
    }
    const limit = limits[key];
    if (limit !== null && picked.length > limit) {
      return { ok: false, message: `Pick up to ${limitText(key, limit)}.` };
    }
  }
  if (selection.households.length === 0) {
    return { ok: false, message: "Keep at least one household active." };
  }
  return { ok: true };
}

export type Quote = { ok: true; amount: number } | { ok: false; message: string };

/** What a plan, cycle and add-ons cost each cycle, or why they can't be had. */
export function quote(planId: string, cycle: Cycle, addons: AddonLine[]): Quote {
  const plan = planById(planId);
  if (!plan) return { ok: false, message: "That plan isn't offered." };
  const price = plan.prices[cycle];
  if (price === null) return { ok: false, message: "That plan isn't sold that way." };
  let amount = price;
  for (const line of addons) {
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 0 ||
      line.quantity > MAX_ADDON_QUANTITY
    ) {
      return { ok: false, message: `Add 0 to ${MAX_ADDON_QUANTITY} of each add-on.` };
    }
    if (line.quantity === 0) continue;
    const addon = ADDONS.find((a) => a.id === line.addonId);
    if (!addon) return { ok: false, message: "One of the add-ons isn't offered." };
    const months = MONTHS[cycle];
    if (months === null || price === 0) {
      return { ok: false, message: "Add-ons need a paid monthly or yearly plan." };
    }
    amount += addon.monthlyPrice * months * line.quantity;
  }
  return { ok: true, amount };
}

/** "₱399 a month", or "Free". */
export function priceText(amount: number, cycle: Cycle): string {
  return amount === 0 ? "Free" : `${formatCentavos(amount)} ${CYCLE_LABEL[cycle].per}`;
}

/** The plan's cycles that have a price, in order. */
export function cyclesOf(plan: CatalogPlan): Cycle[] {
  return (["monthly", "annual", "one_time"] as const).filter((c) => plan.prices[c] !== null);
}

/** The add-on that raises a limit, if one does. */
export function addonFor(key: LimitKey) {
  return ADDONS.find((a) => a.limitKey === key);
}

/** Why add-ons can't be bought on this plan right now, or null when they can. */
export function addonsBlocked(sub: MySubscription): string | null {
  const base = quote(sub.planId, sub.cycle, []);
  if (!base.ok) return base.message;
  if (base.amount === 0 || sub.cycle === "one_time") {
    return "Add-ons are for paid monthly or yearly plans: Normal and Premium.";
  }
  if (sub.status === "past_due" || sub.status === "restricted") {
    return "Pay what's owed first, then add more.";
  }
  return null;
}

export type AddonChange =
  | {
      ok: true;
      /** Charged now: the added add-ons for the period that's running. 0 when only removing. */
      dueNow: number;
      /** What the plan and add-ons cost each cycle after the change. */
      newAmount: number;
    }
  | { ok: false; message: string };

/**
 * Buying or removing add-ons on the plan the household has. Only paid
 * monthly or yearly plans take add-ons, and not while a payment is owed.
 * Added ones are charged now for the period that's running (a month's or a
 * year's price; marketing sets proration later); removing one costs
 * nothing and refunds nothing.
 */
export function addonChange(sub: MySubscription, lines: AddonLine[]): AddonChange {
  const blocked = addonsBlocked(sub);
  if (blocked) return { ok: false, message: blocked };
  const base = quote(sub.planId, sub.cycle, []);
  if (!base.ok) return base;
  const next = quote(sub.planId, sub.cycle, lines);
  if (!next.ok) return next;
  const current = quote(sub.planId, sub.cycle, sub.addons);
  const now = current.ok ? current.amount : base.amount;
  const qty = (list: AddonLine[], id: string) =>
    list.filter((l) => l.addonId === id).reduce((n, l) => n + l.quantity, 0);
  if (ADDONS.every((a) => qty(lines, a.id) === qty(sub.addons, a.id))) {
    return { ok: false, message: "Nothing changed." };
  }
  return { ok: true, dueNow: Math.max(0, next.amount - now), newAmount: next.amount };
}
