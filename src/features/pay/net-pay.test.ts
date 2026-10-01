import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  netPayForCutoff,
  payComponentsForCutoff,
  thirteenthMonthEstimate,
  workedShareOfCutoff,
} from "./net-pay";

/**
 * Session E / E4 (PAYMENTS_REMEDIATION.md): the regression test Session C
 * specified and never wrote.
 *
 * Session C's acceptance criterion was that the manager's Pay Dial, the
 * helper's DigitalPayslip, and the `net_pay` actually written by
 * `initiate_payslip` all agree for the same helper and cutoff. They do -- but
 * only because the peso line was deleted from one of them (KNOWN_GAPS.md C39),
 * i.e. by construction rather than by assertion. Construction does not survive
 * the next person with a plausible reason to add a term.
 *
 * The rule being defended, from net-pay.ts:
 *
 *     net = max(0, base - statutory employee share - unsettled approved vales
 *                  - unpaid leave)
 *
 * with NO term from `ledger_entries`. After-hours work is time, not money.
 *
 * Four surfaces implement or display it. Two are now one function; the other
 * two are in languages this suite cannot import, so they are pinned by reading
 * their source. That is deliberately cruder than a unit test and deliberately
 * louder than a comment -- if someone reintroduces a ledger term, one of these
 * fails and the message says why it is not a bug in the test.
 */

const REPO_ROOT = resolve(__dirname, "../../..");

/**
 * Strip `//` and block comments before asserting on source.
 *
 * Necessary, not fussiness: `spend-and-payday.tsx` deliberately quotes the
 * deleted `restOwedEarnings = (totalMin - premiumMin)/60 * 120` expression in a
 * comment so the next reader knows what was wrong with it and why. A naive
 * substring check reads that history as a violation -- which it did, on this
 * test's first run. The guards below must fail on the code coming back, not on
 * the record of it having gone.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Same idea for SQL: strip `--` comments, which in these migrations carry
 *  long rationale paragraphs that name the very things being guarded against. */
function sqlCodeOnly(source: string): string {
  return source.replace(/^\s*--.*$/gm, "");
}

/** Numbers chosen to exercise the statutory branch (<5k vs >=5k) and both
 *  intervals. Real sandbox figures: Ate Marites 9000, Kuya Marito 12000. */
const CASES = [
  { monthlyRate: 9000, interval: "semi_monthly" as const, vales: 0, expected: 4500 - 187.5 },
  {
    monthlyRate: 9000,
    interval: "semi_monthly" as const,
    vales: 500,
    expected: 4500 - 187.5 - 500,
  },
  { monthlyRate: 12000, interval: "semi_monthly" as const, vales: 0, expected: 6000 - 187.5 },
  { monthlyRate: 12000, interval: "monthly" as const, vales: 0, expected: 12000 - 375 },
  // Under ₱5,000/mo the employee share is zero (computeStatutorySplit).
  { monthlyRate: 4000, interval: "monthly" as const, vales: 0, expected: 4000 },
];

describe("netPayForCutoff -- the shared rule", () => {
  it.each(CASES)(
    "₱$monthlyRate $interval with ₱$vales vales -> ₱$expected",
    ({ monthlyRate, interval, vales, expected }) => {
      expect(netPayForCutoff(monthlyRate, interval, vales)).toBeCloseTo(expected, 2);
    },
  );

  it("takes unpaid leave as Postgres prices it, pro-rated cutoffs included", () => {
    // 2 days at 8000 x 12 / 365 = 526.03, the figure unpaid-leave-pay.test.mjs
    // gets from unpaid_leave_due for the same helper.
    expect(netPayForCutoff(8000, "semi_monthly", 500, 1, 526.03)).toBeCloseTo(2786.47, 2);
    expect(netPayForCutoff(8000, "semi_monthly", 0, 3 / 15, 263.01)).toBeCloseTo(
      800 - 37.5 - 263.01,
      2,
    );
    expect(netPayForCutoff(8000, "semi_monthly", 0, 1, 99_999)).toBe(0);
  });

  it("floors at zero rather than going negative, matching GREATEST(0, ...)", () => {
    // A vale larger than the whole cutoff's pay. Postgres clamps with
    // GREATEST(0, ...); if this side ever returned a negative, the Pay Dial
    // would show a debt the payout would never collect.
    expect(netPayForCutoff(9000, "semi_monthly", 99_999)).toBe(0);
  });

  it("splits base and statutory across cutoffs consistently", () => {
    const monthly = payComponentsForCutoff(9000, "monthly");
    const semi = payComponentsForCutoff(9000, "semi_monthly");
    expect(semi.basePay * 2).toBeCloseTo(monthly.basePay, 6);
    expect(semi.statutoryEmployeeShare * 2).toBeCloseTo(monthly.statutoryEmployeeShare, 6);
  });

  it("takes no ledger/rest-owed input at all", () => {
    // The invariant is enforced by the signature: there is no parameter a
    // rest-owed total could be passed through. Arity is the assertion.
    expect(netPayForCutoff.length).toBe(3);
  });
});

