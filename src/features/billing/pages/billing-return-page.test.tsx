// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

import { BillingReturnPage } from "./billing-return-page";

afterEach(cleanup);

describe("BillingReturnPage", () => {
  it("thanks the household after a payment", () => {
    render(<BillingReturnPage paid={1} />);
    expect(screen.getByText("Paid, thank you.")).toBeTruthy();
    expect(
      screen.getByText("Xendit tells Linara within a minute; your plan updates on its own."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to your plan" }).getAttribute("href")).toBe(
      "/manager/plan",
    );
    expect(
      screen.getByText("In the Linara app? Close this tab and go back to the app."),
    ).toBeTruthy();
  });

  it("says the payment did not go through", () => {
    render(<BillingReturnPage paid={0} />);
    expect(
      screen.getByText("Payment didn't go through. Try again when you're ready."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to your plan" })).toBeTruthy();
  });
});
