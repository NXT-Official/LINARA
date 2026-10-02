import { describe, expect, it } from "vitest";

import { isDueForRenewal, jwtTimes, msUntilRenewal, RENEW_MARGIN_MS } from "./people.utils";

const HOUR = 60 * 60_000;
const ISSUED = Date.UTC(2026, 9, 2, 8, 0, 0);

/** An unsigned JWT with the given issued-at / expiry (ms) -- only the claims are read. */
function jwt(iatMs: number, expMs: number): string {
  const b64url = (v: object) =>
    btoa(JSON.stringify(v)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url({ alg: "HS256" })}.${b64url({ iat: iatMs / 1000, exp: expMs / 1000 })}.sig`;
}

const token = jwt(ISSUED, ISSUED + HOUR);

describe("jwtTimes", () => {
  it("reads iat and exp in ms", () => {
    expect(jwtTimes(token)).toEqual({ iat: ISSUED, exp: ISSUED + HOUR });
  });

  it("is null for junk or a token with no lifetime", () => {
    expect(jwtTimes("not-a-jwt")).toBeNull();
    expect(jwtTimes(jwt(ISSUED, ISSUED))).toBeNull();
  });
});

describe("msUntilRenewal", () => {
  it("renews the margin before expiry", () => {
    expect(msUntilRenewal(token, ISSUED)).toBe(HOUR - RENEW_MARGIN_MS);
    expect(msUntilRenewal(token, ISSUED + 30 * 60_000)).toBe(30 * 60_000 - RENEW_MARGIN_MS);
  });

  it("is due now inside the margin", () => {
    expect(msUntilRenewal(token, ISSUED + HOUR - 60_000)).toBe(0);
  });

  it("falls back to the lifetime when the clock says it's already expired", () => {
    // A clock set ahead would otherwise renew every new token straight away.
    expect(msUntilRenewal(token, ISSUED + 3 * HOUR)).toBe(HOUR - RENEW_MARGIN_MS);
  });

  it("falls back to the lifetime when the clock is behind the token", () => {
    expect(msUntilRenewal(token, ISSUED - 5 * HOUR)).toBe(HOUR - RENEW_MARGIN_MS);
  });

  it("is null for a token it can't read", () => {
    expect(msUntilRenewal("not-a-jwt", ISSUED)).toBeNull();
  });
});

describe("isDueForRenewal", () => {
  it("is false for a fresh token and true near or past expiry", () => {
    expect(isDueForRenewal(token, ISSUED)).toBe(false);
    expect(isDueForRenewal(token, ISSUED + HOUR - 60_000)).toBe(true);
    expect(isDueForRenewal(token, ISSUED + 5 * HOUR)).toBe(true);
  });

  it("is true for a token it can't read", () => {
    expect(isDueForRenewal("not-a-jwt", ISSUED)).toBe(true);
  });
});
