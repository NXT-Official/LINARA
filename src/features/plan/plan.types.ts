/**
 * The manager's plan, on sample data until billing is built
 * (documentation/specs/2026-10-26-subscriptions-plan.md). Mirrors the
 * Business Console's preview catalog (LINARA_ADMIN D47). Money is whole
 * centavos.
 */
export type Cycle = "monthly" | "annual" | "one_time";

export type LimitKey = "households" | "kasambahay" | "co_managers";

export type FeatureKey =
  | "tasks"
  | "quick_utos"
  | "schedule"
  | "pantry"
  | "time_off"
  | "after_hours"
  | "teams_labels"
  | "remote_admin"
  | "work_record"
  | "staff_pay_hr";

export type Feature = {
  key: FeatureKey;
  name: string;
  description: string;
  /** Turned off for every household, whatever the plan (a global switch). */
  offForEveryone?: boolean;
  /**
   * On every plan, whatever the household pays, with the reason: a
   * kasambahay's rest, leave and record are hers by law (RA 10361).
   */
  everyPlan?: string;
};

export type CatalogPlan = {
  id: string;
  name: string;
  description: string;
  /** Centavos per cycle; null when not sold that way. */
  prices: Record<Cycle, number | null>;
  trialDays: number;
  features: Record<FeatureKey, boolean>;
  /** null means unlimited. */
  limits: Record<LimitKey, number | null>;
  version: number;
  /** Sample prices until marketing sets real ones. */
  pricePlaceholder: boolean;
};

export type CatalogAddon = {
  id: string;
  name: string;
  limitKey: LimitKey;
  step: number;
  /** Centavos a month. */
  monthlyPrice: number;
};

export const SUB_STATUSES = ["active", "trialing", "past_due", "restricted"] as const;
/**
 * past_due: a renewal failed and the 7-day grace period is running, nothing
 * changes yet. restricted: grace is over; only what the manager picks stays
 * active; for the rest, new tasks and changes pause. Nothing is ever deleted,
 * and a kasambahay always keeps her own record, leave and rest days.
 */
export type SubStatus = (typeof SUB_STATUSES)[number];

export type AddonLine = { addonId: string; quantity: number };

export type MySubscription = {
  planId: string;
  planVersion: number;
  cycle: Cycle;
  addons: AddonLine[];
  status: SubStatus;
  cancelAtPeriodEnd: boolean;
  /** When the period started; prorates an upgrade. Missing in older saved previews. */
  periodStart?: string | null;
  /** When the paid or trial period ends; null when nothing renews. */
  periodEnd: string | null;
};

/** What's in use right now, counted from the app's own data. */
export type Usage = Record<LimitKey, number>;

/** The households and kasambahay picked to stay active when over the limit. */
export type ActiveSelection = { households: string[]; kasambahay: string[] };
