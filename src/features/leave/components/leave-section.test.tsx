// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Helper } from "@/features/people/people.types";
import { UNKNOWN_HELPER } from "@/features/people/people.utils";

import type { LeaveRequest } from "../leave.types";
import { LeaveSection } from "./leave-section";

vi.mock("../leave.actions", () => ({
  getLeaveBalancesFn: vi.fn(async () => [
    {
      helperId: "h1",
      silDays: 2,
      silEligibleFrom: "2026-06-01",
      silYearEnd: "2027-05-31",
      restOwedMinutes: 520,
    },
  ]),
}));

const rosa: Helper = { ...UNKNOWN_HELPER, id: "h1", name: "Rosa Dela Cruz", short: "Rosa" };

const leave = (over: Partial<LeaveRequest>): LeaveRequest => ({
  id: "l1",
  helperId: "h1",
  kind: "sil",
  reason: "vacation",
  startDate: "2026-10-05",
  endDate: "2026-10-07",
  days: 3,
  minutes: 0,
  note: null,
  status: "approved",
  declineReason: null,
  helperAck: null,
  helperAckNote: null,
  ...over,
});

function renderSection(over: Partial<Parameters<typeof LeaveSection>[0]> = {}) {
  const onCancel = vi.fn();
  render(
    <LeaveSection
      helpers={[rosa]}
      leave={[
        leave({}),
        leave({
          id: "sick",
          kind: "unpaid",
          reason: "sick",
          startDate: "2026-09-28",
          endDate: "2026-09-29",
          days: 2,
          helperAck: "disputed",
          helperAckNote: "Isang araw lang",
        }),
      ]}
      token="token"
      todayIso="2026-10-02"
      canManage
      payDaysFor={() => 365}
      onSetPayDays={() => {}}
      onRecord={async () => true}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { onCancel };
}

afterEach(cleanup);

describe("LeaveSection", () => {
  it("shows what she has left", async () => {
    renderSection();
    expect(await screen.findByText(/2 of 5 SIL days left until May 31/)).toBeTruthy();
    expect(screen.getByText(/8h 40m rest owed/)).toBeTruthy();
  });

  it("flags a recorded leave she disputes", () => {
    renderSection();
    expect(screen.getByText('Rosa disputes this: "Isang araw lang"')).toBeTruthy();
  });

  it("offers Cancel only on leave that hasn't started", () => {
    const { onCancel } = renderSection();
    const cancels = screen.getAllByRole("button", { name: "Cancel" });
    expect(cancels).toHaveLength(1);
    fireEvent.click(cancels[0]);
    expect(onCancel).toHaveBeenCalledWith("l1");
  });

  it("is look-only for remote admins", () => {
    renderSection({ canManage: false });
    expect(screen.queryByRole("button", { name: /record leave/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});
