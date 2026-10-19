import { describe, expect, it } from "vitest";

import { planFromRow, settingsFromRow, type PlanRow, type PlatformSettingsRow } from "./plan.types";

// Column names are exactly those of LINARA_ADMIN 016-billing-plans.sql. PostgREST returns
// BIGINT columns as numbers or, for large values, strings.
const row: PlanRow = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Home",
  tagline: "For one household",
  inclusions: ["Pass", "Board"],
  interval: "monthly",
  base_centavos: "49900" as unknown as number,
  included_helpers: null,
  included_managers: 2,
  included_homes: 0,
  extra_helper_centavos: "9900" as unknown as number,
  extra_manager_centavos: null,
  extra_home_centavos: 0,
  trial_days: 14,
  is_public: true,
  status: "active",
  sort_order: 3,
};

describe("plan row mapping", () => {
  it("reads a row: string bigints become numbers, nulls stay null, zero stays zero", () => {
    expect(planFromRow(row)).toEqual({
      id: row.id,
      name: "Home",
      tagline: "For one household",
      inclusions: ["Pass", "Board"],
      interval: "monthly",
      baseCentavos: 49900,
      includedHelpers: null,
      includedManagers: 2,
      includedHomes: 0,
      extraHelperCentavos: 9900,
      extraManagerCentavos: null,
      extraHomeCentavos: 0,
      trialDays: 14,
      isPublic: true,
      status: "active",
      sortOrder: 3,
    });
  });
});

describe("settings row mapping", () => {
  it("reads the free-tier columns, nulls included", () => {
    const s: PlatformSettingsRow = {
      free_tier_enabled: false,
      free_helper_seats: null,
      free_manager_seats: 1,
      support_email: null,
    };
    expect(settingsFromRow(s)).toEqual({
      freeTierEnabled: false,
      freeHelperSeats: null,
      freeManagerSeats: 1,
      supportEmail: null,
    });
  });
});
