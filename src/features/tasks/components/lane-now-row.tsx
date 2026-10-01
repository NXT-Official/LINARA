import { PalengkeChip } from "@/features/groceries/components/palengke-chip";

import type { Task } from "../task.types";
import { CommentBadge } from "./comment-badge";
import { isPalengke } from "../task.utils";

export function LaneNowRow({
  label,
  task,
  when,
  color,
  late,
  muted,
  onOpen,
}: {
  label: string;
  task: Task;
  /** Display time, with the day when it isn't today (taskWhen). */
  when: string;
  color: { solid: string; soft: string };
  late: boolean;
  muted?: boolean;
  onOpen?: () => void;
}) {
  const Wrapper = onOpen ? "button" : "div";
  return (
    <Wrapper
      {...(onOpen ? { type: "button" as const, onClick: onOpen } : {})}
      className="block w-full rounded-2xl border px-3 py-2 text-left transition enabled:hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <span className="ml-auto">
          <CommentBadge taskId={task.id} />
        </span>
      </div>
      <div className="mt-0.5 truncate text-sm font-medium text-foreground">{task.title}</div>
      {isPalengke(task) && (
        <div className="mt-1">
          <PalengkeChip compact />
        </div>
      )}
    </Wrapper>
  );
}
