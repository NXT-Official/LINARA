import { describe, expect, it } from "vitest";

import { SECURITY_HEADERS, withSecurityHeaders } from "./security-headers";

describe("withSecurityHeaders", () => {
  it("adds the headers and keeps the response as it was", async () => {
    const res = withSecurityHeaders(
      new Response("<p>hi</p>", { status: 201, headers: { "content-type": "text/html" } }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("text/html");
    expect(await res.text()).toBe("<p>hi</p>");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers.get(name)).toBe(value);
    }
  });

  it("forbids framing by any other site", () => {
    const res = withSecurityHeaders(new Response(null));
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("leaves a header the response already set", () => {
    const res = withSecurityHeaders(
      new Response(null, { headers: { "referrer-policy": "no-referrer" } }),
    );
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("keeps a redirect a redirect", () => {
    const res = withSecurityHeaders(
      new Response(null, { status: 307, headers: { location: "/login" } }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/login");
  });
});