describe("the other surfaces still implement the same rule", () => {
  it("initiate_payslip computes net_pay from exactly base - statutory - vales - unpaid leave", () => {
    const sql = readFileSync(resolve(REPO_ROOT, "supabase/add-unpaid-leave-pay.sql"), "utf8");

    // The current definition of initiate_payslip lives in the unpaid-leave
    // migration (LEAVE_PLAN.md step 5; before that add-pay-periods.sql for
    // O15/O16, O4's final cutoff, and C38). If a later migration redefines the
    // function, this test must be repointed at that file -- which is itself a
    // useful forcing function, since a redefinition is exactly when the
    // formula could drift.
    expect(sql).toContain("CREATE FUNCTION public.initiate_payslip(");
    expect(sql).toContain(
      "v_net_pay := GREATEST(0, p_base_pay - p_statutory_employee_share - v_vale_total - v_leave_total);",
    );
  });

  it("initiate_payslip never reads ledger_entries", () => {
    const sql = readFileSync(resolve(REPO_ROOT, "supabase/add-unpaid-leave-pay.sql"), "utf8");
    const body = sqlCodeOnly(sql.slice(sql.indexOf("CREATE FUNCTION public.initiate_payslip(")));

    // C39's first defect: the Pay Dial promised money the payout never
    // contained. The payout reading the ledger would be the same bug from the
    // other end -- rest owed would be paid AND still redeemable as time.
    expect(body).not.toMatch(/ledger_entries/);
    expect(body).not.toMatch(/rest_owed/);
  });

  it("the Pay Dial does not monetize rest-owed minutes", () => {
    const dial = codeOnly(
      readFileSync(
        resolve(REPO_ROOT, "src/features/dashboard/components/spend-and-payday.tsx"),
        "utf8",
      ),
    );

    // It may still SHOW rest owed -- as time, via fmtHoursMinutes. What it must
    // never do is multiply minutes by a rate (the deleted ₱120/hr literal) or
    // fold them into a peso total.
    expect(dial).toContain("fmtHoursMinutes(restOwedMin)");
    expect(dial).not.toMatch(/restOwed\w*\s*[*/]/);
    expect(dial).not.toMatch(/restOwedEarnings/);
    expect(dial).not.toMatch(/restOwedRate/);
  });

  it("the payroll hook derives amounts through the shared rule", () => {
    // The arithmetic moved out of the dial and into useHouseholdPayroll when
    // the card became household-wide. This assertion moved with it -- a guard
    // left pointing at the old location would still pass while guarding
    // nothing, which is worse than not having it.
    const hook = codeOnly(
      readFileSync(resolve(REPO_ROOT, "src/features/pay/hooks/use-household-payroll.ts"), "utf8"),
    );

    expect(hook).toContain("netPayForCutoff(");
    // No independent restatement of the formula, and no ledger term anywhere
    // near a peso figure.
    expect(hook).not.toMatch(/statutor\w*\s*[-+]/i);
    expect(hook).not.toMatch(/restOwed\w*\s*[*]/);
  });

  it("a paid cutoff reports the payslip's snapshot, not a recomputation", () => {
    // The defect this hook was written for: the dial ignored `payslips`, so a
    // cutoff already paid still displayed its full accrued amount. Once paid,
    // the record is the honest number -- a recomputation would silently rewrite
    // history if the wage changed mid-cutoff (same reasoning as C10).
    const hook = codeOnly(
      readFileSync(resolve(REPO_ROOT, "src/features/pay/hooks/use-household-payroll.ts"), "utf8"),
    );

    expect(hook).toContain("payslip?.netPay");
    expect(hook).toMatch(/state === "due"/);
  });

  it("LINARA_MOBILE states the same rule, when the sibling repo is present", (ctx) => {
    // Cross-repo per AGENTS.md: LINARA owns the schema and mobile reads
    // payslips, so a divergence here is the C33 failure mode.
    //
    // This is now a SECOND line of defence, not the only one. LINARA_MOBILE
    // gained vitest on 2026-08-17 and asserts its own arithmetic in
    // lib/net-pay.test.ts, which runs in that repo's CI where this check
    // cannot. What remains here is the cheap cross-check that the two repos
    // still say the same thing -- it skips when the sibling is absent.
    const mobile = resolve(REPO_ROOT, "../LINARA_MOBILE/lib/net-pay.ts");
    if (!existsSync(mobile)) {
      ctx.skip();
      return;
    }

    const src = codeOnly(readFileSync(mobile, "utf8"));
    expect(src).toContain(
      "Math.max(0, basePay - statutoryEmployeeShare - approvedValeTotal - unpaidLeaveDeduction)",
    );
    expect(src).not.toMatch(/ledger|restOwed|rest_owed/i);

    // And that the component actually routes through it rather than restating
    // the arithmetic inline. This check can only live here: doing it in
    // LINARA_MOBILE would mean pulling @types/node into a React Native app's
    // typecheck to get `node:fs`.
    const component = resolve(
      REPO_ROOT,
      "../LINARA_MOBILE/components/features/pay/digital-payslip.tsx",
    );
    const componentSrc = codeOnly(readFileSync(component, "utf8"));
    expect(componentSrc).toContain("netPayForCutoff(");
    expect(componentSrc).not.toMatch(/ledger|restOwed|rest_owed/i);
  });
});

