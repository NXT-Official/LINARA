// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Helper } from "@/features/people/people.types";

import { getPayoutAccountFn, type PayoutAccount } from "../payout-account.actions";
import { HelperWalletCard } from "./helper-wallet-card";

vi.mock("../payout-account.actions", () => ({ getPayoutAccountFn: vi.fn() }));
const fetchAccount = vi.mocked(getPayoutAccountFn);

const helper = (id: string, short: string) => ({ id, short, name: short }) as Helper;
const saved = (accountNumber: string, accountName = "Marites Santos"): PayoutAccount => ({
  source: "helper",
  method: "PH_GCASH",
  accountName,
  accountNumber,
  qrUrl: null,
  updatedAt: "2026-10-01T00:00:00Z",
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HelperWalletCard", () => {
  it("shows the GCash number and name the helper saved, and copies the number", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    fetchAccount.mockResolvedValue(saved("09171234567"));
    render(<HelperWalletCard helper={helper("hp1", "Marites")} token="t" />);
    expect(await screen.findByText("09171234567")).toBeTruthy();
    expect(screen.getByText("Marites Santos")).toBeTruthy();
    expect(screen.getByText("GCash number")).toBeTruthy();
    expect(fetchAccount).toHaveBeenCalledWith({ data: { token: "t", helperId: "hp1" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy the account number" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("09171234567"));
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("warns that a number from the invite isn't confirmed", async () => {
    fetchAccount.mockResolvedValue({
      source: "invite",
      accountName: "Marites",
      accountNumber: "0917",
    });
    render(<HelperWalletCard helper={helper("hp1", "Marites")} token="t" />);
    expect(await screen.findByText(/isn't confirmed in their app yet/)).toBeTruthy();
    expect(screen.getByText("Number from the invite")).toBeTruthy();
  });

  it("asks for an account when none is on file, and shows no number", async () => {
    fetchAccount.mockResolvedValue({ source: "none" });
    render(<HelperWalletCard helper={helper("hp1", "Marites")} token="t" />);
    expect(await screen.findByText(/hasn't added a GCash or Maya account/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy the account number" })).toBeNull();
  });

  it("says it couldn't load instead of spinning forever when the server fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchAccount.mockRejectedValue(new Error("network down"));
    render(<HelperWalletCard helper={helper("hp1", "Marites")} token="t" />);
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load the account");
  });

  it("never shows the previous helper's number after switching, whatever order replies come in", async () => {
    let answerFirst: (a: PayoutAccount) => void = () => {};
    fetchAccount
      .mockImplementationOnce(() => new Promise((r) => (answerFirst = r)))
      .mockResolvedValueOnce(saved("09998887777", "Rosa Cruz"));
    const { rerender } = render(<HelperWalletCard helper={helper("hp1", "Marites")} token="t" />);
    rerender(<HelperWalletCard helper={helper("hp2", "Rosa")} token="t" />);
    expect(await screen.findByText("09998887777")).toBeTruthy();
    await act(async () => answerFirst(saved("09171234567")));
    expect(screen.queryByText("09171234567")).toBeNull();
    expect(screen.getByText("09998887777")).toBeTruthy();
  });

  it("asks nothing of the server when signed out", () => {
    render(<HelperWalletCard helper={helper("hp1", "Marites")} token={null} />);
    expect(fetchAccount).not.toHaveBeenCalled();
  });
});
