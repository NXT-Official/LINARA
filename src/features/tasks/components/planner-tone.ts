import type { TaskTone } from "../planner.utils";

// Tailwind needs these spelled out whole. Colour is never the only signal:
// every tone but "planned" also has its word (StatusTag) on the row.

/** The left edge of a task row in Week and By person. */
export const TONE_EDGE: Record<TaskTone, string> = {
  late: "border-l-destructive",
  held: "border-l-terracotta",
  doing: "border-l-primary",
  done: "border-l-muted-foreground/30",
  planned: "border-l-transparent",
};

/** A task's dot in Month. Planned is hollow, so it reads as "nothing yet". */
export const TONE_DOT: Record<TaskTone, string> = {
  late: "bg-destructive",
  held: "bg-terracotta",
  doing: "bg-primary",
  done: "bg-muted-foreground/30",
  planned: "ring-1 ring-inset ring-muted-foreground/70",
};
