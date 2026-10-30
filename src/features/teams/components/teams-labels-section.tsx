import { Check, Layers, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAppStores } from "@/features/dashboard/app-store-context";
import { PlanGate } from "@/features/plan/components/plan-gate";

import { LABEL_TONES, labelToneSwatch } from "../teams.constants";
import type { Label, LabelTone, Team } from "../teams.types";
import { LabelChip } from "./label-chip";
import { useT } from "@/lib/i18n/locale-context";

/**
 * The household's teams and labels, on People: add, rename, recolour,
 * remove. Removing a team leaves its helpers on no team; removing a label
 * takes it off everyone. Read-only for a remote admin. Hidden until
 * add-teams-and-labels.sql is applied; off the plan, the lock and the upgrade.
 */
export function TeamsLabelsSection({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const { teams, invites } = useAppStores();
  const [adding, setAdding] = useState<"team" | "label" | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  if (teams.locked) return <PlanGate feature="teams_labels">{null}</PlanGate>;
  if (!teams.available) return null;

  const current = invites.invites.filter((i) => i.status !== "ended");
  const teamCount = (id: string) => current.filter((i) => i.teamId === id).length;
  const labelCount = (id: string) =>
    current.filter((i) => (teams.labelIdsByHelper.get(i.id) ?? []).includes(id)).length;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!draft.trim() || !adding) return;
    const ok = await run(() =>
      adding === "team" ? teams.createTeam(draft) : teams.createLabel(draft),
    );
    if (ok) {
      setDraft("");
      setAdding(null);
    }
  };

  const empty = teams.teams.length === 0 && teams.labels.length === 0;

  return (
    <section className="rounded-3xl bg-card p-5 shadow-soft ring-1 ring-border/20 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-foreground">{t("teams.teamsAndLabels")}</h2>
          <p className="text-xs text-muted-foreground">{t("teams.aTeamIsThePart")}</p>
        </div>
        <Layers className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>

      {empty && (
        <p className="mb-3 text-sm text-muted-foreground">{t("teams.noTeamsOrLabelsYet")}</p>
      )}

      {teams.teams.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{t("teams.teams")}</h3>
          <ul className="divide-y divide-border/70">
            {teams.teams.map((t) => (
              <TeamRow
                key={t.id}
                team={t}
                count={teamCount(t.id)}
                canEdit={canEdit}
                busy={busy}
                onRename={(name) => run(() => teams.renameTeam(t.id, name))}
                onDelete={() => run(() => teams.deleteTeam(t.id))}
              />
            ))}
          </ul>
        </div>
      )}

      {teams.labels.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{t("teams.labels")}</h3>
          <ul className="divide-y divide-border/70">
            {teams.labels.map((l) => (
              <LabelRow
                key={l.id}
                label={l}
                count={labelCount(l.id)}
                canEdit={canEdit}
                busy={busy}
                onSave={(name, tone) => run(() => teams.updateLabel(l.id, name, tone))}
                onDelete={() => run(() => teams.deleteLabel(l.id))}
              />
            ))}
          </ul>
        </div>
      )}

      {canEdit &&
        (adding ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
                if (e.key === "Escape") setAdding(null);
              }}
              maxLength={adding === "team" ? 40 : 30}
              placeholder={adding === "team" ? t("teams.egKitchen") : t("teams.egNightShift")}
              aria-label={adding === "team" ? t("teams.newTeamSName") : t("teams.newLabelSName")}
              className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={add}
              disabled={!draft.trim() || busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-soft disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("teams.add")}
            </button>
            <button
              type="button"
              onClick={() => setAdding(null)}
              className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              {t("teams.cancel")}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft("");
                setAdding("team");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-card px-3 py-2 text-xs font-semibold text-primary shadow-soft hover:bg-primary/5"
            >
              <Plus className="h-3.5 w-3.5" /> {t("teams.newTeam2")}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft("");
                setAdding("label");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-card px-3 py-2 text-xs font-semibold text-primary shadow-soft hover:bg-primary/5"
            >
              <Plus className="h-3.5 w-3.5" /> {t("teams.newLabel")}
            </button>
          </div>
        ))}
    </section>
  );
}

const iconBtn =
  "grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50";

function TeamRow({
  team,
  count,
  canEdit,
  busy,
  onRename,
  onDelete,
}: {
  team: Team;
  count: number;
  canEdit: boolean;
  busy: boolean;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    return (
      <li className="flex items-center gap-2 py-2.5">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          aria-label={`Rename ${team.name}`}
          className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          aria-label={t("teams.saveName")}
          disabled={busy || !name.trim()}
          onClick={async () => {
            if (await onRename(name)) setEditing(false);
          }}
          className={iconBtn}
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={t("teams.cancel")}
          onClick={() => {
            setName(team.name);
            setEditing(false);
          }}
          className={iconBtn}
        >
          <X className="h-4 w-4" />
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
        {team.name}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {t("teams.helperCount", { count })}
      </span>
      {canEdit &&
        (confirming ? (
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("teams.removeTeamConfirm", {
                extra: count > 0 ? t("teams.goToNoTeam", { count }) : "",
              })}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground disabled:opacity-50"
            >
              {t("teams.remove")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs font-semibold text-muted-foreground"
            >
              {t("teams.keep")}
            </button>
          </span>
        ) : (
          <>
            <button
              type="button"
              aria-label={`Rename ${team.name}`}
              onClick={() => setEditing(true)}
              className={iconBtn}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Remove ${team.name}`}
              onClick={() => setConfirming(true)}
              className={iconBtn}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ))}
    </li>
  );
}

function LabelRow({
  label,
  count,
  canEdit,
  busy,
  onSave,
  onDelete,
}: {
  label: Label;
  count: number;
  canEdit: boolean;
  busy: boolean;
  onSave: (name: string, tone: LabelTone) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);
  const [tone, setTone] = useState<LabelTone>(label.tone);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    return (
      <li className="space-y-2 py-2.5">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            aria-label={`Rename ${label.name}`}
            className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            aria-label={t("teams.saveLabel")}
            disabled={busy || !name.trim()}
            onClick={async () => {
              if (await onSave(name, tone)) setEditing(false);
            }}
            className={iconBtn}
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={t("teams.cancel")}
            onClick={() => {
              setName(label.name);
              setTone(label.tone);
              setEditing(false);
            }}
            className={iconBtn}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2" role="radiogroup" aria-label={t("teams.colour")}>
          {LABEL_TONES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tone === t}
              aria-label={t}
              onClick={() => setTone(t)}
              className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-card transition ${
                tone === t ? "ring-2 ring-primary" : "ring-1 ring-border"
              }`}
              style={{ backgroundColor: labelToneSwatch[t] }}
            />
          ))}
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 py-2.5">
      <span className="min-w-0 flex-1">
        <LabelChip label={label} />
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {t("teams.helperCount", { count })}
      </span>
      {canEdit &&
        (confirming ? (
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("teams.removeFromEveryone")}</span>
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground disabled:opacity-50"
            >
              {t("teams.remove")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs font-semibold text-muted-foreground"
            >
              {t("teams.keep")}
            </button>
          </span>
        ) : (
          <>
            <button
              type="button"
              aria-label={`Edit ${label.name}`}
              onClick={() => setEditing(true)}
              className={iconBtn}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Remove ${label.name}`}
              onClick={() => setConfirming(true)}
              className={iconBtn}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ))}
    </li>
  );
}
