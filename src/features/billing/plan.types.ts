export type PlanInterval = "one_time" | "monthly" | "yearly";
export type PlanStatus = "draft" | "active" | "archived";

/** Money is integer centavos, PHP, tax-inclusive. A null `included*` is unlimited; a null `extra*` is not sold. */
export type Plan = {
  id: string;
  name: string;
  tagline: string;
  inclusions: string[];
  interval: PlanInterval;
  baseCentavos: number;
  includedHelpers: number | null;
  includedManagers: number | null;
  includedHomes: number | null;
  extraHelperCentavos: number | null;
  extraManagerCentavos: number | null;
  extraHomeCentavos: number | null;
  trialDays: number;
  isPublic: boolean;
  status: PlanStatus;
  sortOrder: number;
};

export type PlatformSettings = {
  freeTierEnabled: boolean;
  freeHelperSeats: number | null;
  freeManagerSeats: number | null;
  supportEmail: string | null;
};

/** One plan of `billing_public_plans()`: the billing_plans columns, snake_case. */
export type PlanRow = {
  id: string;
  name: string;
  tagline: string;
  inclusions: string[];
  interval: PlanInterval;
  base_centavos: number;
  included_helpers: number | null;
  included_managers: number | null;
  included_homes: number | null;
  extra_helper_centavos: number | null;
  extra_manager_centavos: number | null;
  extra_home_centavos: number | null;
  trial_days: number;
  is_public: boolean;
  status: PlanStatus;
  sort_order: number;
};

/** The `billing_settings_public()` reply. */
export type PlatformSettingsRow = {
  free_tier_enabled: boolean;
  free_helper_seats: number | null;
  free_manager_seats: number | null;
  support_email: string | null;
};

const orNull = (n: number | null) => (n === null ? null : Number(n));

export function planFromRow(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    inclusions: row.inclusions,
    interval: row.interval,
    baseCentavos: Number(row.base_centavos),
    includedHelpers: row.included_helpers,
    includedManagers: row.included_managers,
    includedHomes: row.included_homes,
    extraHelperCentavos: orNull(row.extra_helper_centavos),
    extraManagerCentavos: orNull(row.extra_manager_centavos),
    extraHomeCentavos: orNull(row.extra_home_centavos),
    trialDays: row.trial_days,
    isPublic: row.is_public,
    status: row.status,
    sortOrder: row.sort_order,
  };
}

export function settingsFromRow(row: PlatformSettingsRow): PlatformSettings {
  return {
    freeTierEnabled: row.free_tier_enabled,
    freeHelperSeats: row.free_helper_seats,
    freeManagerSeats: row.free_manager_seats,
    supportEmail: row.support_email,
  };
}
