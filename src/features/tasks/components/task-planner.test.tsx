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
vi.mock("../task.actions", () => ({ listTicketsBetweenFn: vi.fn(), searchTicketsFn: vi.fn() }));

const rosa: Helper = { ...UNKNOWN_HELPER, id: "h1", name: "Rosa Dela Cruz", short: "Rosa" };
const lita: Helper = { ...UNKNOWN_HELPER, id: "h2", name: "Lita Santos", short: "Lita" };
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
    expect(moveLocally).toHaveBeenCalledWith("laundry", "2026-10-03T00:00:00.000Z", undefined);
    expect(onMove).toHaveBeenCalledWith(laundry, "2026-10-03T00:00:00.000Z", "h1");
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

  it("keeps a cancelled task on its day, struck through, saying who, and not draggable", () => {
    const curtains = task({
      id: "curtains",
      title: "Iron the curtains",
      status: "cancelled",
      cancelledBy: "Ben",
      scheduledStart: "2026-10-02T00:00:00.000Z",
    });
    renderPlanner({
      usePlan: () => ({ tasks: [laundry, curtains], moveLocally: vi.fn(), reload: () => {} }),
    });
    const fri = within(day(/^Fri 2$/));
    const title = fri.getByText("Iron the curtains");
    expect(title.className).toContain("line-through");
    expect(fri.getByText("Cancelled")).toBeTruthy();
    expect(fri.getByText("By Ben")).toBeTruthy();
    expect(title.closest("li")!.getAttribute("draggable")).toBe("false");
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

describe("TaskPlanner, phone filters", () => {
  it("keeps search and status behind Filter until opened, and shows them while one applies", () => {
    renderPlanner();
    const filter = screen.getByRole("button", { name: "Filter" });
    const panel = document.getElementById("plan-filters")!;
    expect(filter.getAttribute("aria-expanded")).toBe("false");
    expect(panel.className).toMatch(/(^|\s)hidden(\s|$)/);

    fireEvent.click(filter);
    expect(filter.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(filter);
    // Closed again, but a status filter is applying, so it stays on show.
    expect(screen.getByRole("button", { name: "Filter · on" })).toBeTruthy();
    expect(panel.className).not.toMatch(/(^|\s)hidden(\s|$)/);
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

describe("TaskPlanner, list", () => {
  const list = (over: Partial<Parameters<typeof TaskPlanner>[0]> = {}) => {
    const out = renderPlanner(over);
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    return out;
  };

  it("lists the same week a day at a time, in time order, appointments included", () => {
    const sweep = task({
      id: "sweep",
      title: "Sweep the porch",
      time: "4:00 PM",
      scheduledStart: "2026-10-02T08:00:00.000Z",
    });
    const mop = task({
      id: "mop",
      title: "Mop the kitchen",
      time: "9:00 AM",
      scheduledStart: "2026-10-02T01:00:00.000Z",
    });
    list({
      usePlan: () => ({
        tasks: [laundry, windows, sweep, mop],
        moveLocally: vi.fn(),
        reload: () => {},
      }),
    });
    expect(screen.getByText("Sep 28 – Oct 4")).toBeTruthy();
    expect(within(day(/^Thu, Oct 1, today$/)).getByText("Hang the laundry")).toBeTruthy();
    expect(within(day(/^Tue, Sep 29$/)).getByText("Wash the windows")).toBeTruthy();
    const friday = within(day(/^Fri, Oct 2$/))
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(friday.map((t) => t.match(/Mop the kitchen|Dentist|Sweep the porch/)?.[0])).toEqual([
      "Mop the kitchen",
      "Dentist",
      "Sweep the porch",
    ]);
    expect(within(day(/^Sun, Oct 4$/)).getByText("Day off: Rosa")).toBeTruthy();
  });

  it("says when a day is empty and adds on today and later only", () => {
    const { onAddOn } = list();
    expect(within(day(/^Mon, Sep 28$/)).getByText("Nothing was planned")).toBeTruthy();
    expect(within(day(/^Sat, Oct 3$/)).getByText("Nothing planned")).toBeTruthy();
    expect(within(day(/^Wed, Sep 30$/)).queryByRole("button", { name: /^Add a task/ })).toBeNull();
    fireEvent.click(
      within(day(/^Sat, Oct 3$/)).getByRole("button", { name: "Add a task on Sat 3" }),
    );
    expect(onAddOn).toHaveBeenCalledWith("2026-10-03");
  });

  it("opens a task, steps weeks, and isn't draggable", () => {
    const onOpenTask = vi.fn();
    list({ onOpenTask });
    const row = within(day(/^Thu, Oct 1/))
      .getByText("Hang the laundry")
      .closest("li")!;
    expect(row.getAttribute("draggable")).toBe("false");
    fireEvent.click(within(row).getByRole("button"));
    expect(onOpenTask).toHaveBeenCalledWith(laundry);
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByText("Oct 5 – Oct 11")).toBeTruthy();
  });

  it("is remembered as the chosen view", () => {
    list();
    cleanup();
    renderPlanner();
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("TaskPlanner, on the plan", () => {
  it("shows a routine greyed on the later days it will spawn, not today or before", () => {
    renderPlanner({
      routines: [
        {
          id: "r1",
          title: "Water the plants",
          helperId: "h1",
          station: "House",
          time: "7:00 AM",
          recurrence: "daily",
        },
      ],
    });
    expect(within(day(/^Wed 30$/)).queryByText("Water the plants")).toBeNull();
    expect(within(day(/^Thu 1/)).queryByText("Water the plants")).toBeNull();
    expect(within(day(/^Fri 2$/)).getByText("Water the plants")).toBeTruthy();
  });

  it("skips a routine's copy on a day that already has its task", () => {
    renderPlanner({
      routines: [
        {
          id: "r1",
          title: "Water the plants",
          helperId: "h1",
          station: "House",
          time: "7:00 AM",
          recurrence: "daily",
        },
      ],
      usePlan: () => ({
        tasks: [
          task({
            id: "spawned",
            title: "Water the plants",
            routineId: "r1",
            time: "7:00 AM",
            scheduledStart: "2026-10-01T23:00:00.000Z", // Fri 7 AM in Manila
          }),
        ],
        moveLocally: () => {},
        reload: () => {},
      }),
    });
    expect(within(day(/^Fri 2$/)).getAllByText("Water the plants")).toHaveLength(1);
    expect(within(day(/^Sat 3$/)).getByText("Water the plants")).toBeTruthy();
  });

  it("links prep tasks to their appointment", () => {
    renderPlanner({
      usePlan: () => ({
        tasks: [
          task({
            id: "prep",
            title: "Pack the bag",
            appointmentId: "a1",
            appointmentTitle: "Dentist",
            scheduledStart: "2026-10-01T00:00:00.000Z",
          }),
        ],
        moveLocally: () => {},
        reload: () => {},
      }),
    });
    expect(within(day(/^Thu 1/)).getByText("For Dentist")).toBeTruthy();
    expect(within(day(/^Fri 2$/)).getByText("1 prep task")).toBeTruthy();
  });

  it("marks a task planned outside her shift", () => {
    renderPlanner({
      usePlan: () => ({
        tasks: [
          task({
            id: "late",
            title: "Iron the shirts",
            time: "8:00 PM",
            scheduledStart: "2026-10-01T12:00:00.000Z",
          }),
        ],
        moveLocally: () => {},
        reload: () => {},
      }),
    });
    expect(within(day(/^Thu 1/)).getByText(/off shift/)).toBeTruthy();
  });
});

describe("TaskPlanner, time off", () => {
  const off = [
    {
      id: "o1",
      helperId: "h1",
      date: "2026-10-01",
      startMin: 420,
      endMin: 600,
      status: "approved" as const,
      kind: "rest_off" as const,
    },
    {
      id: "o2",
      helperId: "h1",
      date: "2026-10-02",
      startMin: 780,
      endMin: 1020,
      status: "pending" as const,
      kind: "rest_off" as const,
    },
  ];

  it("shows approved and asked-for time off on its day", () => {
    renderPlanner({ timeOff: off });
    expect(within(day(/^Thu 1/)).getByText("Rosa off 7:00 AM – 10:00 AM")).toBeTruthy();
    expect(within(day(/^Fri 2$/)).getByText("Rosa asked off 1:00 PM – 5:00 PM")).toBeTruthy();
  });

  it("marks a task inside approved time off", () => {
    renderPlanner({ timeOff: off });
    // Hang the laundry is 8:00 AM Thursday, inside 7 to 10.
    expect(within(day(/^Thu 1/)).getByText(/time off/)).toBeTruthy();
  });
});

describe("TaskPlanner, by person", () => {
  const byPerson = (over: Partial<Parameters<typeof TaskPlanner>[0]> = {}) => {
    const out = renderPlanner({ helpers: [rosa, lita], activeHelpers: [rosa, lita], ...over });
    fireEvent.click(screen.getByRole("button", { name: "By person" }));
    return out;
  };

  it("lays the week out a row per person, with her day off", () => {
    byPerson();
    expect(within(day(/^Rosa, Thu 1$/)).getByText("Hang the laundry")).toBeTruthy();
    expect(day(/^Rosa, Sun 4, day off$/)).toBeTruthy();
    expect(day(/^Unassigned, Fri 2$/)).toBeTruthy();
  });

  it("hands a task to whoever's row it's dropped on", async () => {
    const { onMove, moveLocally } = byPerson();
    const row = within(day(/^Rosa, Thu 1$/))
      .getByText("Hang the laundry")
      .closest("li")!;
    fireEvent.dragStart(row, { dataTransfer: dt() });
    fireEvent.dragOver(day(/^Lita, Thu 1/), { dataTransfer: dt() });
    await act(async () => {
      fireEvent.drop(day(/^Lita, Thu 1/), { dataTransfer: dt() });
    });
    expect(moveLocally).toHaveBeenCalledWith("laundry", laundry.scheduledStart, "h2");
    expect(onMove).toHaveBeenCalledWith(laundry, laundry.scheduledStart, "h2");
  });

  it("adds on a person's day with that person picked", () => {
    const { onAddOn } = byPerson();
    fireEvent.click(screen.getByRole("button", { name: "Add task for Lita on Fri 2" }));
    expect(onAddOn).toHaveBeenCalledWith("2026-10-02", "h2");
  });
});

describe("TaskPlanner, search and filters", () => {
  // From March: outside any week the planner has loaded.
  const marchLaundry = task({
    id: "march",
    title: "Laundry for the fiesta",
    status: "done",
    scheduledStart: "2026-03-14T01:00:00.000Z",
  });

  it("narrows the week to done tasks, and drops appointments while filtered", () => {
    renderPlanner();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("Hang the laundry")).toBeNull();
    expect(within(day(/^Tue 29$/)).getByText("Wash the windows")).toBeTruthy();
    expect(screen.queryByText("Dentist")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "To do" }));
    expect(screen.getByText("Hang the laundry")).toBeTruthy();
    expect(screen.queryByText("Wash the windows")).toBeNull();
  });

  it("searches every date, in place of the calendar, with the person and status chosen", () => {
    const useSearch = vi.fn(({ query }: { query: string }) =>
      query.trim().length >= 2
        ? { active: true, tasks: [marchLaundry] }
        : { active: false, tasks: [] as Task[] },
    );
    const onOpenTask = vi.fn();
    renderPlanner({ useSearch, onOpenTask });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search tasks on every date" }), {
      target: { value: "laundry" },
    });

    expect(useSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: "laundry", helper: "all", statuses: ["done"] }),
    );
    expect(screen.getByText(/1 task matches “laundry”, on any date/)).toBeTruthy();
    const march = screen.getByRole("region", { name: "Sat, Mar 14, 2026" });
    expect(screen.queryByText("Sep 28 – Oct 4")).toBeTruthy(); // the header still says where the calendar is
    expect(screen.queryByRole("region", { name: /^Thu 1, today$/ })).toBeNull();

    fireEvent.click(within(march).getByText("Laundry for the fiesta"));
    expect(onOpenTask).toHaveBeenCalledWith(marchLaundry);

    fireEvent.click(within(march).getByRole("button", { name: "Show in week" }));
    expect(screen.getByText("Mar 9 – Mar 15")).toBeTruthy();
    expect(
      (screen.getByRole("searchbox", { name: "Search tasks on every date" }) as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("says when nothing matches", () => {
    renderPlanner({ useSearch: () => ({ active: true, tasks: [] }) });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search tasks on every date" }), {
      target: { value: "kalabasa" },
    });
    expect(screen.getByText("No task on any date matches “kalabasa”.")).toBeTruthy();
  });
});
