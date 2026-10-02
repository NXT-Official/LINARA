// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PayoutConfirmModal } from "./payout-confirm-modal";

afterEach(cleanup);

const open = (onConfirm: () => Promise<{ status: "processing" | "needs_review" }>) => {
  const onClose = vi.fn();
  render(
    <PayoutConfirmModal
      helperName="John"
      phone="09171234567"
      channel="PH_GCASH"
      periodLabel="Oct 1 – Oct 15"
      estimate={6500}
      onClose={onClose}
      onConfirm={onConfirm}
    />,
  );
  return { onClose };
};

describe("PayoutConfirmModal", () => {
  it("says who, where and how much, and sends nothing until confirmed", () => {
    const onConfirm = vi.fn();
    const { onClose } = open(onConfirm);
    expect(screen.getByText("Send John's pay via GCash?")).toBeTruthy();
    expect(screen.getByText("09171234567")).toBeTruthy();
    expect(screen.getByText("Oct 1 – Oct 15")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("sends on confirm and stays open with the outcome", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ status: "processing" });
    const { onClose } = open(onConfirm);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Send / }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toMatch(/Sent to Xendit/);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("says when it's held for review", async () => {
    open(vi.fn().mockResolvedValue({ status: "needs_review" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Send / }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/held for review/);
  });

  it("shows the error, with no way to resend from here", async () => {
    open(vi.fn().mockRejectedValue(new Error("This helper has no phone number on file")));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Send / }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/no phone number/);
    expect(screen.queryByRole("button", { name: /^Send / })).toBeNull();
  });
});
