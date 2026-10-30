import type { CatalogAddon, CatalogPlan, Feature, FeatureKey, MySubscription } from "./plan.types";

/**
 * The features a plan can unlock, as the Business Console lists them. Staff
 * pay & HR is off for everyone while it's brought in line with the law
 * (KNOWN_GAPS O72), whatever the plan. A kasambahay's leave, rest owed and
 * record are on every plan.
 */
export const FEATURES: Feature[] = [
  { key: "tasks", name: "Tasks and the Board", description: "Daily tasks, routines and SOPs." },
  { key: "quick_utos", name: "Quick Utos", description: "Short instructions sent to staff." },
  { key: "schedule", name: "Schedule", description: "Shifts, appointments and availability." },
  { key: "pantry", name: "Pantry and groceries", description: "Stock, restocks and market runs." },
  {
    key: "time_off",
    name: "Leave and rest days",
    description: "Leave requests and rest-off.",
    everyPlan: "Her weekly rest day and yearly leave are hers by law (RA 10361).",
  },
  {
    key: "after_hours",
    name: "After-hours ledger",
    description: "Extra hours worked and how they're settled.",
    everyPlan: "It's how her rest owed is kept and given back.",
  },
  { key: "teams_labels", name: "Teams and labels", description: "Grouping staff in big homes." },
  {
    key: "remote_admin",
    name: "Remote admin",
    description: "A manager abroad who follows and approves.",
  },
  {
    key: "work_record",
    name: "Work record export",
    description: "A helper's record as a PDF.",
    everyPlan: "Her record is hers to keep.",
  },
];

/** A plan's features: the ones named, plus every one that's on every plan. */
const on = (keys: FeatureKey[]): Record<FeatureKey, boolean> =>
  Object.fromEntries(FEATURES.map((f) => [f.key, !!f.everyPlan || keys.includes(f.key)])) as Record<
    FeatureKey,
    boolean
  >;

const ESSENTIAL: FeatureKey[] = ["tasks", "quick_utos", "schedule", "pantry", "time_off"];

/** Same plans, limits and placeholder prices as the console's sample. */
export const CATALOG: CatalogPlan[] = [
  {
    id: "free",
    name: "Free",
    description: "For one household getting started.",
    prices: { monthly: 0, annual: null, one_time: null },
    trialDays: 0,
    features: on(["tasks", "quick_utos", "schedule"]),
    limits: { households: 1, kasambahay: 1, co_managers: 0 },
    version: 1,
    pricePlaceholder: false,
  },
  {
    id: "normal",
    name: "Normal",
    description: "All the essentials for a household and its staff.",
    prices: { monthly: 19_900, annual: 199_000, one_time: null },
    trialDays: 14,
    features: on(ESSENTIAL),
    limits: { households: 1, kasambahay: 3, co_managers: 1 },
    version: 1,
    pricePlaceholder: true,
  },
  {
    id: "premium",
    name: "Premium",
    description: "Everything in Normal, plus the advanced features.",
    prices: { monthly: 39_900, annual: 399_000, one_time: null },
    trialDays: 14,
    features: on(FEATURES.map((f) => f.key)),
    limits: { households: 3, kasambahay: null, co_managers: 3 },
    version: 1,
    pricePlaceholder: true,
  },
];

export const ADDONS: CatalogAddon[] = [
  {
    id: "extra_household",
    name: "Extra household",
    limitKey: "households",
    step: 1,
    monthlyPrice: 10_000,
  },
  {
    id: "extra_kasambahay",
    name: "Extra kasambahay",
    limitKey: "kasambahay",
    step: 1,
    monthlyPrice: 5_000,
  },
];

/**
 * The sample starts on Premium, so every feature the app has today stays
 * open while billing is a preview; the preview controls on My plan switch it.
 */
export const SAMPLE_SUBSCRIPTION: MySubscription = {
  planId: "premium",
  planVersion: 1,
  cycle: "monthly",
  addons: [],
  status: "active",
  cancelAtPeriodEnd: false,
  periodEnd: "2026-11-26T02:00:00.000Z",
};

/** The built-in catalog, kept for when billing isn't set up in a database yet. */
const BUILT_IN = { plans: [...CATALOG], addons: [...ADDONS] };

/**
 * Swaps in the catalog the database sells (billing_catalog), in place, so
 * everything reading CATALOG and ADDONS follows. Called by the plan store
 * as it loads; null puts the built-in one back.
 */
export function setCatalog(next: { plans: CatalogPlan[]; addons: CatalogAddon[] } | null) {
  const plans = next?.plans.length ? next.plans : BUILT_IN.plans;
  const addons = next ? next.addons : BUILT_IN.addons;
  CATALOG.splice(0, CATALOG.length, ...plans);
  ADDONS.splice(0, ADDONS.length, ...addons);
}
