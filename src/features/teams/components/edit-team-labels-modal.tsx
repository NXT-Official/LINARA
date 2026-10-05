import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/shared/modal";
import { useAppStores } from "@/features/dashboard/app-store-context";

import { TeamLabelFields } from "./team-label-fields";

/** Move one helper to another team, or change her labels, from People. */
export function EditTeamLabelsModal({
  helperId,
  name,
  initialTeamId,
  onClose,
}: {
  helperId: string;
  name: string;
  initialTeamId: string | null;
  onClose: () => void;
}) {
  const { teams } = useAppStores();
  const initialLabels = teams.labelIdsByHelper.get(helperId) ?? [];
  const [teamId, setTeamId] = useState(initialTeamId);
  const [labelIds, setLabelIds] = useState<string[]>(initialLabels);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const added = labelIds.filter((id) => !initialLabels.includes(id));
      const removed = initialLabels.filter((id) => !labelIds.includes(id));
      await Promise.all([
        teamId !== initialTeamId ? teams.setTeam([helperId], teamId) : null,
        ...added.map((id) => teams.setLabel([helperId], id, true)),
        ...removed.map((id) => teams.setLabel([helperId], id, false)),
      ]);
      toast.success(`${name}'s team and labels are set.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl text-foreground">{name}'s team and labels</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            She sees these on her Record in the Linara app.
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
