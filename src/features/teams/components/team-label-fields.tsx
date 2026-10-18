import { Loader2, Plus } from "lucide-react";
import { useId, useState } from "react";

import { Field } from "@/components/shared/field";
import { useAppStores } from "@/features/dashboard/app-store-context";

const NEW_TEAM = "__new__";

/**
 * Team and labels for one helper: in the invite form, and when editing her on
 * People. A new team or label can be made right here, so organising a large
 * staff doesn't mean leaving the form. Renders nothing until
 * add-teams-and-labels.sql is applied.
 */
export function TeamLabelFields({
  teamId,
  onTeam,
  labelIds,
  onLabels,
}: {
  teamId: string | null;
  onTeam: (teamId: string | null) => void;
  labelIds: string[];
  onLabels: (labelIds: string[]) => void;
}) {
  const { teams } = useAppStores();
  const [newTeam, setNewTeam] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState<"team" | "label" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const labelsHeading = useId();
  if (!teams.available) return null;

  const addTeam = async () => {
    if (!newTeam?.trim()) return;
    setBusy("team");
    setError(null);
    try {
      const team = await teams.createTeam(newTeam);
      onTeam(team.id);
      setNewTeam(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the team");
    } finally {
      setBusy(null);
    }
  };

  const addLabel = async () => {
    if (!newLabel?.trim()) return;
    setBusy("label");
    setError(null);
    try {
      const label = await teams.createLabel(newLabel);
      onLabels([...labelIds, label.id]);
      setNewLabel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the label");
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string) =>
    onLabels(labelIds.includes(id) ? labelIds.filter((x) => x !== id) : [...labelIds, id]);

  const input =
    "min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";
  const addBtn =
    "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep disabled:opacity-50";

  return (
    <>
      <Field label="Team">
        {newTeam === null ? (
          <select
            value={teamId ?? ""}
            onChange={(e) => {
              if (e.target.value === NEW_TEAM) setNewTeam("");
              else onTeam(e.target.value || null);
            }}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">No team</option>
            {teams.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value={NEW_TEAM}>New team…</option>
          </select>
        ) : (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newTeam}
              onChange={(e) => setNewTeam(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addTeam();
                }
              }}
              maxLength={40}
              placeholder="e.g. Kitchen, Grounds, Main house"
              aria-label="New team's name"
              className={input}
            />
            <button
              type="button"
              onClick={addTeam}
              disabled={!newTeam.trim() || busy !== null}
              className={addBtn}
            >
              {busy === "team" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
            </button>
            <button
              type="button"
              onClick={() => setNewTeam(null)}
              className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
        <span className="mt-1 block text-xs text-muted-foreground">
          The part of the house they work in. The Pass, Schedule and Money group by it.
        </span>
      </Field>

      {/* A group, not a Field: a <label> would pass a tap on its hint text
          to the first chip. */}
      <div role="group" aria-labelledby={labelsHeading}>
        <span
          id={labelsHeading}
          className="mb-1.5 block text-xs font-semibold text-muted-foreground"
        >
          Labels
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {teams.labels.map((l) => {
            const on = labelIds.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => toggle(l.id)}
                aria-pressed={on}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.name}
              </button>
            );
          })}
          {newLabel === null && (
            <button
              type="button"
              onClick={() => setNewLabel("")}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
            >
              <Plus className="h-3 w-3" /> New label
            </button>
          )}
        </div>
        {newLabel !== null && (
          <div className="mt-2 flex items-center gap-2">
            <input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addLabel();
                }
              }}
              maxLength={30}
              placeholder="e.g. Night shift, Trainee"
              aria-label="New label's name"
              className={input}
            />
            <button
              type="button"
              onClick={addLabel}
              disabled={!newLabel.trim() || busy !== null}
              className={addBtn}
            >
              {busy === "label" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
            </button>
            <button
              type="button"
              onClick={() => setNewLabel(null)}
              className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
        <span className="mt-1 block text-xs text-muted-foreground">
          Anything else worth filtering by. They see their team and labels on their Record.
        </span>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </>
  );
}
