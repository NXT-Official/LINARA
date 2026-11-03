import { intlLocale, tFor, type MessageKey, type Translate } from "@/lib/i18n/instance";
import { parseLocale } from "@/lib/i18n/locales";

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

// Plan words come from src/locales/<lang>/plan.json. Callers in a screen pass
// their t(); without one (logic tests, server code) they're English.
const EN = tFor("en");

/** "households", "co-managers": what a limit counts, in t's language. */
export function limitName(key: LimitKey, t: Translate = EN): string {
  return t(`plan.limitName.${key}` as MessageKey);
}

/** "Households": a limit's heading. */
export function limitTitle(key: LimitKey, t: Translate = EN): string {
  return t(`plan.limitTitle.${key}` as MessageKey);
}

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
export function limitText(key: LimitKey, value: number | null, t: Translate = EN): string {
  if (value === null) return t("plan.unlimitedLimit", { what: limitName(key, t) });
  return t(`plan.limit.${key}` as MessageKey, { count: value });
}

/**
 * The plan whose features and limits apply now: the one subscribed to, or
 * Free once grace is over (billing_effective_version, add-billing-pause.sql).
 * Paying what's owed still prices the plan they're on.
 */
function effectivePlanId(sub: MySubscription): string {
  return sub.status === "restricted" ? "free" : sub.planId;
}

