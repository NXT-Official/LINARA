import { PalengkeChip } from "@/features/groceries/components/palengke-chip";

import type { Task } from "../task.types";
import { isPalengke } from "../task.utils";

export function LaneNowRow({
  label,
  task,
  when,
  color,
  late,
  muted,
}: {
  label: string;
  task: Task;
  /** Display time, with the day when it isn't today (taskWhen). */
  when: string;
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
        <span className="text-xs font-bold text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-foreground">· {when}</span>
        {late && (
          <span className="rounded-full bg-[oklch(0.93_0.06_35)] px-1.5 py-0.5 text-xs font-bold text-[oklch(0.42_0.15_35)]">
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
