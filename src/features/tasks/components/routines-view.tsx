import { Plus, Repeat } from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/shared/avatar";
import { stationTone } from "@/features/people/people.constants";
import type { Helper } from "@/features/people/people.types";

import type { Routine } from "../task.types";
import { NewRoutineModal } from "./new-routine-modal";
import { RoutineRow } from "./routine-row";
import { useT } from "@/lib/i18n/locale-context";

export function RoutinesView({
  routines,
  token,
  activeHelpers,
  onAdd,
  onRemove,
}: {
  routines: Routine[];
  token: string | null;
  activeHelpers: Helper[];
  onAdd: (r: Omit<Routine, "id" | "station">) => void;
  onRemove: (id: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const byHelper = activeHelpers.map((h) => ({
    helper: h,
    items: routines.filter((r) => r.helperId === h.id),
  }));
  // Nobody's yet, or someone who has left: they spawn Unassigned.
  const unassigned = routines.filter(
    (r) => !r.helperId || !activeHelpers.some((h) => h.id === r.helperId),
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl leading-tight text-foreground">
              {t("tasks.routines")}
            </h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              {t("tasks.recurringTasksLiveHereIncluding")}
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep"
          >
            <Plus className="h-4 w-4" /> {t("tasks.newRoutine")}
          </button>
        </div>
      </section>

      {routines.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-pine-deep">
            <Repeat className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{t("tasks.noRoutinesYetAddOne")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {byHelper.map(({ helper, items }) => {
            if (items.length === 0) return null;
            return (
              <section
                key={helper.id}
                className="rounded-3xl ring-1 ring-border/20 bg-card/60 p-4 sm:p-5"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2.5">
                    <Avatar initials={helper.initials} />
                    <div>
                      <div className="text-sm font-semibold text-foreground">{helper.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {helper.station} · {helper.shift}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stationTone(helper.station)}`}
                  >
                    {t("tasks.routineCount", { count: items.length })}
                  </span>
                </div>
                <div className="divide-y divide-border/70">
                  {items.map((r) => (
                    <RoutineRow key={r.id} routine={r} onRemove={() => onRemove(r.id)} />
                  ))}
                </div>
              </section>
            );
          })}
          {unassigned.length > 0 && (
            <section className="rounded-3xl ring-1 ring-border/20 bg-card/60 p-4 sm:p-5">
              <div className="mb-3 px-1">
                <div className="text-sm font-semibold text-foreground">{t("tasks.unassigned")}</div>
                <div className="text-xs text-muted-foreground">
                  {t("tasks.landsOnYourBoardFor")}
                </div>
              </div>
              <div className="divide-y divide-border/70">
                {unassigned.map((r) => (
                  <RoutineRow key={r.id} routine={r} onRemove={() => onRemove(r.id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {open && (
        <NewRoutineModal
          token={token}
          activeHelpers={activeHelpers}
          onClose={() => setOpen(false)}
          onAdd={(r) => {
            onAdd(r);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
