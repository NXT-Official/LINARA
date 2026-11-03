// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Only the server is mocked: the plan store, the teams store and the screens are real.
const server = vi.hoisted(() => ({
  listTeamsAndLabelsFn: vi.fn(),
  createLabelFn: vi.fn(),
  createTeamFn: vi.fn(),
  deleteLabelFn: vi.fn(),
  deleteTeamFn: vi.fn(),
  renameTeamFn: vi.fn(),
  setHelpersTeamFn: vi.fn(),
  setLabelOnHelpersFn: vi.fn(),
  updateLabelFn: vi.fn(),
}));
vi.mock("./teams.actions", () => server);
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
  }: {
    to: string;
    search?: Record<string, string>;
    children: ReactNode;
  }) => <a href={search ? `${to}?${new URLSearchParams(search)}` : to}>{children}</a>,
}));
vi.mock("@/lib/mobile-app", () => ({ inMobileApp: () => false }));
const stores = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/features/dashboard/app-store-context", () => ({ useAppStores: () => stores.current }));

import { changePlan, resetPlan } from "@/features/plan/plan.store";
import { TeamsLabelsSection } from "./components/teams-labels-section";
import { useTeams } from "./hooks/use-teams";

const SAVED = {
  available: true,
  teams: [{ id: "t1", name: "Kitchen" }],
  labels: [{ id: "l1", name: "Stay-in", tone: "sand" }],
  assignments: [{ helperId: "k1", labelId: "l1" }],
};
afterEach(() => {
  cleanup();
  act(() => resetPlan());
  server.listTeamsAndLabelsFn.mockReset();
});

const load = async () => {
  server.listTeamsAndLabelsFn.mockResolvedValue(SAVED);
  const hook = renderHook(() =>
    useTeams({ token: "t", ready: true, onRosterChange: async () => {} }),
  );
  await waitFor(() => expect(server.listTeamsAndLabelsFn).toHaveBeenCalled());
  await act(async () => {});
  return hook;
};

describe("teams and labels follow the plan", () => {
  it("on a plan with them, the saved teams show", async () => {
    // The preview starts on Premium, which has Teams and labels.
    const { result } = await load();
    expect(result.current.available).toBe(true);
    expect(result.current.locked).toBe(false);
    expect(result.current.teams.map((t) => t.name)).toEqual(["Kitchen"]);
  });

  it("on Free they're kept but hidden everywhere, and People shows the lock", async () => {
    act(() => {
      changePlan("free", "monthly", []);
    });
    const { result } = await load();
    expect(result.current.available).toBe(false);
    expect(result.current.locked).toBe(true);
    expect(result.current.teams).toEqual([]);
    expect(result.current.labelIdsByHelper.size).toBe(0);
  });

  it("People: the section is a lock card with the upgrade, not a blank", () => {
    act(() => {
      changePlan("free", "monthly", []);
    });
    stores.current = {
      teams: { available: false, locked: true, teams: [], labels: [], labelIdsByHelper: new Map() },
      invites: { invites: [] },
    };
    render(<TeamsLabelsSection canEdit />);
    expect(screen.getByText("Teams and labels isn't on your plan")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Upgrade to Premium" }).getAttribute("href")).toBe(
      "/manager/plan?upgrade=premium",
    );
  });

  it("before add-teams-and-labels.sql is applied, People shows nothing (as before)", () => {
    stores.current = {
      teams: {
        available: false,
        locked: false,
        teams: [],
        labels: [],
        labelIdsByHelper: new Map(),
      },
      invites: { invites: [] },
    };
    const { container } = render(<TeamsLabelsSection canEdit />);
    expect(container.textContent).toBe("");
  });
});
