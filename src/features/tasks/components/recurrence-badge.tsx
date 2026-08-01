import { Repeat } from "lucide-react";

import type { Recurrence } from "../task.types";
import { recurrenceLabel } from "../task.utils";

export function RecurrenceBadge({ recurrence }: { recurrence?: Recurrence }) {
  const label = recurrenceLabel(recurrence);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-pine-deep">
      <Repeat className="h-2.5 w-2.5" /> {label}
    </span>
  );
}
