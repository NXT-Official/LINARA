// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AppStoreContext } from "@/features/dashboard/app-store-context";
import type { AppStores } from "@/features/dashboard/app-store-context";

import type { Label } from "../teams.types";
import { useStaffScope } from "./use-staff-scope";

const kitchen: Label = { id: "lab-kitchen", name: "Kitchen", tone: "sand" };
const night: Label = { id: "lab-night", name: "Night Shift", tone: "pine" };
const garden = { id: "team-garden", name: "Garden" };

const stores = (opts: { teamOf?: Record<string, string>; labelsOf?: Record<string, string[]> }) =>
  ({
    activeHelpers: ["h1", "h2"].map((id) => ({ id, name: id, teamId: opts.teamOf?.[id] ?? null })),
    sharing: { coversByHelper: new Map() },
    teams: {
      available: true,
      teams: [garden],
      labels: [kitchen, night],
      teamById: new Map([[garden.id, garden]]),
      labelById: new Map([
        [kitchen.id, kitchen],
        [night.id, night],
      ]),
      labelIdsByHelper: new Map(Object.entries(opts.labelsOf ?? {})),
      labelsOf: () => [],
    },
  }) as unknown as AppStores;

const scopeWith = (value: AppStores) =>
  renderHook(() => useStaffScope(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
    ),
  }).result.current;

afterEach(() => window.localStorage.clear());

describe("useStaffScope", () => {
  it("offers no filters when teams and labels exist but nobody is in them", () => {
    const api = scopeWith(stores({}));
    expect(api.show).toBe(false);
    expect(api.hasTeams).toBe(false);
  });

  it("offers only the labels someone has, and no team filter without team members", () => {
    const api = scopeWith(stores({ labelsOf: { h1: [kitchen.id] } }));
    expect(api.show).toBe(true);
    expect(api.hasTeams).toBe(false);
    expect(api.labelsInUse.map((l) => l.name)).toEqual(["Kitchen"]);
    expect(api.teamsInUse).toEqual([]);
  });

  it("ignores a saved filter for a label nobody has any more", () => {
    window.localStorage.setItem(
      "linara.staffScope",
      JSON.stringify({ teamId: null, labelIds: [night.id], groupBy: "team" }),
    );
    const api = scopeWith(stores({ teamOf: { h1: garden.id }, labelsOf: { h1: [kitchen.id] } }));
    expect(api.scope.labelIds).toEqual([]);
    expect(api.scoped).toBe(false);
    expect(
      api.apply([
        { id: "h1", name: "h1" },
        { id: "h2", name: "h2" },
      ]),
    ).toHaveLength(2);
  });
});
