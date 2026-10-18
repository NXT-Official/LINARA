import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { computeStatutorySplit, initialsOf, shortNameOf } from "./people.utils";

/**
 * Batas Kasambahay's statutory split exists in BOTH repos -- here and in
 * ../LINARA_MOBILE/lib/statutory.ts -- because neither can import the other.
 * Nothing structural stopped them drifting, and a drift would put the manager's
 * deduction and the kasambahay's payslip on different numbers for the same
 * wage. That is precisely the failure C41 closed for net pay, one level up.
 *
 * Two guards, because they catch different mistakes:
 *
 *   1. A value table, mirrored verbatim in ../LINARA_MOBILE/lib/statutory.test.ts.
 *      Catches a change made without updating that repo's own test.
 *   2. A direct comparison of the two function bodies. Catches a change made to
 *      one repo AND its test, which the value tables alone would let through --
 *      the likeliest shape of a real drift, since someone updating a rate would
 *      naturally update the test beside it and never open the other repo.
 */

const REPO_ROOT = resolve(__dirname, "../../..");

/** Numbers must match ../LINARA_MOBILE/lib/statutory.test.ts exactly. */
const CASES = [
  // Under ₱5,000/mo the employer pays every share (RA 10361): SSS on the
  // ₱5,000 floor credit (₱750 + ₱10 EC), PhilHealth on its ₱10,000 floor
  // (₱500), Pag-IBIG 2% + her 2% (1% at ₱1,500 or less).
  { wage: 0, employer: 1260, employee: 0, under5k: true },
  { wage: 1500, employer: 1305, employee: 0, under5k: true },
  { wage: 4999, employer: 1459.96, employee: 0, under5k: true },
  // ₱5,000 exactly is NOT "under" -- the boundary is where an off-by-one hides.
  { wage: 5000, employer: 860, employee: 600, under5k: false },
  // SSS 5% / 10% (+₱10 EC) of the credit, PhilHealth ₱250 each to ₱10,000, Pag-IBIG 2% each.
  { wage: 8000, employer: 1220, employee: 810, under5k: false },
  { wage: 9000, employer: 1340, employee: 880, under5k: false },
  // Above ₱10,000 PhilHealth grows with the wage and Pag-IBIG stops at ₱200.
  { wage: 12000, employer: 1710, employee: 1100, under5k: false },
  // EC goes from ₱10 to ₱30 at a ₱15,000 credit.
  { wage: 14500, employer: 2022.5, employee: 1287.5, under5k: false },
  { wage: 15000, employer: 2105, employee: 1325, under5k: false },
  // SSS stops at the ₱35,000 credit.
  { wage: 40000, employer: 4730, employee: 2950, under5k: false },
];

/**
 * The body of `computeStatutorySplit`, stripped to comparable form: comments
 * gone (the two copies document themselves differently and should), whitespace
 * collapsed. What remains is the arithmetic and the literals, which is exactly
 * what has to agree.
 */
function splitBody(source: string): string {
  const start = source.indexOf("export function computeStatutorySplit");
  if (start === -1) return "";

  // Walk braces from the signature to find the function's own closing brace,
  // rather than guessing at the next `}` or the end of the file.
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  return source
    .slice(open, end)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("computeStatutorySplit", () => {
  it.each(CASES)(
    "₱$wage/mo -> employer ₱$employer, employee ₱$employee",
    ({ wage, employer, employee, under5k }) => {
      const split = computeStatutorySplit(wage);
      expect(split.isUnder5k).toBe(under5k);
      expect(split.totalEmployer).toBe(employer);
      expect(split.totalEmployee).toBe(employee);
    },
  );

  it("totals equal the sum of their three parts", () => {
    const split = computeStatutorySplit(9000);
    expect(split.totalEmployer).toBe(
      split.sssEmployer + split.philhealthEmployer + split.pagibigEmployer,
    );
    expect(split.totalEmployee).toBe(
      split.sssEmployee + split.philhealthEmployee + split.pagibigEmployee,
    );
  });

  it("charges the employee nothing below the threshold", () => {
    // RA 10361: under ₱5,000/mo the employer covers 100%, so nothing is
    // deducted from her pay at all.
    const split = computeStatutorySplit(4999);
    expect(split.sssEmployee).toBe(0);
    expect(split.philhealthEmployee).toBe(0);
    expect(split.pagibigEmployee).toBe(0);
  });

  it("is character-for-character the same as LINARA_MOBILE's copy", (ctx) => {
    // Skips when the sibling repo is not checked out beside this one (CI). The
    // value table above still runs there, and ../LINARA_MOBILE runs its own.
    const mobile = resolve(REPO_ROOT, "../LINARA_MOBILE/lib/statutory.ts");
    if (!existsSync(mobile)) {
      ctx.skip();
      return;
    }

    const ours = splitBody(
      readFileSync(resolve(REPO_ROOT, "src/features/people/people.utils.ts"), "utf8"),
    );
    const theirs = splitBody(readFileSync(mobile, "utf8"));

    expect(ours).not.toBe("");
    // If this fails: a rate changed on one side only. Both repos move together,
    // in one pass -- do not "fix" it by editing this test.
    expect(theirs).toBe(ours);
  });
});

describe("names", () => {
  it("drops a leading title before shortening", () => {
    expect(shortNameOf("Ate Marites")).toBe("Marites");
    expect(shortNameOf("Kuya Marito")).toBe("Marito");
    expect(shortNameOf("Manang Rosa Dela Cruz")).toBe("Rosa");
    expect(initialsOf("Ate Marites")).toBe("M");
    expect(initialsOf("Manang Rosa Dela Cruz")).toBe("RD");
  });

  it("uses the first name of a full name, not the surname", () => {
    expect(shortNameOf("Nicole Azachee")).toBe("Nicole");
    expect(initialsOf("Nicole Azachee")).toBe("NA");
  });

  it("handles Ma., a title on its own, and one-word names", () => {
    expect(shortNameOf("Ma. Theresa Cruz")).toBe("Theresa");
    expect(initialsOf("Ma. Theresa Cruz")).toBe("MT");
    expect(shortNameOf("Kuya")).toBe("Kuya");
    expect(shortNameOf("Jessa")).toBe("Jessa");
    expect(initialsOf("")).toBe("??");
  });
});
