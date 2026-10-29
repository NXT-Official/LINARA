// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-mounted", () => ({ useMounted: () => true }));

import { AfterHoursLedger } from "./after-hours-ledger";

afterEach(cleanup);

describe("rest owed, as a manager reads it", () => {
  const show = () =>
    render(
      <AfterHoursLedger
        entries={[]}
        ledgerDefault="rest"
        isExplicitDefault={false}
        onSetDefault={vi.fn()}
        onUpdateEntry={vi.fn()}
        audience="manager"
        helperName="Rosa"
      />,
    );

  it("names the helper, and says nothing meant for developers", () => {
    const { container } = show();
    expect(screen.getByText("Rest owed this month · Rosa")).toBeTruthy();
    expect(container.textContent).not.toMatch(/placeholder|configurable/i);
    expect(container.textContent).not.toMatch(/—/);
  });

  it("the default toggle is big enough to tap one-handed", () => {
    show();
    for (const name of ["Banked rest", "Rest-day premium"]) {
      expect(screen.getByRole("button", { name }).className).toMatch(/\bmin-h-11\b/);
    }
  });
});
