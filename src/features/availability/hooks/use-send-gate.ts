import { useState } from "react";

import type { AddTaskFlags } from "@/features/tasks/hooks/use-task-board";
import type { Task } from "@/features/tasks/task.types";
import type { SendFlags } from "@/features/utos/hooks/use-utos";

import type { RosaStatus } from "../availability.types";

export type TaskDraft = Omit<Task, "id" | "status" | "station">;
export type GateIntent = { kind: "utos"; content: string } | { kind: "task"; task: TaskDraft };

export type SendGate = {
  /** The pending send, or null when nothing is being gated. */
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
 */
export function useSendGate({
  status,
  authorName,
  isRemote,
  onSendUtos,
  onAddTask,
}: {
  status: RosaStatus;
  authorName: string;
  isRemote: boolean;
  onSendUtos: (content: string, flags?: SendFlags) => void;
  onAddTask: (task: TaskDraft, flags?: AddTaskFlags) => void;
}): SendGate {
  const [intent, setIntent] = useState<GateIntent | null>(null);
  const rosaOff = status.status === "off";

  // Attribute the task to whoever is looking, unless it already carries an author.
  const stamp = (t: TaskDraft): TaskDraft => ({ ...t, createdBy: t.createdBy ?? authorName });

  const sendUtos = (content: string) => {
    if (rosaOff) setIntent({ kind: "utos", content });
    else onSendUtos(content, { from: authorName });
  };

  const addTask = (t: TaskDraft, opts: { sendLive?: boolean } = {}) => {
    // Remote admins queue tasks as suggestions for on-site managers by default.
    if (isRemote && !opts.sendLive) {
      onAddTask(stamp(t), { suggested: true });
      return;
    }
    if (t.helperId === "rosa" && rosaOff) setIntent({ kind: "task", task: stamp(t) });
    else onAddTask(stamp(t), {});
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
