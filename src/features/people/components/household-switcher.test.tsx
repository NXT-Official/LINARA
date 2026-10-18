// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("../household.actions", () => ({ lookupManagerInviteFn: vi.fn(async () => null) }));
vi.mock("@/features/dashboard/app-store-context", () => ({ useAppStores: () => ({}) }));

import { JoinHouseholdForm } from "./household-switcher";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("JoinHouseholdForm", () => {
  it("says the household is out of manager seats when the claim is refused for want of one", async () => {
    const onJoin = vi.fn().mockRejectedValue(new Error("SEAT_LIMIT:manager"));
    render(<JoinHouseholdForm token={null} onJoin={onJoin} />);
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "ABCD2345" } });
    fireEvent.click(screen.getByRole("button", { name: /Join household/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This household has used all its manager seats. Ask its primary manager to add one.",
      ),
    );
  });

  it("keeps every other error as it was", async () => {
    const onJoin = vi.fn().mockRejectedValue(new Error("That code has expired"));
    render(<JoinHouseholdForm token={null} onJoin={onJoin} />);
    fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "ABCD2345" } });
    fireEvent.click(screen.getByRole("button", { name: /Join household/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That code has expired"));
  });
});
