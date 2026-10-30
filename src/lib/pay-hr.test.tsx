// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LegalContributionSplitCard } from "@/features/people/components/legal-contribution-split-card";
import { FEATURES } from "@/features/plan/plan.sample";
import { LOCALES } from "@/lib/i18n/locales";
import { RESOURCES } from "@/lib/i18n/resources";

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

  // The console's pay & HR switch is for Linara's own staff, not a
  // household's helpers: the client app never offers or promises it.
  it("is not listed as a feature of any household plan", () => {
    expect(FEATURES.map((f) => f.key)).not.toContain("staff_pay_hr");
  });

  it("is not promised on the landing page, in any language", () => {
    const PAYROLL =
      /payslip|SSS|PhilHealth|Pag-IBIG|nómina|工资单|薪资记录|給与明細|給与記録|record ng sahod/i;
    for (const l of LOCALES) {
      const landing = (RESOURCES[l.code].translation as { landing: Record<string, string> })
        .landing;
      for (const [k, v] of Object.entries(landing)) {
        expect([l.code, k, PAYROLL.test(v)]).toEqual([l.code, k, false]);
      }
    }
  });

  it("hides SSS / PhilHealth / Pag-IBIG figures, whatever the wage", () => {
    for (const wage of [0, 4999, 16000, Number.NaN]) {
      const { container } = render(<LegalContributionSplitCard wagePHP={wage} />);
      expect(container.innerHTML).toBe("");
      cleanup();
    }
  });
});
