import { ArrowRight } from "lucide-react";
import { useContext, useId } from "react";

import { AppStoreContext } from "@/features/dashboard/app-store-context";

import type { PlaceRef } from "../sharing.types";
import { placeFromKey, placeKey } from "../sharing.utils";

const select =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";

/**
 * "Is it a trip?" and, if so, from where to where: the family's houses or a
 * saved place. Renders nothing until add-shared-staff-and-places.sql is
 * applied, or with no app stores (a unit test).
 */
export function TripFields({
  from,
  to,
  onChange,
}: {
  from?: PlaceRef;
  to?: PlaceRef;
  onChange: (from: PlaceRef | undefined, to: PlaceRef | undefined) => void;
}) {
  const stores = useContext(AppStoreContext);
  const id = useId();
  const sharing = stores?.sharing;
  if (!sharing?.available) return null;
  const isTrip = !!from || !!to;
  const here = stores?.session.householdId ?? null;
  const thisHouse = sharing.family.find((h) => h.id === here);
  // Default a new trip to leave from this house.
  const start = () =>
    onChange(
      here ? { kind: "house", id: here } : undefined,
      sharing.places[0] ? { kind: "place", id: sharing.places[0].id } : undefined,
    );

  const options = (
    <>
      <option value="">Choose…</option>
      <optgroup label="Houses">
        {sharing.family.map((h) => (
          <option key={h.id} value={`h:${h.id}`}>
            {h.id === here ? `${h.name} (this house)` : h.name}
          </option>
        ))}
      </optgroup>
      {sharing.places.length > 0 && (
        <optgroup label="Places">
          {sharing.places.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={isTrip}
          onChange={(e) => (e.target.checked ? start() : onChange(undefined, undefined))}
          className="h-4 w-4 accent-primary"
        />
        It's a trip
        {!isTrip && thisHouse && (
          <span className="text-xs text-muted-foreground">
            (otherwise it's at {thisHouse.name})
          </span>
        )}
      </label>
      {isTrip && (
        <div className="flex items-end gap-2">
          <label className="block min-w-0 flex-1" htmlFor={`${id}-from`}>
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">From</span>
            <select
              id={`${id}-from`}
              value={placeKey(from)}
              onChange={(e) => onChange(placeFromKey(e.target.value), to)}
              className={select}
            >
              {options}
            </select>
          </label>
          <ArrowRight className="mb-3 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <label className="block min-w-0 flex-1" htmlFor={`${id}-to`}>
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">To</span>
            <select
              id={`${id}-to`}
              value={placeKey(to)}
              onChange={(e) => onChange(from, placeFromKey(e.target.value))}
              className={select}
            >
              {options}
            </select>
          </label>
        </div>
      )}
      {isTrip && sharing.places.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Save places like School or Office under Places on People.
        </p>
      )}
    </div>
  );
}
