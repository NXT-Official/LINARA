import { describe, expect, it } from "vitest";

import { NO_TEAM } from "./teams.constants";
import type { StaffScope, Team } from "./teams.types";
import { filterStaff, groupByTeam, isScoped } from "./teams.utils";

const kitchen: Team = { id: "t-kitchen", name: "Kitchen" };
const grounds: Team = { id: "t-grounds", name: "Grounds" };
const staff = [
  { id: "h1", name: "Ate Rosa", teamId: "t-kitchen" },
  { id: "h2", name: "Kuya Manuel", teamId: "t-grounds" },
  { id: "h3", name: "Lita", teamId: null },
  { id: "h4", name: "Marites", teamId: "t-kitchen" },
];
const labels = new Map([
  ["h1", ["l-night"]],
  ["h4", ["l-night", "l-trainee"]],
]);
const known = {
  teamIds: new Set([kitchen.id, grounds.id]),
  labelIds: new Set(["l-night", "l-trainee"]),
};
const scope = (over: Partial<StaffScope> = {}): StaffScope => ({
  query: "",
  teamId: null,
  labelIds: [],
  groupBy: "team",
  ...over,
});
const ids = (list: { id: string }[]) => list.map((x) => x.id);

describe("filterStaff", () => {
  it("lets everyone through an empty scope", () => {
    expect(ids(filterStaff(staff, scope(), labels, known))).toEqual(["h1", "h2", "h3", "h4"]);
  });

  it("searches any part of the name, ignoring case", () => {
    expect(ids(filterStaff(staff, scope({ query: "ROS" }), labels, known))).toEqual(["h1"]);
  });

  it("narrows to one team, or to nobody's", () => {
    expect(ids(filterStaff(staff, scope({ teamId: kitchen.id }), labels, known))).toEqual([
      "h1",
      "h4",
    ]);
    expect(ids(filterStaff(staff, scope({ teamId: NO_TEAM }), labels, known))).toEqual(["h3"]);
  });

  it("needs every chosen label", () => {
    expect(ids(filterStaff(staff, scope({ labelIds: ["l-night"] }), labels, known))).toEqual([
      "h1",
      "h4",
    ]);
    expect(
      ids(filterStaff(staff, scope({ labelIds: ["l-night", "l-trainee"] }), labels, known)),
    ).toEqual(["h4"]);
  });

  it("ignores a team or label that no longer exists rather than hiding everyone", () => {
    const stale = scope({ teamId: "t-gone", labelIds: ["l-gone"] });
    expect(filterStaff(staff, stale, labels, known)).toHaveLength(4);
  });
});

describe("groupByTeam", () => {
  it("puts teams in name order and No team last, keeping each team's order", () => {
    const groups = groupByTeam(staff, [kitchen, grounds]);
    expect(groups.map((g) => g.title)).toEqual(["Grounds", "Kitchen", "No team"]);
    expect(ids(groups[1].items)).toEqual(["h1", "h4"]);
  });

  it("leaves out empty teams, and files an unknown team under No team", () => {
    const groups = groupByTeam([{ id: "h9", name: "Ben", teamId: "t-gone" }], [kitchen]);
    expect(groups.map((g) => g.key)).toEqual([NO_TEAM]);
  });
});

describe("isScoped", () => {
  it("is true for a team or a label, not for a search", () => {
    expect(isScoped(scope({ query: "rosa" }))).toBe(false);
    expect(isScoped(scope({ teamId: kitchen.id }))).toBe(true);
    expect(isScoped(scope({ labelIds: ["l-night"] }))).toBe(true);
  });
});
