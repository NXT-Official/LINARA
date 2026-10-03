// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Admin } from "../people.types";
import { ManagersSection } from "./managers-section";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("../household.actions", () => ({
  listManagerInvitesFn: vi.fn(async () => [
    { id: "inv1", code: "K7PQ2MXA", role: "remote_admin", expiresAt: "2026-10-10T00:00:00Z" },
  ]),
  createManagerInviteFn: vi.fn(),
  revokeManagerInviteFn: vi.fn(),
}));

const ben: Admin = {
  id: "u-ben",
  name: "Ben Reyes",
  short: "Ben",
  initials: "BR",
  type: "primary",
  location: "On-site",
};
const nora: Admin = {
  id: "u-nora",
  name: "Nora Reyes",
  short: "Nora",
  initials: "NR",
  type: "co",
  location: "On-site",
};
const fe: Admin = {
  id: "u-fe",
  name: "Lola Fe",
  short: "Lola",
  initials: "LF",
  type: "remote",
  location: "Remote",
};

const session = {
  admins: [ben, nora, fe],
  currentAdmin: ben,
  adminType: "primary" as Admin["type"],
  multiManager: true,
  token: "t",
  setManagerRole: vi.fn(async () => {}),
  removeManager: vi.fn(async () => {}),
  leaveHousehold: vi.fn(async () => {}),
};
let current = session;
vi.mock("@/features/dashboard/app-store-context", () => ({
  useAppStores: () => ({ session: current }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  current = session;
});

describe("ManagersSection", () => {
  it("lists every manager with their role", () => {
    render(<ManagersSection />);
    expect(screen.getByText("Ben Reyes")).toBeTruthy();
    expect(screen.getByText("Nora Reyes")).toBeTruthy();
    expect(screen.getByText("Lola Fe")).toBeTruthy();
    expect(screen.getAllByText("Remote admin").length).toBeGreaterThan(0);
  });

  it("gives the primary manager the controls, and open codes", async () => {
    render(<ManagersSection />);
    expect(screen.getByRole("button", { name: /Invite a manager/ })).toBeTruthy();
    expect(screen.getByLabelText("Nora Reyes's role")).toBeTruthy();
    // Not for yourself.
    expect(screen.queryByLabelText("Ben Reyes's role")).toBeNull();
    await waitFor(() => expect(screen.getByText("K7PQ2MXA")).toBeTruthy());
  });

  it("asks before handing over primary, then hands it over", async () => {
    render(<ManagersSection />);
    fireEvent.click(screen.getAllByRole("button", { name: "Make primary" })[0]);
    const prompt = screen.getByText(/Make Nora the primary manager\? You'll become a co-manager/);
    expect(session.setManagerRole).not.toHaveBeenCalled();
    fireEvent.click(within(prompt).getByRole("button", { name: /Make primary/ }));
    await waitFor(() =>
      expect(session.setManagerRole).toHaveBeenCalledWith("u-nora", "primary_manager"),
    );
  });

  it("asks before removing someone", async () => {
    render(<ManagersSection />);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    const prompt = screen.getByText(/Take Lola off this household/);
    fireEvent.click(within(prompt).getByRole("button", { name: /Remove/ }));
    await waitFor(() => expect(session.removeManager).toHaveBeenCalledWith("u-fe"));
  });

  it("changes a role from the picker", async () => {
    render(<ManagersSection />);
    fireEvent.change(screen.getByLabelText("Nora Reyes's role"), {
      target: { value: "remote_admin" },
    });
    await waitFor(() =>
      expect(session.setManagerRole).toHaveBeenCalledWith("u-nora", "remote_admin"),
    );
  });

  it("lets a co-manager leave, and nothing else", async () => {
    current = { ...session, currentAdmin: nora, adminType: "co" };
    render(<ManagersSection />);
    expect(screen.queryByRole("button", { name: /Invite a manager/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Leave household/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Leave$/ }));
    await waitFor(() => expect(session.leaveHousehold).toHaveBeenCalled());
  });

  it("offers nothing before the SQL is applied", () => {
    current = { ...session, admins: [ben], multiManager: false };
    render(<ManagersSection />);
    expect(screen.getByText("Ben Reyes")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Invite a manager/ })).toBeNull();
  });
});
