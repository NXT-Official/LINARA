import { useState } from "react";
import { toast } from "sonner";

import type { HelperProfileRow } from "@/features/people/hooks/use-invites";
import type { Helper } from "@/features/people/people.types";
import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";
import type { TimeOff } from "@/features/shifts/time-off";
import type { AddTaskFlags } from "@/features/tasks/hooks/use-task-board";
import type { Task } from "@/features/tasks/task.types";
import { routeUtosFn } from "@/features/utos/utos.actions";
import type { SendFlags } from "@/features/utos/hooks/use-utos";
import { toHouseholdClock, toISODate } from "@/lib/time";

import { manualFromRow, statusFor } from "../availability.utils";
import type { RosaStatus } from "../availability.types";

export type TaskDraft = Omit<Task, "id" | "status" | "station">;
export type GateIntent =
  | {
      kind: "utos";
      content: string;
      helperId: string | null;
      status: RosaStatus;
      helperName: string;
    }
  | { kind: "task"; task: TaskDraft; status: RosaStatus; helperName: string };

export type SendGate = {
  /** The pending send, or null when nothing is being gated. Carries the
   * resolved status/name of whichever helper this particular send is
   * about, since sendUtos and addTask can now target different helpers. */
  intent: GateIntent | null;
  sendUtos: (content: string) => void;
  addTask: (task: TaskDraft, opts?: { sendLive?: boolean }) => void;
  cancel: () => void;
  resolve: (choice: "queue" | "override" | "emergency") => void;
};

/**
 * The friction wall in front of a helper who is Off.
 *
 * Sends while she is reachable go straight through. Otherwise they stop for a
 * choice: let it wait, override (logged as after-hours), or emergency. Remote
 * admins never reach that choice (plan.md 1.2: no overriding her off-hours):
 * their tasks are suggestions for an on-site manager, and only an urgent one
 * goes live, while she's on shift. Quick Utos from a remote admin are urgent,
 * and only reach her on shift. The database holds the same line
 * (supabase/add-household-managers.sql).
 *
 * Status is resolved per-action, not fixed at instantiation: `addTask`
 * used to check the assigned task's own `helperId` against a single global
 * `currentHelperId`, silently skipping the friction wall for every other
 * helper (see KNOWN_GAPS.md / MULTI_HELPER_HANDLING.md). `statusFor`, given
 * the target helper's own fetched `helper_profiles` row, now resolves real
 * schedule *and* manual-opt-in status for whichever helper an action
 * actually targets -- not just one "current" one.
 */
