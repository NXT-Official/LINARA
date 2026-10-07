import { MapPin } from "lucide-react";
import { useContext } from "react";

import { AppStoreContext } from "@/features/dashboard/app-store-context";

import type { PlaceRef } from "../sharing.types";

/** "Main House → School" on a task that's a trip; nothing otherwise. */
export function TripChip({ from, to }: { from?: PlaceRef; to?: PlaceRef }) {
  const sharing = useContext(AppStoreContext)?.sharing;
  if (!sharing || (!from && !to)) return null;
  const a = sharing.placeName(from);
  const b = sharing.placeName(to);
  const text = a && b ? `${a} → ${b}` : a ? `From ${a}` : b ? `To ${b}` : "Trip";
  return (
    <span className="inline-flex max-w-full items-center gap-1 text-xs font-semibold text-muted-foreground">
      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
    </span>
  );
}
