import type { RunStatus } from "../grocery.types";
import { RUN_STATUS_LABEL } from "../grocery.utils";

const TONE: Record<RunStatus, string> = {
  draft: "bg-secondary text-muted-foreground",
  pending: "bg-terracotta-soft text-accent-foreground",
  ready: "bg-secondary text-pine-deep",
  done: "bg-status-done-soft text-status-done-ink",
  cancelled: "bg-secondary text-muted-foreground",
};

/** Where a run is. A status, so a pill (DESIGN.md: pills mean status). */
export function RunStatusPill({ status }: { status: RunStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[status]}`}
    >
      {RUN_STATUS_LABEL[status]}
    </span>
  );
}
