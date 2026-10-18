// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";
import type { HelperSchedule } from "@/features/shifts/shift.types";
import { setHouseholdTimeZone } from "@/lib/time";

import { useSendGate } from "./use-send-gate";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
vi.mock("@/features/utos/utos.actions", () => ({
  routeUtosFn: vi.fn(async ({ data }: { data: { prompt: string } }) => ({
    classification: "QUICK",
    contentCleaned: data.prompt,
    suggestedStation: "Yaya",
    boundaryWarn: false,
  })),
}));

// Wednesday 7 October 2026, 10:00 in Manila.
const NOW = Date.UTC(2026, 9, 7, 2, 0);
const ON = "helper-on";
const OFF = "helper-off";
const byHelper: Record<string, HelperSchedule> = {
  [ON]: { shiftStart: "07:00", shiftEnd: "19:00", weeklyRestDay: 0 },
  [OFF]: { shiftStart: "06:00", shiftEnd: "09:00", weeklyRestDay: 0 },
};
const schedules: ScheduleStore = {
  byHelper,
  scheduleFor: (id) => byHelper[id],
  update: async () => {},
};

function gate(isRemote: boolean, utosTarget = ON) {
  const onAddTask = vi.fn();
  const onSendUtos = vi.fn();
  const { result } = renderHook(() =>
    useSendGate({
      token: "manager-token",
      authorName: "Lola Fe",
      isRemote,
      schedules,
      nowTs: NOW,
      helperProfiles: [],
      resolveHelperName: (id) => (id === ON ? "Marites" : "Rosa"),
      utosTargetHelperId: utosTarget,
      activeHelpers: [],
      onSendUtos,
      onAddTask,
    }),
  );
  return { result, onAddTask, onSendUtos };
}

const task = (helperId: string | null) => ({
  title: "Water the plants",
  helperId,
  time: "10:30 AM",
  scheduledDate: "2026-10-07",
});

beforeEach(() => setHouseholdTimeZone("Asia/Manila"));
afterEach(() => {
  setHouseholdTimeZone(null);
  vi.clearAllMocks();
});

describe("useSendGate for a remote admin (plan.md 1.2)", () => {
  it("suggests a task by default", () => {
    const { result, onAddTask } = gate(true);
    act(() => result.current.addTask(task(ON) as never));
    expect(onAddTask).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "Lola Fe" }), {
      suggested: true,
    });
  });

  it("sends live as urgent while she's on shift", () => {
    const { result, onAddTask } = gate(true);
    act(() => result.current.addTask(task(ON) as never, { sendLive: true }));
    expect(onAddTask).toHaveBeenCalledWith(expect.anything(), { emergency: true });
  });

  it("never overrides her off-hours: a live send becomes a suggestion, and says so", () => {
    const { result, onAddTask } = gate(true);
    act(() => result.current.addTask(task(OFF) as never, { sendLive: true }));
    expect(onAddTask).toHaveBeenCalledWith(expect.anything(), { suggested: true });
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("Rosa is off shift"));
    expect(result.current.intent).toBeNull();
  });

  it("sends a Quick Utos as urgent while she's on shift", async () => {
    const { result, onSendUtos } = gate(true, ON);
    await act(() => result.current.sendUtos("Tawagan si Ma'am"));
    expect(onSendUtos).toHaveBeenCalledWith("Tawagan si Ma'am", {
      emergency: true,
      from: "Lola Fe",
    });
  });

  it("doesn't send a Quick Utos to a helper who's off", async () => {
    const { result, onSendUtos } = gate(true, OFF);
    await act(() => result.current.sendUtos("Gising na"));
    expect(onSendUtos).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Rosa is off shift"));
  });
});

describe("useSendGate for an on-site manager", () => {
  it("adds a task live, and stops at the wall for a helper who's off", () => {
    const { result, onAddTask } = gate(false);
    act(() => result.current.addTask(task(ON) as never));
    expect(onAddTask).toHaveBeenCalledWith(expect.anything(), {});
    act(() => result.current.addTask(task(OFF) as never));
    expect(onAddTask).toHaveBeenCalledTimes(1);
    expect(result.current.intent?.kind).toBe("task");
  });

  it("sends a Quick Utos without marking it urgent", async () => {
    const { result, onSendUtos } = gate(false, ON);
    await act(() => result.current.sendUtos("Kape po"));
    expect(onSendUtos).toHaveBeenCalledWith("Kape po", { from: "Lola Fe" });
  });
});
