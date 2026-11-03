// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaleDayNotice } from "./stale-day";
import { rolloverDecision } from "./stale-day.logic";

afterEach(cleanup);

describe("the day rollover, once the server has said what day it is", () => {
  it("the device was wrong: nothing to do", () => {
    expect(rolloverDecision("2026-10-09", "2026-10-09")).toEqual({ kind: "device_wrong" });
    expect(rolloverDecision("2026-10-08", "2026-10-09")).toEqual({ kind: "device_wrong" });
  });

  it("a day or two on: roll over by itself", () => {
    expect(rolloverDecision("2026-10-11", "2026-10-09")).toEqual({ kind: "roll", days: 2 });
  });

  it("exactly 14 days is still automatic", () => {
    expect(rolloverDecision("2026-10-23", "2026-10-09")).toEqual({ kind: "roll", days: 14 });
  });

  it("more than 14 days (seen on dev: 20) waits for the manager, and says to which day", () => {
    expect(rolloverDecision("2026-10-29", "2026-10-09")).toEqual({
      kind: "too_far",
      today: "2026-10-29",
      days: 20,
    });
  });

  it("across a month and a year end it still counts days", () => {
    expect(rolloverDecision("2027-01-02", "2026-12-30")).toEqual({ kind: "roll", days: 3 });
  });
});

describe("the notice on the Pass when the board is far behind", () => {
  const from = new Date(2026, 9, 9);

  it("says which day the board is on and which day it is", () => {
    render(<StaleDayNotice from={from} today="2026-10-29" onMove={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toMatch(
      /still on Friday, October 9\. Today is Thursday, October 29\./,
    );
    expect(screen.getByText(/Unfinished tasks come along as past due/)).toBeTruthy();
  });

  it("moves to today once, even on a double tap", async () => {
    let done: (v: boolean) => void = () => {};
    const onMove = vi.fn(() => new Promise<boolean>((r) => (done = r)));
    render(<StaleDayNotice from={from} today="2026-10-29" onMove={onMove} />);
    const btn = screen.getByRole("button", { name: "Move to today" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    await act(async () => done(true));
  });

  it("if it fails it says so and can be tried again", async () => {
    const onMove = vi.fn().mockResolvedValue(false);
    render(<StaleDayNotice from={from} today="2026-10-29" onMove={onMove} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Move to today" }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/Couldn't move the board/);
    expect(
      (screen.getByRole("button", { name: "Move to today" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
