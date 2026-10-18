import { MapPin } from "lucide-react";

import { useBusyElsewhere } from "../hooks/use-busy-elsewhere";
import { slotTime } from "../sharing.utils";

/**
 * When someone who works here is also booked at another of the family's
 * houses that day (add-shared-staff-availability.sql): "At the Main House
 * now", or "At the Main House 2:00 PM, 4:30 PM". Times and house only; the
 * other house's tasks stay theirs. Nothing for staff who work in one house.
 */
export function BusyElsewhereNote({ helperId, dayIso }: { helperId: string; dayIso: string }) {
  const { busyOn } = useBusyElsewhere();
  const slots = busyOn(helperId, dayIso).filter((s) => s.status !== "done");
  if (slots.length === 0) return null;

  const byHouse = new Map<string, typeof slots>();
  for (const s of slots) byHouse.set(s.householdName, [...(byHouse.get(s.householdName) ?? []), s]);
  const text = [...byHouse.entries()]
    .map(([house, list]) =>
      list.some((s) => s.status === "in_progress")
        ? `At ${house} now`
        : `At ${house} ${list.map(slotTime).join(", ")}`,
    )
    .join(" · ");

  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <MapPin className="h-3 w-3 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}
