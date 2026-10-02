// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PantryRolePicker } from "./pantry-role-picker";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

afterEach(cleanup);

describe("PantryRolePicker", () => {
  it("marks her current role and changes it on a click", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<PantryRolePicker name="Rosa" role="runner" canChange onChange={onChange} />);

    const group = screen.getByRole("radiogroup", { name: "Pantry access for Rosa" });
    expect(group).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Buys from the list" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByText(/can say when something runs out/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "In charge" }));
    });
    expect(onChange).toHaveBeenCalledWith("lead");
  });

  it("does nothing when her current role is clicked again", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<PantryRolePicker name="Rosa" role="lead" canChange onChange={onChange} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "In charge" }));
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says so when the change doesn't save", async () => {
    const { toast } = await import("sonner");
    const onChange = vi.fn().mockRejectedValue(new Error("column does not exist"));
    render(<PantryRolePicker name="Rosa" role="runner" canChange onChange={onChange} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "In charge" }));
    });
    expect(toast.error).toHaveBeenCalledWith("Couldn't change Rosa's pantry access. Try again.");
  });

  it("is read-only for someone who can't change it", () => {
    render(<PantryRolePicker name="Rosa" role="lead" canChange={false} onChange={vi.fn()} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByText("In charge")).toBeTruthy();
  });
});
