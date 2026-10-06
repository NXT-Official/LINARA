import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/shared/modal";
import { useAppStores } from "@/features/dashboard/app-store-context";

import { TeamLabelFields } from "./team-label-fields";

/**
 * Where one helper works, from People: her team here, teams she also covers,
 * her labels, and (for someone this household employs) the family's other
 * households she also works in. For someone shared in from another
 * household, "team" is her team here; where else she works is her
 * employer's to change.
 */
export function EditTeamLabelsModal({
  helperId,
  name,
  initialTeamId,
  shared = false,
  onClose,
}: {
  helperId: string;
  name: string;
  initialTeamId: string | null;
  /** Employed elsewhere in the family and shared in. */
  shared?: boolean;
  onClose: () => void;
}) {
  const { teams, sharing } = useAppStores();
  const initialLabels = teams.labelIdsByHelper.get(helperId) ?? [];
  const initialCovers = (sharing.coversByHelper.get(helperId) ?? []).filter((id) =>
    teams.teamById.has(id),
  );
  const initialHouses = sharing.householdsOf(helperId);
  const [teamId, setTeamId] = useState(initialTeamId);
  const [labelIds, setLabelIds] = useState<string[]>(initialLabels);
  const [covers, setCovers] = useState<string[]>(initialCovers);
  const [houses, setHouses] = useState<string[]>(initialHouses);
  const [saving, setSaving] = useState(false);

  const diff = (before: string[], after: string[]) => ({
    added: after.filter((id) => !before.includes(id)),
    removed: before.filter((id) => !after.includes(id)),
  });

  const save = async () => {
    setSaving(true);
    try {
      const l = diff(initialLabels, labelIds);
      const c = diff(initialCovers, covers);
      const h = diff(initialHouses, houses);
      await Promise.all([
        teamId !== initialTeamId
          ? shared
            ? sharing.setSharedTeam(helperId, teamId)
            : teams.setTeam([helperId], teamId)
          : null,
        ...l.added.map((id) => teams.setLabel([helperId], id, true)),
        ...l.removed.map((id) => teams.setLabel([helperId], id, false)),
        ...c.added.map((id) => sharing.setCover(helperId, id, true)),
        ...c.removed.map((id) => sharing.setCover(helperId, id, false)),
        ...h.added.map((id) => sharing.setHousehold(helperId, id, true)),
        ...h.removed.map((id) => sharing.setHousehold(helperId, id, false)),
      ]);
      toast.success(`Saved where ${name} works.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const chip = (on: boolean) =>
    `rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:text-foreground"
    }`;
  const otherTeams = teams.teams.filter((t) => t.id !== teamId);

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl text-foreground">Where {name} works</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            They see their houses, teams and labels on their Record in the Linara app.
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 space-y-3">
        <TeamLabelFields
          teamId={teamId}
          onTeam={setTeamId}
          labelIds={labelIds}
          onLabels={setLabelIds}
        />

        {sharing.available && otherTeams.length > 0 && (
          <div role="group" aria-label="Also covers">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Also covers
            </span>
            <div className="flex flex-wrap gap-1.5">
              {otherTeams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(covers, setCovers, t.id)}
                  aria-pressed={covers.includes(t.id)}
                  className={chip(covers.includes(t.id))}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <span className="mt-1 block text-xs text-muted-foreground">
              They stay in their own team's group, and show when you look at these too.
            </span>
          </div>
        )}

        {sharing.available && !shared && sharing.shareTargets.length > 0 && (
          <div role="group" aria-label="Also works at">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Also works at
            </span>
            <div className="flex flex-wrap gap-1.5">
              {sharing.shareTargets.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => toggle(houses, setHouses, h.id)}
                  aria-pressed={houses.includes(h.id)}
                  className={chip(houses.includes(h.id))}
                >
                  {h.name}
                </button>
              ))}
            </div>
            <span className="mt-1 block text-xs text-muted-foreground">
              They stay employed and paid here; those houses can give them tasks. Their managers see
              their shift, not their pay.
            </span>
          </div>
        )}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/40 pt-4">
        <button
          onClick={onClose}
          disabled={saving}
          className="rounded-lg px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </button>
      </div>
    </Modal>
  );
}