export function useSendGate({
  authorName,
  isRemote,
  schedules,
  nowTs,
  helperProfiles,
  resolveHelperName,
  utosTargetHelperId,
  activeHelpers,
  timeOff = [],
  onSendUtos,
  onAddTask,
}: {
  authorName: string;
  isRemote: boolean;
  schedules: ScheduleStore;
  nowTs: number;
  /** Every fetched helper_profiles row -- for real per-helper manual
   * availability lookups, any active helper, not just the "current" one
   * (see MULTI_HELPER_HANDLING.md). */
  helperProfiles: HelperProfileRow[];
  resolveHelperName: (helperId: string | null) => string;
  /** Who sendUtos() targets -- the picked (or default) Quick Utos recipient. */
  utosTargetHelperId: string | null;
  /** For the AI station-mismatch toast below -- not used to auto-reroute a send. */
  activeHelpers: Helper[];
  /** Approved time off counts as off (KNOWN_GAPS O19). */
  timeOff?: TimeOff[];
  onSendUtos: (content: string, flags?: SendFlags) => void;
  onAddTask: (task: TaskDraft, flags?: AddTaskFlags) => void;
}): SendGate {
  const [intent, setIntent] = useState<GateIntent | null>(null);

  const statusOf = (helperId: string | null): RosaStatus =>
    statusFor(
      helperId,
      schedules,
      nowTs,
      manualFromRow(helperProfiles.find((p) => p.id === helperId)),
      timeOff,
    );

  // Attribute the task to whoever is looking, unless it already carries an author.
  const stamp = (t: TaskDraft): TaskDraft => ({ ...t, createdBy: t.createdBy ?? authorName });

  const sendUtos = async (content: string) => {
    const targetStatus = statusOf(utosTargetHelperId);
    // On shift by her schedule: "Available" (her own opt-in) still counts as
    // off for a remote admin, as it does for rest owed.
    if (isRemote && targetStatus.status !== "on_shift") {
      toast.error(
        `${resolveHelperName(utosTargetHelperId)} is off shift. Add it as a task suggestion, and an on-site manager can decide.`,
      );
      return;
    }
    // A remote admin's Quick Utos goes out as urgent.
    const remoteFlags = isRemote ? { emergency: true } : {};
    try {
      const result = await routeUtosFn({
        data: {
          prompt: content,
          helperId: utosTargetHelperId ?? "",
          helperStatus: targetStatus.status,
          senderType: "manager",
        },
      });

      if (result) {
        if (result.classification === "ROUTINE") {
          toast.info(
            `Classified as ROUTINE! Automatically structured as: "${result.contentCleaned}"`,
          );
        } else if (result.classification === "TASK") {
          toast.info(
            `Classified as heavy TASK! Automatically structured as: "${result.contentCleaned}"`,
          );
        }

        // This asks and doesn't reroute -- an AI guess about who a message
        // is "usually" for isn't grounds to silently redirect a manager's
        // send. Only surfaced when there's more than one active helper and
        // exactly one of them staffs the suggested station, so it's never a
        // guess dressed up as a fact.
        if (activeHelpers.length > 1) {
          const currentStation = activeHelpers.find((h) => h.id === utosTargetHelperId)?.station;
          if (currentStation && currentStation !== result.suggestedStation) {
            const matches = activeHelpers.filter((h) => h.station === result.suggestedStation);
            if (matches.length === 1) {
              toast.info(
                `This usually goes to the ${result.suggestedStation} -- sending to ${resolveHelperName(utosTargetHelperId)} (${currentStation}) instead. Pick ${matches[0].name} in the recipient list if that's who you meant.`,
              );
            }
          }
        }

        if (result.boundaryWarn && !isRemote) {
          setIntent({
            kind: "utos",
            content: result.contentCleaned,
            helperId: utosTargetHelperId,
            status: targetStatus,
            helperName: resolveHelperName(utosTargetHelperId),
          });
        } else {
          onSendUtos(result.contentCleaned, { ...remoteFlags, from: authorName });
        }
      }
    } catch (err) {
      console.error(err);
      if (targetStatus.status === "off") {
        setIntent({
          kind: "utos",
          content,
          helperId: utosTargetHelperId,
          status: targetStatus,
          helperName: resolveHelperName(utosTargetHelperId),
        });
      } else {
        onSendUtos(content, { ...remoteFlags, from: authorName });
      }
    }
  };

  const addTask = (t: TaskDraft, opts: { sendLive?: boolean } = {}) => {
    // Remote admins suggest; "Send live" is urgent, and only while she's on shift.
    if (isRemote) {
      const live =
        opts.sendLive && t.helperId !== null && statusOf(t.helperId).status === "on_shift";
      if (opts.sendLive && !live) {
        toast.info(
          t.helperId
            ? `${resolveHelperName(t.helperId)} is off shift, so it went to the on-site managers as a suggestion.`
            : "Nobody is assigned, so it went to the on-site managers as a suggestion.",
        );
      }
      onAddTask(stamp(t), live ? { emergency: true } : { suggested: true });
      return;
    }
    // Unassigned: nobody to disturb, so no wall. It reaches someone only when
    // a manager assigns it.
    if (t.helperId === null) {
      onAddTask(stamp(t), {});
      return;
    }
    // Planned for a later day: whether she's off right now doesn't matter.
    // The form warns when the planned time is outside her shift instead.
    if (t.scheduledDate && t.scheduledDate > toISODate(toHouseholdClock(nowTs))) {
      onAddTask(stamp(t), {});
      return;
    }
    const taskStatus = statusOf(t.helperId);
    if (taskStatus.status === "off") {
      setIntent({
        kind: "task",
        task: stamp(t),
        status: taskStatus,
        helperName: resolveHelperName(t.helperId),
      });
    } else {
      onAddTask(stamp(t), {});
    }
  };

  const resolve = (choice: "queue" | "override" | "emergency") => {
    if (!intent) return;
    if (intent.kind === "utos") {
      if (choice === "queue")
        onSendUtos(intent.content, { waiting: true, afterHours: true, from: authorName });
      else if (choice === "override")
        onSendUtos(intent.content, { afterHours: true, from: authorName });
      else onSendUtos(intent.content, { afterHours: true, emergency: true, from: authorName });
    } else {
      const task = stamp(intent.task);
      if (choice === "queue") onAddTask(task, { queuedForShift: true, afterHours: true });
      else if (choice === "override") onAddTask(task, { afterHours: true });
      else onAddTask(task, { afterHours: true, emergency: true });
    }
    setIntent(null);
  };

  return { intent, sendUtos, addTask, cancel: () => setIntent(null), resolve };
}
