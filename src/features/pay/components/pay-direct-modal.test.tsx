// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PayoutAccount } from "../payout-account.actions";
import { PayDirectModal } from "./pay-direct-modal";

const account = vi.hoisted(() => ({ current: null as unknown }));
const preview = vi.hoisted(() => ({ netPay: 3812.5 }));

vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));
vi.mock("@/features/dashboard/app-store-context", () => ({
  useAppStores: () => ({ session: { token: "t" } }),
}));
vi.mock("../payout-account.actions", () => ({
  getPayoutAccountFn: vi.fn(async () => account.current),
}));
vi.mock("../pay.actions", () => ({
  previewPaymentFn: vi.fn(async () => preview),
}));

const saved: PayoutAccount = {
  source: "helper",
  method: "PH_GCASH",
  accountName: "Marites Santos",
  accountNumber: "09171234567",
  qrUrl: null,
  updatedAt: "2026-10-01T00:00:00Z",
};

const open = (found: PayoutAccount) => {
  account.current = found;
  const onSubmit = vi.fn(async () => ({ netPay: preview.netPay }));
  const onClose = vi.fn();
  render(
    <PayDirectModal
      helperId="hp1"
      helperName="Marites"
      periodLabel="Oct 1 – Oct 15"
      onClose={onClose}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, onClose };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PayDirectModal", () => {
  it("shows the payslip's own amount and her saved number", async () => {
    open(saved);
    expect(await screen.findByText("09171234567")).toBeTruthy();
    expect(screen.getByText("Marites Santos")).toBeTruthy();
    expect(screen.getAllByText(/3,812\.50/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Pay Marites by GCash" })).toBeTruthy();
  });

  it("records it as a GCash payment, with the reference, only on I've sent it", async () => {
    const { onSubmit, onClose } = open(saved);
    await screen.findByText("09171234567");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/reference number/), {
      target: { value: "1234 567 890123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "I've sent it" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ method: "PH_GCASH", note: "GCash ref 1234567890123" }),
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("warns when the number is only from her invite, and lets you pick the wallet", async () => {
    const { onSubmit } = open({
      source: "invite",
      accountName: "Marites",
      accountNumber: "09181234567",
    });
    expect(await screen.findByText(/hasn't confirmed it in her app/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Maya"));
    fireEvent.click(screen.getByRole("button", { name: "I've sent it" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ method: "PH_PAYMAYA", note: "Sent by Maya" }),
      ),
    );
  });

  it("with nothing on file, says how to fix it and records nothing", async () => {
    open({ source: "none" });
    expect(await screen.findByText(/no GCash number for Marites yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "I've sent it" })).toBeNull();
  });
});
