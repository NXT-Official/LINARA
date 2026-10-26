// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PayHrDisabledNotice } from "@/components/shared/pay-hr-disabled-notice";
import { LegalContributionSplitCard } from "@/features/people/components/legal-contribution-split-card";

import { assertPayHrEnabled, PAY_HR_DISABLED_MESSAGE, PAY_HR_ENABLED } from "./pay-hr";

afterEach(cleanup);

// Pay and HR stay off until compliance signs them off. These fail the moment
// someone flips PAY_HR_ENABLED, so turning it back on is a deliberate edit
// here too, not a stray change.
describe("staff pay & HR switch", () => {
  it("is off", () => {
    expect(PAY_HR_ENABLED).toBe(false);
  });

  it("makes the pay server functions refuse with the notice's wording", () => {
    expect(() => assertPayHrEnabled()).toThrow(PAY_HR_DISABLED_MESSAGE);
  });

  it("shows the notice where a pay section was", () => {
    render(<PayHrDisabledNotice />);
    expect(screen.getByRole("status").textContent).toContain("temporarily disabled");
  });

  it("hides SSS / PhilHealth / Pag-IBIG figures, whatever the wage", () => {
    for (const wage of [0, 4999, 16000, Number.NaN]) {
      const { container } = render(<LegalContributionSplitCard wagePHP={wage} />);
      expect(container.innerHTML).toBe("");
      cleanup();
    }
  });
});
