// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RequirePlatformAdmin } from "./require-platform-admin";

const navigate = vi.fn();
const retry = vi.fn();
const sessionState = vi.hoisted(() => ({
  status: "loading" as "loading" | "anon" | "not_admin" | "admin" | "unavailable" | "error",
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("../hooks/use-platform-admin-session", () => ({
  usePlatformAdminSession: () => ({
    status: sessionState.status,
    token: null,
    userId: null,
    logOut: vi.fn(),
    retry,
  }),
}));

function renderGate() {
  render(
    <RequirePlatformAdmin>
      <p>Admin content</p>
    </RequirePlatformAdmin>,
  );
}

describe("RequirePlatformAdmin", () => {
  beforeEach(() => navigate.mockClear());
  afterEach(cleanup);

  it("shows a spinner and no content while loading", () => {
    sessionState.status = "loading";
    renderGate();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("Admin content")).toBeNull();
  });

  it("sends an anonymous visitor to /login, replacing history", async () => {
    sessionState.status = "anon";
    renderGate();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/login", replace: true }));
    expect(screen.queryByText("Admin content")).toBeNull();
  });

  it("tells a non-admin account so, with a way back", () => {
    sessionState.status = "not_admin";
    renderGate();
    expect(screen.getByText("This account isn't a Linara admin.")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/manager/pass");
    expect(screen.queryByText("Admin content")).toBeNull();
  });

  it("says the tools aren't switched on when the SQL isn't applied", () => {
    sessionState.status = "unavailable";
    renderGate();
    expect(screen.getByText("Admin tools aren't switched on yet")).toBeTruthy();
    expect(screen.queryByText("Admin content")).toBeNull();
  });

  it("offers Try again when the check itself failed", () => {
    sessionState.status = "error";
    renderGate();
    expect(screen.getByText("Couldn't check admin access.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Admin content")).toBeNull();
  });

  it("renders the children for an admin", () => {
    sessionState.status = "admin";
    renderGate();
    expect(screen.getByText("Admin content")).toBeTruthy();
  });
});
