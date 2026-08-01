import type { Weekday } from "@/lib/time";
import type { Recurrence, Routine, Task } from "./task.types";

export function recurrenceLabel(r?: Recurrence): string | null {
  if (!r || r === "none") return null;
  if (r === "daily") return "Daily";
  if (Array.isArray(r) && r.length > 0) return r.join(", ");
  return null;
}

export const routineMatches = (r: Routine, wd: Weekday): boolean => {
  if (r.recurrence === "daily") return true;
  return r.recurrence.includes(wd);
};

// The market run is the one task that carries the grocery list and its budget.
export const isPalengke = (t: Task) => /pal[eé]ngke|marketing run/i.test(t.title);
