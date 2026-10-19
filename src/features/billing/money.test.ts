import { describe, expect, it } from "vitest";

import { fmtCentavos } from "./money";

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
