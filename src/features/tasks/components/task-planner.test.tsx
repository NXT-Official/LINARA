// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Helper } from "@/features/people/people.types";
import { UNKNOWN_HELPER } from "@/features/people/people.utils";
import type { HelperSchedule } from "@/features/shifts/shift.types";
import { setHouseholdTimeZone } from "@/lib/time";

import type { Task } from "../task.types";
import { TaskPlanner } from "./task-planner";

// The planner reads through usePlan here; the real server functions never load.
vi.mock("../task.actions", () => ({ listTicketsBetweenFn: vi.fn() }));

const rosa: Helper = { ...UNKNOWN_HELPER, id: "h1", name: "Rosa Dela Cruz", short: "Rosa" };
// Rosa rests on Sundays (0), 8 AM to 5 PM.
const schedule: HelperSchedule = { shiftStart: "08:00", shiftEnd: "17:00", weeklyRestDay: 0 };

const task = (over: Partial<Task>): Task => ({
  id: "t",
  title: "Task",
  time: "8:00 AM",
  helperId: "h1",
  station: "House",
  status: "todo",
  ...over,
});

// Thursday Oct 1 2026, 9 AM in Manila.
const NOW = Date.parse("2026-10-01T01:00:00Z");
const laundry = task({
  id: "laundry",
  title: "Hang the laundry",
  scheduledStart: "2026-10-01T00:00:00.000Z",
});
const windows = task({
  id: "windows",
  title: "Wash the windows",
  status: "done",
  time: "10:00 AM",
  scheduledStart: "2026-09-29T02:00:00.000Z",
});

const dt = () => ({ setData: () => {}, effectAllowed: "", dropEffect: "" });

function renderPlanner(over: Partial<Parameters<typeof TaskPlanner>[0]> = {}) {
  const onMove = vi.fn(async () => true);
  const onAddOn = vi.fn();
  const moveLocally = vi.fn();
  render(
    <TaskPlanner
      token="token"
      nowTs={NOW}
      boardTasks={[]}
      helpers={[rosa]}
      activeHelpers={[rosa]}
      appointments={[{ id: "a1", title: "Dentist", date: "2026-10-02", time: "3:00 PM" }]}
      scheduleFor={() => schedule}
      onAddOn={onAddOn}
      onOpenTask={() => {}}
      onMove={onMove}
      usePlan={() => ({ tasks: [laundry, windows], moveLocally, reload: () => {} })}
      {...over}
    />,
  );
  return { onMove, onAddOn, moveLocally };
}

const day = (name: RegExp) => screen.getByRole("region", { name });

beforeEach(() => {
  setHouseholdTimeZone("Asia/Manila");
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  setHouseholdTimeZone(null);
});

describe("TaskPlanner, week", () => {
  it("lays each task on its own day", () => {
    renderPlanner();
    expect(screen.getByText("Sep 28 – Oct 4")).toBeTruthy();
    expect(within(day(/^Thu 1, today$/)).getByText("Hang the laundry")).toBeTruthy();
    expect(within(day(/^Tue 29$/)).getByText("Wash the windows")).toBeTruthy();
    expect(within(day(/^Fri 2$/)).getByText("Dentist")).toBeTruthy();
    expect(within(day(/^Sun 4$/)).getByText("Day off: Rosa")).toBeTruthy();
  });

  it("moves a dragged task to the day it's dropped on, keeping its time", async () => {
    const { onMove, moveLocally } = renderPlanner();
    const row = within(day(/^Thu 1/))
      .getByText("Hang the laundry")
      .closest("li")!;
    fireEvent.dragStart(row, { dataTransfer: dt() });
    fireEvent.dragOver(day(/^Sat 3$/), { dataTransfer: dt() });
    await act(async () => {
      fireEvent.drop(day(/^Sat 3$/), { dataTransfer: dt() });
    });
    // 8:00 AM Saturday in Manila.
    expect(moveLocally).toHaveBeenCalledWith("laundry", "2026-10-03T00:00:00.000Z");
    expect(onMove).toHaveBeenCalledWith(laundry, "2026-10-03T00:00:00.000Z");
  });

  it("won't take a task into a day that has passed", async () => {
    const { onMove } = renderPlanner();
    const row = within(day(/^Thu 1/))
      .getByText("Hang the laundry")
      .closest("li")!;
    fireEvent.dragStart(row, { dataTransfer: dt() });
    await act(async () => {
      fireEvent.drop(day(/^Wed 30$/), { dataTransfer: dt() });
    });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("doesn't let finished work be dragged", () => {
    renderPlanner();
    const done = within(day(/^Tue 29$/))
      .getByText("Wash the windows")
      .closest("li")!;
    expect(done.getAttribute("draggable")).toBe("false");
  });

  it("adds on today and later days only", () => {
    const { onAddOn } = renderPlanner();
    expect(within(day(/^Wed 30$/)).queryByRole("button", { name: /add task/i })).toBeNull();
    fireEvent.click(within(day(/^Fri 2$/)).getByRole("button", { name: /add task/i }));
    expect(onAddOn).toHaveBeenCalledWith("2026-10-02");
  });

  it("is look-only without onMove and onOpenTask (remote view)", () => {
    renderPlanner({ onMove: undefined, onOpenTask: undefined });
    const row = within(day(/^Thu 1/))
      .getByText("Hang the laundry")
      .closest("li")!;
    expect(row.getAttribute("draggable")).toBe("false");
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("filters to one person", () => {
    renderPlanner({
      usePlan: () => ({
        tasks: [
          laundry,
          task({
            id: "u",
            title: "Fix the gate",
            helperId: null,
            scheduledStart: laundry.scheduledStart,
          }),
        ],
        moveLocally: () => {},
        reload: () => {},
      }),
    });
    fireEvent.change(screen.getByLabelText("Whose tasks"), { target: { value: "unassigned" } });
    expect(screen.queryByText("Hang the laundry")).toBeNull();
    expect(screen.getByText("Fix the gate")).toBeTruthy();
  });
});

describe("TaskPlanner, month", () => {
  it("shows the month and opens a day's week from it", () => {
    renderPlanner();
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    expect(screen.getByText("October 2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("November 2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Thursday, November 12/ }));
    expect(screen.getByText("Nov 9 – Nov 15")).toBeTruthy();
  });
});
