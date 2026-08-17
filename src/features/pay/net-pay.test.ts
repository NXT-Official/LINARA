import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { netPayForCutoff, payComponentsForCutoff } from "./net-pay";

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
 *     net = max(0, base - statutory employee share - unsettled approved vales)
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
  it("initiate_payslip computes net_pay from exactly base - statutory - vales", () => {
    const sql = readFileSync(
      resolve(REPO_ROOT, "supabase/add-household-timezone-and-cutoffs.sql"),
      "utf8",
    );

    // The current definition of initiate_payslip lives in the Session B
    // migration (C38 rewrote it there). If a later migration redefines the
    // function, this test must be repointed at that file -- which is itself a
    // useful forcing function, since a redefinition is exactly when the
    // formula could drift.
    expect(sql).toContain("CREATE FUNCTION public.initiate_payslip(");
    expect(sql).toContain(
      "v_net_pay := GREATEST(0, p_base_pay - p_statutory_employee_share - v_vale_total);",
    );
  });

  it("initiate_payslip never reads ledger_entries", () => {
    const sql = readFileSync(
      resolve(REPO_ROOT, "supabase/add-household-timezone-and-cutoffs.sql"),
      "utf8",
    );
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
    // fold them into netPay.
    expect(dial).toContain("fmtHoursMinutes(restOwedMin)");
    expect(dial).toContain("netPayForCutoff(");
    expect(dial).not.toMatch(/restOwed\w*\s*[*/]/);
    expect(dial).not.toMatch(/restOwedEarnings/);
    expect(dial).not.toMatch(/restOwedRate/);
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
    expect(src).toContain("Math.max(0, basePay - statutoryEmployeeShare - approvedValeTotal)");
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
