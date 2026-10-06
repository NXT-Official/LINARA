import type { GroceryItem, GroceryRun, GroceryTemplate, RunStatus } from "./grocery.types";

export const fmtPeso = (n: number) => `₱${Math.round(n).toLocaleString()}`;

/** "1 pc", "2 pcs", "1 stalk". Units are free text; only the default "pcs" needs a singular. */
export const fmtQty = (qty: number, unit: string) =>
  `${qty} ${qty === 1 && unit === "pcs" ? "pc" : unit}`;

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  draft: "Draft",
  pending: "Waiting for approval",
  ready: "Ready to shop",
  done: "Done",
  cancelled: "Cancelled",
};

export const OPEN_STATUSES: RunStatus[] = ["draft", "pending", "ready"];

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** What the lines that were bought cost. */
export function spentOn(items: GroceryItem[]): number {
  return items.reduce((sum, g) => sum + (g.bought ? (g.costPHP ?? 0) : 0), 0);
}

export function progress(items: GroceryItem[]): { bought: number; total: number } {
  return { bought: items.filter((g) => g.bought).length, total: items.length };
}

/**
 * Petty cash for one run: cash handed over, minus what was spent, minus the
 * change that came back. `gap` is what's unaccounted for (positive: missing;
 * negative: more came back than should have), or null until there's cash
 * and change to compare.
 */
export function reconcile(
  run: Pick<GroceryRun, "cashGiven" | "changeReturned">,
  spent: number,
): { cash: number | null; spent: number; change: number | null; gap: number | null } {
  const { cashGiven: cash, changeReturned: change } = run;
  const gap = cash === null || change === null ? null : round2(cash - spent - change);
  return { cash, spent, change, gap };
}

/** The change that should come back: cash minus spent, never below zero. */
export function expectedChange(cash: number | null, spent: number): number | null {
  return cash === null ? null : Math.max(0, round2(cash - spent));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The first and last instant of the month `at` falls in (local time), and its name. */
export function monthBounds(at: Date): { start: Date; end: Date; label: string } {
  const start = new Date(at.getFullYear(), at.getMonth(), 1);
  const end = new Date(at.getFullYear(), at.getMonth() + 1, 1);
  return {
    start,
    end,
    label: start.toLocaleDateString("en-PH", { month: "long", year: "numeric" }),
  };
}

export function startOfDay(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}

/** YYYY-MM-DD in local time. */
export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "Sat, Oct 10" for a YYYY-MM-DD. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * When a repeat is next due: the next day on its weekday (today counts),
 * unless a run was started from it in the six days before that. Null for a
 * repeat with no fixed day, or one already started for this week.
 */
export function nextDue(
  template: Pick<GroceryTemplate, "weekday" | "lastStartedAt">,
  now: Date,
): { date: string; daysAway: number } | null {
  if (template.weekday === null) return null;
  const today = startOfDay(now);
  const daysAway = (template.weekday - today.getDay() + 7) % 7;
  const due = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysAway);
  if (template.lastStartedAt) {
    const windowStart = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 6);
    if (new Date(template.lastStartedAt) >= windowStart) return null;
  }
  return { date: isoDate(due), daysAway };
}

/** Open runs in the order they need someone: waiting for approval, ready, then drafts; soonest first. */
export function sortOpenRuns(runs: GroceryRun[]): GroceryRun[] {
  const rank: Record<RunStatus, number> = { pending: 0, ready: 1, draft: 2, done: 3, cancelled: 4 };
  return [...runs].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.shopOn ?? "9999").localeCompare(b.shopOn ?? "9999") ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
