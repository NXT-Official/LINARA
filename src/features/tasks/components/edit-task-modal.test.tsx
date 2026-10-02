// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Helper } from "@/features/people/people.types";
import { UNKNOWN_HELPER } from "@/features/people/people.utils";

import type { Task } from "../task.types";
import { EditTaskModal } from "./edit-task-modal";

// The updates thread talks to the database; not what's tested here.
vi.mock("./task-updates", () => ({ TaskUpdates: () => null }));

afterEach(cleanup);

const marito: Helper = { ...UNKNOWN_HELPER, id: "h1", name: "Marito Cruz", short: "Marito" };

const task = (over: Partial<Task>): Task => ({
  id: "t1",
  title: "test one more",
  time: "7:00 PM",
  scheduledStart: "2026-10-02T11:00:00.000Z",
  helperId: "h1",
  station: "House",
  status: "todo",
  ...over,
});

const open = (t: Task) =>
  render(
    <EditTaskModal
      task={t}
      helpers={[marito]}
      scheduleFor={() => undefined}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />,
  );

describe("EditTaskModal", () => {
  it("edits a task that isn't finished", () => {
    open(task({}));
    expect(screen.getByRole("heading", { name: "Edit task" })).toBeTruthy();
    expect(screen.getByDisplayValue("test one more")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("shows a finished task as a record: no fields, no Save, with her photo", () => {
    open(task({ status: "done", photo: "https://example.test/p.jpg", finishedAt: Date.now() }));
    expect(screen.getByRole("heading", { name: "Done task" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByText("test one more")).toBeTruthy();
    expect(screen.getByText(/Marito · House/)).toBeTruthy();
    expect(screen.getByAltText("Photo from finishing this task")).toBeTruthy();
  });

  it("says when a finished task has no photo", () => {
    open(task({ status: "done" }));
    expect(screen.getByText("No photo with this one.")).toBeTruthy();
  });
});