/** The limits that apply now, plus what paid add-ons raise them by. */
export function limitsFor(sub: MySubscription): Record<LimitKey, number | null> {
  const plan = planById(effectivePlanId(sub));
  const base = plan?.limits ?? { households: 1, kasambahay: 1, co_managers: 0 };
  const limits = { ...base };
  // Restricted: unpaid add-ons don't count.
  for (const line of sub.status === "restricted" ? [] : sub.addons) {
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
  return planById(effectivePlanId(sub))?.features[key] ?? false;
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
export function canAdd(
  sub: MySubscription,
  usage: Usage,
  key: LimitKey,
  t: Translate = EN,
): AddCheck {
  if (sub.status === "restricted") {
    return {
      ok: false,
      reason: "restricted",
      message: t("plan.restrictedNoAdd"),
    };
  }
  const limit = limitsFor(sub)[key];
  if (limit === null || usage[key] + 1 <= limit) return { ok: true };
  const plan = planById(sub.planId)?.name ?? t("plan.yourPlan");
  return {
    ok: false,
    reason: "limit",
    limitKey: key,
    message:
      limit === 0
        ? t("plan.doesntInclude", { plan, what: limitName(key, t) })
        : t("plan.allowsYouHave", { plan, limit: limitText(key, limit, t), count: usage[key] }),
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
  t: Translate = EN,
): SelectionCheck {
  const limits = limitsFor(sub);
  for (const key of ["households", "kasambahay"] as const) {
    const picked = selection[key];
    if (new Set(picked).size !== picked.length) {
      return { ok: false, message: t("plan.pickedTwice") };
    }
    if (picked.some((id) => !available[key].includes(id))) {
      return { ok: false, message: t("plan.pickedGone") };
    }
    const limit = limits[key];
    if (limit !== null && picked.length > limit) {
      return { ok: false, message: t("plan.pickUpTo", { limit: limitText(key, limit, t) }) };
    }
  }
  if (selection.households.length === 0) {
    return { ok: false, message: t("plan.keepOneHousehold") };
  }
  return { ok: true };
}

export type Quote = { ok: true; amount: number } | { ok: false; message: string };

/** What a plan, cycle and add-ons cost each cycle, or why they can't be had. */
export function quote(planId: string, cycle: Cycle, addons: AddonLine[], t: Translate = EN): Quote {
  const plan = planById(planId);
  if (!plan) return { ok: false, message: t("plan.errPlanNotOffered") };
  const price = plan.prices[cycle];
  if (price === null) return { ok: false, message: t("plan.errPlanNotSold") };
  let amount = price;
  for (const line of addons) {
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 0 ||
      line.quantity > MAX_ADDON_QUANTITY
    ) {
      return { ok: false, message: t("plan.errAddonRange", { max: MAX_ADDON_QUANTITY }) };
    }
    if (line.quantity === 0) continue;
    const addon = ADDONS.find((a) => a.id === line.addonId);
    if (!addon) return { ok: false, message: t("plan.errAddonNotOffered") };
    const months = MONTHS[cycle];
    if (months === null || price === 0) {
      return { ok: false, message: t("plan.errAddonsNeedPaid") };
    }
    amount += addon.monthlyPrice * months * line.quantity;
  }
  return { ok: true, amount };
}

/** "₱399 a month", or "Free". */
export function priceText(amount: number, cycle: Cycle, t: Translate = EN): string {
  if (amount === 0) return t("plan.priceFree");
  const key =
    cycle === "monthly"
      ? "plan.pricePerMonth"
      : cycle === "annual"
        ? "plan.pricePerYear"
        : "plan.priceOnce";
  return t(key, { price: formatCentavos(amount) });
}

/** "Monthly", "Yearly", "One-time": a billing cycle’s name. */
export function cycleName(cycle: Cycle, t: Translate = EN): string {
  return t(
    cycle === "monthly"
      ? "plan.cycleMonthly"
      : cycle === "annual"
        ? "plan.cycleAnnual"
        : "plan.cycleOneTime",
  );
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
export function addonsBlocked(sub: MySubscription, t: Translate = EN): string | null {
  const base = quote(sub.planId, sub.cycle, [], t);
  if (!base.ok) return base.message;
  if (base.amount === 0 || sub.cycle === "one_time") {
    return t("plan.addonsPaidOnly");
  }
  if (sub.status === "past_due" || sub.status === "restricted") {
    return t("plan.addonsPayFirst");
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
export function addonChange(
  sub: MySubscription,
  lines: AddonLine[],
  t: Translate = EN,
): AddonChange {
  const blocked = addonsBlocked(sub, t);
  if (blocked) return { ok: false, message: blocked };
  const base = quote(sub.planId, sub.cycle, [], t);
  if (!base.ok) return base;
  const next = quote(sub.planId, sub.cycle, lines, t);
  if (!next.ok) return next;
  const current = quote(sub.planId, sub.cycle, sub.addons, t);
  const now = current.ok ? current.amount : base.amount;
  const qty = (list: AddonLine[], id: string) =>
    list.filter((l) => l.addonId === id).reduce((n, l) => n + l.quantity, 0);
  if (ADDONS.every((a) => qty(lines, a.id) === qty(sub.addons, a.id))) {
    return { ok: false, message: t("plan.nothingChanged") };
  }
  return { ok: true, dueNow: Math.max(0, next.amount - now), newAmount: next.amount };
}

/** The smallest amount charged, in centavos: Xendit's card minimum (billing_min_charge). */
export const MIN_CHARGE = 2_000;

const dayFormats = new Map<string, Intl.DateTimeFormat>();
/** "Nov 28, 2026", in Manila time (billing_date_text), written for `t`'s language. */
export function dayText(iso: string | number, t: Translate = EN): string {
  const tag = intlLocale(parseLocale((t as unknown as { lng?: string }).lng));
  let fmt = dayFormats.get(tag);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(tag, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Manila",
    });
    dayFormats.set(tag, fmt);
  }
  return fmt.format(new Date(iso));
}

/** How high a plan ranks: its monthly price, or a twelfth of its yearly one. */
function planRank(planId: string): number {
  const p = planById(planId)?.prices;
  if (!p) return 0;
  return p.monthly ?? (p.annual !== null ? p.annual / 12 : (p.one_time ?? 0));
}

/** Adds whole months as Postgres does: a day past the month's end is its last day. */
function addMonths(iso: string | number, months: number): Date {
  const d = new Date(iso);
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes()),
  );
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  target.setUTCSeconds(d.getUTCSeconds(), d.getUTCMilliseconds());
  return target;
}

/**
 * The period a plan payment pays for, as billing_next_period works it out
 * (add-billing-renewal-and-trials.sql): late, from the old renewal date (by
 * whole cycles, until it covers today); in a trial, a cycle past the trial's
 * end; otherwise from now. One-time has no end.
 */
export function nextPeriod(
  sub: MySubscription,
  cycle: Cycle,
  now = Date.now(),
): { start: string; end: string | null } {
  const months = MONTHS[cycle];
  const today = new Date(now).toISOString();
  if (months === null) return { start: today, end: null };
  const end = sub.periodEnd ? Date.parse(sub.periodEnd) : NaN;
  if (sub.status === "trialing" && end > now) {
    return { start: today, end: addMonths(end, months).toISOString() };
  }
  if ((sub.status === "past_due" || sub.status === "restricted") && !Number.isNaN(end)) {
    let k = 0;
    while (addMonths(end, months * (k + 1)).getTime() <= now) k++;
    return {
      start: addMonths(end, months * k).toISOString(),
      end: addMonths(end, months * (k + 1)).toISOString(),
    };
  }
  return { start: today, end: addMonths(now, months).toISOString() };
}

/** A paid period is running: active (not a trial), renewing after `now`. */
export function periodRunning(sub: MySubscription, now = Date.now()): boolean {
  return sub.status === "active" && !!sub.periodEnd && Date.parse(sub.periodEnd) > now;
}

const sameLines = (a: AddonLine[], b: AddonLine[]) =>
  JSON.stringify(a.filter((l) => l.quantity > 0)) ===
  JSON.stringify(b.filter((l) => l.quantity > 0));

export type PlanMove =
  | {
      ok: true;
      /** Charged now. 0 only when moving to Free with nothing running. */
      dueNow: number;
      /** The renewal date stays (a same-cycle upgrade); otherwise a new period starts when paid. */
      keepsPeriod: boolean;
      /** Worked out from the time left in the period that's running. */
      prorated: boolean;
    }
  | { ok: false; message: string; lower?: boolean };

/**
 * Moving to a plan, cycle and add-ons, as billing_quote works it out
 * (add-billing-plan-changes.sql). While a paid period runs a plan only goes
 * up: a higher plan pays the gap for the time left and keeps the renewal
 * date; monthly to yearly pays the year less what's unused, from today.
 * Anything lower waits for a cancel to run out. With nothing running, any
 * plan at its full price.
 */
export function planMove(
  sub: MySubscription,
  planId: string,
  cycle: Cycle,
  addons: AddonLine[],
  now = Date.now(),
  t: Translate = EN,
): PlanMove {
  const next = quote(planId, cycle, addons, t);
  if (!next.ok) return next;
  const same = planId === sub.planId && cycle === sub.cycle;

  if (!periodRunning(sub, now)) {
    // Owing, or in a trial: paying for the plan they're on is how it's kept.
    const owes =
      sub.status === "past_due" || sub.status === "restricted" || sub.status === "trialing";
    if (same && sameLines(addons, sub.addons) && !owes) {
      return { ok: false, message: t("plan.alreadyHavePlan") };
    }
    return { ok: true, dueNow: next.amount, keepsPeriod: false, prorated: false };
  }

  const end = Date.parse(sub.periodEnd as string);
  const lower = {
    ok: false as const,
    lower: true,
    message: t("plan.moveLowerCancel", { date: dayText(end, t) }),
  };
  if (same) {
    return sameLines(addons, sub.addons)
      ? { ok: false, message: t("plan.alreadyHavePlan") }
      : { ok: false, message: t("plan.changeAddonsUse") };
  }
  const current = quote(sub.planId, sub.cycle, sub.addons, t);
  if (!current.ok) return current;
  const start = sub.periodStart ? Date.parse(sub.periodStart) : NaN;
  const left =
    Number.isNaN(start) || end <= start ? 1 : Math.min(1, Math.max(0, (end - now) / (end - start)));

  let dueNow: number;
  let keepsPeriod: boolean;
  if (cycle === sub.cycle && planRank(planId) > planRank(sub.planId)) {
    if (next.amount <= current.amount) {
      return {
        ok: false,
        message: t("plan.upgradeNoMore"),
      };
    }
    dueNow = Math.ceil((next.amount - current.amount) * left);
    keepsPeriod = true;
  } else if (
    sub.cycle === "monthly" &&
    cycle === "annual" &&
    planRank(planId) >= planRank(sub.planId)
  ) {
    dueNow = next.amount - Math.floor(current.amount * left);
    keepsPeriod = false;
  } else {
    return lower;
  }
  return { ok: true, dueNow: Math.max(dueNow, MIN_CHARGE), keepsPeriod, prorated: true };
}
