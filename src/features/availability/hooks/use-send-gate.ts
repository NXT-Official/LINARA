import { useState } from "react";
import { toast } from "sonner";

import type { Helper } from "@/features/people/people.types";
import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";
import type { AddTaskFlags } from "@/features/tasks/hooks/use-task-board";
import type { Task } from "@/features/tasks/task.types";
import { routeUtosFn } from "@/features/utos/utos.actions";
import type { SendFlags } from "@/features/utos/hooks/use-utos";

import { statusFor } from "../availability.utils";
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
 * admins never reach that choice — their tasks queue as suggestions for an
 * on-site manager instead.
 *
 * Status is resolved per-action, not fixed at instantiation: `addTask`
 * always checked the assigned task's own `helperId` against a single global
 * `currentHelperId`, silently skipping the friction wall for every other
 * helper (see KNOWN_GAPS.md / MULTI_HELPER_HANDLING.md). `statusFor` (a pure
 * schedule-derived lookup, no manual opt-in data available for anyone but
 * the current device's own helper) fixes that for every helper, not just
 * one; `currentHelperStatus` (already includes the manual opt-in layer) is
 * used only when the action's target happens to be `currentHelperId`.
 */
export function useSendGate({
  authorName,
  isRemote,
  schedules,
  nowTs,
  currentHelperId,
  currentHelperStatus,
  resolveHelperName,
  utosTargetHelperId,
  activeHelpers,
  onSendUtos,
  onAddTask,
}: {
  authorName: string;
  isRemote: boolean;
  schedules: ScheduleStore;
  nowTs: number;
  /** Real helper_profiles id of the one helper with a first-class device -- the
   * only one whose manual availability opt-in this app can see. */
  currentHelperId: string | null;
  /** availability.status for currentHelperId, manual opt-in layer included. */
  currentHelperStatus: RosaStatus;
  resolveHelperName: (helperId: string | null) => string;
  /** Who sendUtos() targets -- the picked (or default) Quick Utos recipient. */
  utosTargetHelperId: string | null;
  /** For the AI station-mismatch toast below -- not used to auto-reroute a send. */
  activeHelpers: Helper[];
  onSendUtos: (content: string, flags?: SendFlags) => void;
  onAddTask: (task: TaskDraft, flags?: AddTaskFlags) => void;
}): SendGate {
  const [intent, setIntent] = useState<GateIntent | null>(null);

  const statusOf = (helperId: string | null): RosaStatus =>
    helperId && helperId === currentHelperId
      ? currentHelperStatus
      : statusFor(helperId, schedules, nowTs);

  // Attribute the task to whoever is looking, unless it already carries an author.
  const stamp = (t: TaskDraft): TaskDraft => ({ ...t, createdBy: t.createdBy ?? authorName });

  const sendUtos = async (content: string) => {
    const targetStatus = statusOf(utosTargetHelperId);
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

        if (result.boundaryWarn) {
          setIntent({
            kind: "utos",
            content: result.contentCleaned,
            helperId: utosTargetHelperId,
            status: targetStatus,
            helperName: resolveHelperName(utosTargetHelperId),
          });
        } else {
          onSendUtos(result.contentCleaned, { from: authorName });
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
        onSendUtos(content, { from: authorName });
      }
    }
  };

  const addTask = (t: TaskDraft, opts: { sendLive?: boolean } = {}) => {
    // Remote admins queue tasks as suggestions for on-site managers by default.
    if (isRemote && !opts.sendLive) {
      onAddTask(stamp(t), { suggested: true });
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
