import { Home, Tags } from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/shared/avatar";
import { useAppStores } from "@/features/dashboard/app-store-context";
import { LabelChips } from "@/features/teams/components/label-chip";
import { EditTeamLabelsModal } from "@/features/teams/components/edit-team-labels-modal";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

/**
 * Staff employed by another household of the family who also work here. They
 * get tasks, Quick Utos and a lane here like anyone; their pay, leave and
 * record stay with the household that employs them, so none of that shows.
 */
export function SharedStaffSection({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const { sharing, teams, activeHelpers } = useAppStores();
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    teamId: string | null;
  } | null>(null);
  const shared = activeHelpers.filter((h) => h.sharedFrom);
  if (!sharing.available || shared.length === 0) return null;

  return (
    <section className="rounded-3xl bg-card p-5 shadow-soft ring-1 ring-border/20 sm:p-6">
      <div className="mb-4">
        <h2 className="font-display text-xl text-foreground">{t("sharing.alsoWorkingHere")}</h2>
        <p className="text-xs text-muted-foreground">{t("sharing.employedByAnotherOfYour")}</p>
      </div>
      <div className="divide-y divide-border/70">
        {shared.map((h) => {
          const team = h.teamId ? teams.teamById.get(h.teamId)?.name : null;
          return (
            <div key={h.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
              <Avatar initials={h.initials} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{h.name}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-pine-deep">
                    {h.station}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Home className="h-3 w-3" aria-hidden />{" "}
                  {team
                    ? t("sharing.employedByTeamHere", { house: h.sharedFrom ?? "", team })
                    : t("sharing.employedBy", { house: h.sharedFrom ?? "" })}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {richText(t("sharing.rest"), { shift: h.shift, restDay: h.restDay })}
                </div>
                {teams.labelsOf(h.id).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <LabelChips labels={teams.labelsOf(h.id)} />
                  </div>
                )}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing({ id: h.id, name: h.name, teamId: h.teamId })}
                  className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Tags className="h-3 w-3" /> {t("sharing.teamLabels")}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {editing && (
        <EditTeamLabelsModal
          helperId={editing.id}
          name={editing.name}
          initialTeamId={editing.teamId}
          shared
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
