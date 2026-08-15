import { AlertCircle, Loader2, Moon, Sparkles, X } from "lucide-react";

/**
 * Confirms what "Start new day" is about to do before it does it
 * (KNOWN_GAPS.md C30) -- it used to fire immediately on click with no
 * preview. `preview` is `null` while its live counts are still loading.
 */
export function StartNewDayModal({
  preview,
  loading,
  onConfirm,
  onCancel,
}: {
  preview: { pendingUtos: number; routinesRespawning: number } | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-xl text-foreground">Start a new day?</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              This closes today's board and opens a fresh one for tomorrow.
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2.5">
          <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-secondary/40 px-3.5 py-3 text-xs text-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              {preview === null
                ? "Checking what's pending…"
                : `${preview.pendingUtos} pending Quick Utos will be cleared — this can't be undone.`}
            </span>
          </div>
          <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-secondary/40 px-3.5 py-3 text-xs text-foreground">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              {preview === null
                ? "Checking what's pending…"
                : `${preview.routinesRespawning} routine${preview.routinesRespawning === 1 ? "" : "s"} will respawn onto tomorrow's board.`}
            </span>
          </div>
          <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-secondary/40 px-3.5 py-3 text-xs text-foreground">
            <Moon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>The board will reopen for the new day.</span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-full px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || preview === null}
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting...
              </>
            ) : (
              "Start new day"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
