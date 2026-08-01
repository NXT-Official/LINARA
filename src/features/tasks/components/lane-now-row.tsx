import { PalengkeChip } from "@/features/groceries/components/palengke-chip";

import type { Task } from "../task.types";
import { isPalengke } from "../task.utils";

export function LaneNowRow({
  label,
  task,
  color,
  late,
  muted,
}: {
  label: string;
  task: Task;
  color: { solid: string; soft: string };
  late: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border px-3 py-2"
      style={{
        backgroundColor: muted ? "transparent" : color.soft,
        borderColor: `${color.solid}40`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className="text-[11px] font-semibold tabular-nums text-foreground">
          · {task.time}
        </span>
        {late && (
          <span className="rounded-full bg-[oklch(0.93_0.06_35)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[oklch(0.42_0.15_35)]">
            Late
          </span>
        )}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium text-foreground">{task.title}</div>
      {isPalengke(task) && (
        <div className="mt-1">
          <PalengkeChip compact />
        </div>
      )}
    </div>
  );
}
