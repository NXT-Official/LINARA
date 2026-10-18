import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAppStores } from "@/features/dashboard/app-store-context";

import { NO_TEAM } from "../teams.constants";

const KEEP = "";

/**
 * Set a team, or add or take off a label, for everyone selected on People:
 * organising forty new staff is one action, not forty dialogs.
 */
export function BulkStaffBar({
  selectedIds,
  shownIds,
  onSelectAll,
  onDone,
}: {
  selectedIds: string[];
  /** Everyone the filters currently show. */
  shownIds: string[];
  onSelectAll: (ids: string[]) => void;
  onDone: () => void;
}) {
  const { teams } = useAppStores();
  const [teamChoice, setTeamChoice] = useState(KEEP);
  const [labelChoice, setLabelChoice] = useState(KEEP);
  const [busy, setBusy] = useState(false);
  const n = selectedIds.length;
  const allShown = n > 0 && shownIds.every((id) => selectedIds.includes(id));

  const run = async (what: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await what();
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change that.");
    } finally {
      setBusy(false);
    }
  };

  const people = `${n} ${n === 1 ? "helper" : "helpers"}`;
  const teamName = (v: string) =>
    v === NO_TEAM ? "no team" : (teams.teamById.get(v)?.name ?? "that team");
  const labelName = labelChoice ? (teams.labelById.get(labelChoice)?.name ?? "") : "";

  const select =
    "min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  const btn =
    "shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary disabled:opacity-50";

  return (
    <div className="sticky bottom-20 z-10 space-y-2 rounded-2xl border border-primary/30 bg-card p-3 shadow-lift sm:bottom-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">
          {n === 0 ? "Choose who to change" : `${people} chosen`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectAll(allShown ? [] : shownIds)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {allShown ? "Clear" : `Choose all ${shownIds.length} shown`}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Done
          </button>
        </div>
      </div>
      {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {!busy && n > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {teams.teams.length > 0 && (
            <div className="flex min-w-0 items-center gap-2">
              <select
                value={teamChoice}
                onChange={(e) => setTeamChoice(e.target.value)}
                aria-label="Move to team"
                className={select}
              >
                <option value={KEEP}>Move to team…</option>
                {teams.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                <option value={NO_TEAM}>No team</option>
              </select>
              <button
                type="button"
                disabled={!teamChoice}
                onClick={() =>
                  run(
                    () => teams.setTeam(selectedIds, teamChoice === NO_TEAM ? null : teamChoice),
                    `Moved ${people} to ${teamName(teamChoice)}.`,
                  ).then(() => setTeamChoice(KEEP))
                }
                className={btn}
              >
                Move
              </button>
            </div>
          )}
          {teams.labels.length > 0 && (
            <div className="flex min-w-0 items-center gap-2">
              <select
                value={labelChoice}
                onChange={(e) => setLabelChoice(e.target.value)}
                aria-label="Label"
                className={select}
              >
                <option value={KEEP}>Label…</option>
                {teams.labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!labelChoice}
                onClick={() =>
                  run(
                    () => teams.setLabel(selectedIds, labelChoice, true),
                    `Added ${labelName} to ${people}.`,
                  )
                }
                className={btn}
              >
                Add
              </button>
              <button
                type="button"
                disabled={!labelChoice}
                onClick={() =>
                  run(
                    () => teams.setLabel(selectedIds, labelChoice, false),
                    `Took ${labelName} off ${people}.`,
                  )
                }
                className={btn}
              >
                Take off
              </button>
            </div>
          )}
          {teams.teams.length === 0 && teams.labels.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Make a team or label under Teams and labels first.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
