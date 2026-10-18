import { fmtCentavos } from "./money";
import type { Plan, PlanInterval } from "./plan.types";

export type Seats = { helpers: number; managers: number; homes: number };
type Dimension = "helper" | "manager" | "home";

export type Quote =
  | { ok: true; amountCentavos: number; lines: { label: string; centavos: number }[] }
  | { ok: false; over: Dimension };

export function intervalLabel(i: PlanInterval): string {
  if (i === "one_time") return "one-time";
  return i === "monthly" ? "per month" : "per year";
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * Same arithmetic as the SQL quote_subscription (supabase/add-subscriptions.sql):
 * per dimension, a null `included` is unlimited (no extra); over the cap with
 * no extra price is refused; otherwise max(0, seats - included) x extra price.
 * There is a line per capped dimension, so a cap with no extra price still
 * shows on the quote.
 */
export function quoteAmount(plan: Plan, seats: Seats): Quote {
  const dims: { dim: Dimension; seats: number; included: number | null; extra: number | null }[] = [
    {
      dim: "helper",
      seats: seats.helpers,
      included: plan.includedHelpers,
      extra: plan.extraHelperCentavos,
    },
    {
      dim: "manager",
      seats: seats.managers,
      included: plan.includedManagers,
      extra: plan.extraManagerCentavos,
    },
    {
      dim: "home",
      seats: seats.homes,
      included: plan.includedHomes,
      extra: plan.extraHomeCentavos,
    },
  ];
  const lines = [{ label: `${plan.name} base`, centavos: plan.baseCentavos }];
  let total = plan.baseCentavos;
  for (const d of dims) {
    if (d.included === null) continue;
    const over = Math.max(0, d.seats - d.included);
    if (over > 0 && d.extra === null) return { ok: false, over: d.dim };
    const centavos = over * (d.extra ?? 0);
    total += centavos;
    lines.push({ label: count(over, `extra ${d.dim}`), centavos });
  }
  return { ok: true, amountCentavos: total, lines };
}

/** "₱499.00 per month, 1 helper included, ₱99.00 per extra helper" */
export function describePlanPricing(plan: Plan): string {
  const parts = [`${fmtCentavos(plan.baseCentavos)} ${intervalLabel(plan.interval)}`];
  const dims: [string, number | null, number | null][] = [
    ["helper", plan.includedHelpers, plan.extraHelperCentavos],
    ["manager", plan.includedManagers, plan.extraManagerCentavos],
    ["home", plan.includedHomes, plan.extraHomeCentavos],
  ];
  for (const [name, included, extra] of dims) {
    if (included === null) continue;
    parts.push(`${count(included, name)} included`);
    if (extra !== null) parts.push(`${fmtCentavos(extra)} per extra ${name}`);
  }
  return parts.join(", ");
}
