import { describe, expect, it } from "vitest";

import { hasSignedInCookie, SIGNED_IN_COOKIE, signedOutRedirect } from "./signed-in-cookie";

const get = (path: string, cookie?: string, method = "GET") =>
  new Request(`https://linara.test${path}`, {
    method,
    headers: cookie ? { cookie } : {},
  });

describe("hasSignedInCookie", () => {
  it("finds the marker among other cookies", () => {
    expect(hasSignedInCookie(`a=1; ${SIGNED_IN_COOKIE}=1; b=2`)).toBe(true);
  });

  it("is false with no cookies, a cleared marker, or a lookalike name", () => {
    expect(hasSignedInCookie(null)).toBe(false);
    expect(hasSignedInCookie(`${SIGNED_IN_COOKIE}=`)).toBe(false);
    expect(hasSignedInCookie(`x${SIGNED_IN_COOKIE}=1`)).toBe(false);
  });
});

describe("signedOutRedirect", () => {
  it("sends a manager page without the marker to /login with a 307", () => {
    for (const path of ["/manager", "/manager/pass", "/manager/money?tab=pay"]) {
      const res = signedOutRedirect(get(path));
      expect(res?.status).toBe(307);
      expect(res?.headers.get("location")).toBe("/login");
    }
  });

  it("lets a manager page with the marker through", () => {
    expect(signedOutRedirect(get("/manager/pass", `${SIGNED_IN_COOKIE}=1`))).toBeNull();
  });

  it("leaves every other page and request alone", () => {
    expect(signedOutRedirect(get("/"))).toBeNull();
    expect(signedOutRedirect(get("/login"))).toBeNull();
    expect(signedOutRedirect(get("/managers-guide"))).toBeNull();
    expect(signedOutRedirect(get("/_serverFn/abc"))).toBeNull();
    expect(signedOutRedirect(get("/manager/pass", undefined, "POST"))).toBeNull();
  });
});
