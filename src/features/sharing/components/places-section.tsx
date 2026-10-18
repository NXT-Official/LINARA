import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAppStores } from "@/features/dashboard/app-store-context";

/**
 * Where trips go, besides the family's houses: School, Office, Lola's. A
 * task's trip picks from these and the houses. Removing one keeps the trips
 * that went there, without that end.
 */
export function PlacesSection({ canEdit }: { canEdit: boolean }) {
  const { sharing, session } = useAppStores();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!sharing.available) return null;

  const houses = sharing.family.filter((h) => h.id !== session.householdId);

  const add = async () => {
    if (!draft?.trim()) return;
    setBusy(true);
    try {
      await sharing.createPlace(draft);
      setDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add the place.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-3xl bg-card p-5 shadow-soft ring-1 ring-border/20 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-foreground">Places</h2>
          <p className="text-xs text-muted-foreground">
            Where a trip can start or end: your houses, and the places you save here.
          </p>
        </div>
        <MapPin className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>

      {houses.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          Your other houses:{" "}
          <span className="font-semibold text-foreground">
            {houses.map((h) => h.name).join(", ")}
          </span>
        </p>
      )}

      {sharing.places.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">No saved places yet.</p>
      ) : (
        <ul className="mb-3 divide-y divide-border/70">
          {sharing.places.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                {p.name}
              </span>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() =>
                    sharing
                      .deletePlace(p.id)
                      .catch((err) =>
                        toast.error(err instanceof Error ? err.message : "Couldn't remove it."),
                      )
                  }
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit &&
        (draft === null ? (
          <button
            type="button"
            onClick={() => setDraft("")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-card px-3 py-2 text-xs font-semibold text-primary shadow-soft hover:bg-primary/5"
          >
            <Plus className="h-3.5 w-3.5" /> New place
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
                if (e.key === "Escape") setDraft(null);
              }}
              maxLength={40}
              placeholder="e.g. School, Office, Lola's"
              aria-label="New place's name"
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
              onClick={() => setDraft(null)}
              className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ))}
    </section>
  );
}
