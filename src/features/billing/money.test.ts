import { describe, expect, it } from "vitest";

import { fmtCentavos, pesosToCentavos } from "./money";

describe("fmtCentavos", () => {
  it("formats centavos as pesos with two decimals and separators", () => {
    expect(fmtCentavos(123456)).toBe("₱1,234.56");
    expect(fmtCentavos(0)).toBe("₱0.00");
    expect(fmtCentavos(49900)).toBe("₱499.00");
    expect(fmtCentavos(5)).toBe("₱0.05");
    expect(fmtCentavos(100000000)).toBe("₱1,000,000.00");
  });

  it("puts a minus sign before the peso sign for negatives", () => {
    expect(fmtCentavos(-8030300)).toBe("−₱80,303.00");
    expect(fmtCentavos(-50)).toBe("−₱0.50");
  });
});

describe("pesosToCentavos", () => {
  it("parses pesos with up to two decimals", () => {
    expect(pesosToCentavos("19.99")).toBe(1999);
    expect(pesosToCentavos("499")).toBe(49900);
    expect(pesosToCentavos("0.5")).toBe(50);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "abc", "19.999", "-1", "1.", ".5", "1.2.3", "1e3"]) {
      expect(pesosToCentavos(bad)).toBeNull();
    }
  });
});
