import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAppStores } from "@/features/dashboard/app-store-context";

import { stationTone } from "../people.constants";
import type { StationRow } from "../stations.actions";

/**
 * The household's stations, on People: add, rename, remove (KNOWN_GAPS O37,
 * add-household-stations.sql). Renaming one renames it on everyone who has
 * it. A station anyone is on can't be removed until they're given another
 * (Station on their card). Read-only for a remote admin, and until the SQL is
 * applied, when it shows the five.
 */
export function StationsSection({ canEdit }: { canEdit: boolean }) {
  const { stations } = useAppStores();
  const editable = canEdit && stations.available;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

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
    if (!draft.trim()) return;
    if (await run(() => stations.create(draft))) {
      setDraft("");
      setAdding(false);
    }
  };

  return (
    <section className="rounded-3xl bg-card p-5 shadow-soft ring-1 ring-border/20 sm:p-6">
      <div className="mb-4">
        <h2 className="font-display text-xl text-foreground">Stations</h2>
        <p className="text-xs text-muted-foreground">
          What each person does: their colour on the Pass and Schedule, and how tasks find the right
          person. Add your own, like Gardener or Guard.
        </p>
      </div>

      <ul className="divide-y divide-border/70">
        {stations.stations.map((s) => (
          <StationItem
            key={s.id}
            station={s}
            canEdit={editable}
            busy={busy}
            onlyOne={stations.stations.length === 1}
            onRename={(name) => run(() => stations.rename(s.id, name))}
            onDelete={() => run(() => stations.remove(s.id))}
          />
        ))}
      </ul>

      {editable &&
        (adding ? (
          <div className="mt-3 flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
                if (e.key === "Escape") setAdding(false);
              }}
              maxLength={30}
              placeholder="e.g. Gardener"
              aria-label="New station's name"
              className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={add}
              disabled={!draft.trim() || busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-soft disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              setAdding(true);
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-card px-3 py-2 text-xs font-semibold text-primary shadow-soft hover:bg-primary/5"
          >
            <Plus className="h-3.5 w-3.5" /> New station
          </button>
        ))}
    </section>
  );
}

const iconBtn =
  "grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50";

function StationItem({
  station,
  canEdit,
  busy,
  onlyOne,
  onRename,
  onDelete,
}: {
  station: StationRow;
  canEdit: boolean;
  busy: boolean;
  onlyOne: boolean;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(station.name);
  const [confirming, setConfirming] = useState(false);
  const count = station.inUse;

  if (editing) {
    return (
      <li className="flex items-center gap-2 py-2.5">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          aria-label={`Rename ${station.name}`}
          className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          aria-label="Save name"
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
          aria-label="Cancel"
          onClick={() => {
            setName(station.name);
            setEditing(false);
          }}
          className={iconBtn}
        >
          <X className="h-4 w-4" />
        </button>
      </li>
    );
  }

  // Why it can't go, said rather than a dead button.
  const blocked =
    count > 0
      ? `${count} ${count === 1 ? "person is" : "people are"} on it. Give them another station first.`
      : onlyOne
        ? "A household needs at least one station."
        : null;

  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stationTone(station.name)}`}
      >
        {station.name}
      </span>
      <span className="min-w-0 flex-1 text-xs text-muted-foreground tabular-nums">
        {count} {count === 1 ? "person" : "people"}
      </span>
      {canEdit &&
        (confirming ? (
          <span className="flex basis-full items-center justify-end gap-2 sm:basis-auto">
            {blocked ? (
              <>
                <span className="text-xs text-muted-foreground">{blocked}</span>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-xs font-semibold text-primary"
                >
                  OK
                </button>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">Remove {station.name}?</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onDelete}
                  className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground disabled:opacity-50"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Keep
                </button>
              </>
            )}
          </span>
        ) : (
          <>
            <button
              type="button"
              aria-label={`Rename ${station.name}`}
              disabled={busy}
              onClick={() => setEditing(true)}
              className={iconBtn}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Remove ${station.name}`}
              disabled={busy}
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