describe("final, shortened cutoffs", () => {
  it("counts the share of a cutoff worked by calendar days", () => {
    expect(workedShareOfCutoff("2026-10-01", "2026-10-15", "2026-10-01", "2026-10-15")).toBe(1);
    // Final: left on the 3rd.
    expect(workedShareOfCutoff("2026-10-01", "2026-10-03", "2026-10-01", "2026-10-15")).toBeCloseTo(
      3 / 15,
    );
    // First: started on the 10th of Aug 1-15.
    expect(workedShareOfCutoff("2026-08-10", "2026-08-15", "2026-08-01", "2026-08-15")).toBeCloseTo(
      6 / 15,
    );
    expect(workedShareOfCutoff("2026-10-16", "2026-10-31", "2026-10-16", "2026-10-31")).toBe(1);
    expect(workedShareOfCutoff("2026-02-16", "2026-02-20", "2026-02-16", "2026-02-28")).toBeCloseTo(
      5 / 13,
    );
  });

  it("scales base and statutory with it, rounded to centavos", () => {
    const full = payComponentsForCutoff(8000, "semi_monthly");
    expect(full).toEqual({ basePay: 4000, statutoryEmployeeShare: 187.5 });
    expect(payComponentsForCutoff(8000, "semi_monthly", 3 / 15)).toEqual({
      basePay: 800,
      statutoryEmployeeShare: 37.5,
    });
    expect(payComponentsForCutoff(8000, "semi_monthly", 1 / 3).basePay).toBe(1333.33);
  });

  it("estimates 13th-month pay as a twelfth of the year's basic pay", () => {
    expect(thirteenthMonthEstimate(24000)).toBe(2000);
    expect(thirteenthMonthEstimate(0)).toBe(0);
  });
});
