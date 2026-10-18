import { Link } from "@tanstack/react-router";
import { ShoppingBasket } from "lucide-react";

import type { Task } from "@/features/tasks/task.types";
import { isPalengke } from "@/features/tasks/task.utils";

import { useGrocery } from "../grocery-context";
import { fmtPeso, progress, spentOn } from "../grocery.utils";

/**
 * On a task that carries a grocery run (linked from the run, or a task
 * called "palengke"): how far the run is, or how much is still needed, and
 * a jump to the Pantry page. Nothing for any other task. `className` wraps
 * it, for cards that space it on its own line.
 */
export function PalengkeChip({
  task,
  compact,
  className,
}: {
  task: Task;
  compact?: boolean;
  className?: string;
}) {
  const ctx = useGrocery();
  const run = ctx.runForTask(task.id);
  if (!run && !isPalengke(task)) return null;

  let label = `Grocery · ${ctx.toBuyCount} to buy`;
  if (run) {
    const items = ctx.itemsByRun.get(run.id) ?? [];
    const p = progress(items);
    label = `${run.title} · ${p.bought} of ${p.total} bought · ${fmtPeso(spentOn(items))}`;
  }
  const chip = (
    <Link
      to="/manager/pantry"
      className={`inline-flex max-w-full items-center gap-1 rounded-lg border border-terracotta/50 bg-terracotta-soft/60 font-semibold text-accent-foreground transition hover:bg-terracotta-soft ${
        compact ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-xs"
      }`}
      title={run ? "The grocery run on this task" : "Grocery list"}
    >
      <ShoppingBasket className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
  return className ? <div className={className}>{chip}</div> : chip;
}
