import type { Task } from "./task.types";
import { byStart, isPastDue } from "./task.utils";

/** Where one helper's day stands: shared by her lane, her roll-call row and her team's header. */
export type LaneSummary = {
  /** Today's tasks, in time order. */
  sorted: Task[];
  done: number;
  total: number;
  inProg: Task | undefined;
  /** What she's on, or what's next. */
  nowTask: Task | undefined;
  nextTask: Task | undefined;
  /** Blocked, or past its planned time (Needs You's rule). */
  overdueIds: Set<string>;
};

export function laneSummary(tasks: Task[], nowTs: number): LaneSummary {
  const sorted = [...tasks].sort(byStart);
  const inProg = sorted.find((t) => t.status === "in_progress");
  const waiting = sorted.filter((t) => t.status === "todo" || t.status === "blocked");
  const nowTask = inProg ?? waiting[0];
  return {
    sorted,
    done: sorted.filter((t) => t.status === "done").length,
    total: sorted.length,
    inProg,
    nowTask,
    nextTask: waiting.find((t) => t.id !== nowTask?.id),
    overdueIds: new Set(
      sorted.filter((t) => t.status === "blocked" || isPastDue(t, nowTs)).map((t) => t.id),
    ),
  };
}

export type LanePill = { text: string; cls: string };

/** The one-line state at the end of a lane or roll-call row. */
export function lanePill(s: LaneSummary): LanePill {
  const n = s.overdueIds.size;
  if (n > 0) {
    return {
      text: `${n} ${n === 1 ? "needs" : "need"} you`,
      cls: "bg-[oklch(0.93_0.06_35)] text-[oklch(0.42_0.15_35)]",
    };
  }
  if (s.inProg) {
    return {
      text: `Now: ${s.inProg.title}`,
      cls: "bg-[oklch(0.93_0.08_75)] text-[oklch(0.4_0.13_75)]",
    };
  }
  if (s.total === 0) return { text: "Nothing today", cls: "bg-secondary text-muted-foreground" };
  if (s.done === s.total) {
    return { text: "All done", cls: "bg-[oklch(0.93_0.05_150)] text-[oklch(0.36_0.1_150)]" };
  }
  return { text: "On track", cls: "bg-[oklch(0.93_0.05_150)] text-[oklch(0.36_0.1_150)]" };
}

/** Lanes that need a decision first, then whoever is mid-task; otherwise as given. */
export function attentionRank(s: LaneSummary): number {
  if (s.overdueIds.size > 0) return 0;
  if (s.inProg) return 1;
  return 2;
}
