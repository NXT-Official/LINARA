// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Entitlements } from "../billing.types";

const billing = vi.hoisted(() => ({ value: { status: "loading", data: null } as unknown }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/features/dashboard/app-store-context", () => ({
  useAppStores: () => ({ session: { token: "t", householdId: "h1", status: "authed" } }),
}));
vi.mock("../hooks/use-billing", () => ({ useBilling: () => billing.value }));

import { BillingNotice, noticeFor } from "./billing-notice";

afterEach(cleanup);

const ent = (over: Partial<Entitlements>): Entitlements => ({
  source: "subscription",
  subscriptionId: "s1",
  planName: "Home",
  status: "active",
  effectiveStatus: "active",
  helperSeats: 3,
  managerSeats: 2,
  periodEnd: "2026-10-12T00:00:00.000Z",
  daysLeft: 20,
  ...over,
});
const usage = { helpers: 1, managers: 1 };

describe("noticeFor", () => {
  it("says nothing for an active plan", () => {
    expect(noticeFor(ent({}), usage)).toBeNull();
  });

  it("says nothing when there are no entitlements yet", () => {
    expect(noticeFor(null, usage)).toBeNull();
  });

  it("says nothing for an expired plan whose free tier is unlimited and not exceeded", () => {
    const e = ent({
      source: "free",
      effectiveStatus: "expired",
      helperSeats: null,
      managerSeats: null,
    });
    expect(noticeFor(e, usage)).toBeNull();
  });

  it("explains a past-due plan with its end date and the seven days", () => {
    const n = noticeFor(
      ent({ effectiveStatus: "past_due" }),
      usage,
      new Date("2026-10-14T00:00:00.000Z"),
    );
    expect(n?.text).toBe(
      "Your plan's period ended on October 12, 2026. You have 7 days to renew before seats go back to the free tier.",
    );
  });

  it("says a short payment, not an ended period, when past due before the period ends", () => {
    const n = noticeFor(
      ent({ effectiveStatus: "past_due" }),
      usage,
      new Date("2026-10-01T00:00:00.000Z"),
    );
    expect(n?.text).toBe("Your last payment didn't cover the plan. Check your plan.");
  });

  it("says the plan lapsed when nothing is left to fall back on", () => {
    const n = noticeFor(ent({ source: "none", effectiveStatus: "expired" }), usage);
    expect(n?.text).toBe(
      "Your plan has lapsed. You can't add helpers or managers until you renew.",
    );
  });

  it("says the plan lapsed when usage is over the free seats", () => {
    const e = ent({
      source: "free",
      effectiveStatus: "expired",
      helperSeats: 1,
      managerSeats: null,
    });
    expect(noticeFor(e, { helpers: 3, managers: 1 })?.text).toMatch(/has lapsed/);
  });

  it("warns of a trial ending at 3 days and not at 4", () => {
    const trial = { status: "trialing", effectiveStatus: "trialing" };
    expect(noticeFor(ent({ ...trial, daysLeft: 3 }), usage)?.text).toBe(
      "Your trial ends in 3 days.",
    );
    expect(noticeFor(ent({ ...trial, daysLeft: 4 }), usage)).toBeNull();
    expect(noticeFor(ent({ ...trial, daysLeft: 1 }), usage)?.text).toBe(
      "Your trial ends in 1 day.",
    );
  });
});

describe("BillingNotice", () => {
  it("renders nothing while loading or unavailable", () => {
    const { container } = render(<BillingNotice />);
    expect(container.textContent).toBe("");
  });

  it("shows the notice with a link to the plan", () => {
    billing.value = {
      status: "ready",
      data: {
        entitlements: ent({ effectiveStatus: "past_due" }),
        usage,
      },
    };
    render(<BillingNotice />);
    expect(screen.getByText(/You have 7 days to renew/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "See your plan" }).getAttribute("href")).toBe(
      "/manager/plan",
    );
  });
});
