import { Mic, Send, Zap } from "lucide-react";
import { useMemo, useState } from "react";

import type { Helper } from "@/features/people/people.types";

import { QUICK_UTOS_PRESETS } from "../utos.constants";

export function QuickUtosLauncher({
  onSend,
  helperName,
  activeHelpers,
  selectedHelperId,
  onSelectHelper,
}: {
  onSend: (content: string) => void;
  helperName: string;
  /** More than one active helper -> show a recipient picker instead of the
   * plain "Send a small ask to {name}" heading (see MULTI_HELPER_HANDLING.md). */
  activeHelpers: Helper[];
  selectedHelperId: string | null;
  onSelectHelper: (helperId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [holding, setHolding] = useState(false);

  // Sorted by name for the picker only -- not reordering the shared
  // activeHelpers array, so lane order elsewhere (Pass board, task/routine/
  // appointment dropdowns) is unaffected. Alphabetical, not live-availability,
  // so options don't reshuffle under the manager while the dropdown is open.
  const sortedHelpers = useMemo(
    () => [...activeHelpers].sort((a, b) => a.name.localeCompare(b.name)),
    [activeHelpers],
  );

  const sendCustom = () => {
    const v = draft.trim();
    if (!v) return;
    onSend(v);
    setDraft("");
  };

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6">
      <div>
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-accent" /> Quick utos
        </div>
        {activeHelpers.length > 1 ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-display text-lg text-foreground">Send a small ask to</span>
            <select
              value={selectedHelperId ?? ""}
              onChange={(e) => onSelectHelper(e.target.value)}
              className="rounded-full border border-border bg-background px-3 py-1 text-sm font-semibold text-foreground outline-none focus:border-primary"
            >
              {sortedHelpers.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} · {h.station}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mt-1 font-display text-lg text-foreground">
            Send a small ask to {helperName}
          </div>
        )}
      </div>

      {/* Preset chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK_UTOS_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => onSend(preset)}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-soft transition hover:border-primary/40 hover:bg-secondary"
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Custom one-liner */}
      <div className="mt-4 flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 shadow-soft focus-within:border-primary/50">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendCustom();
          }}
          placeholder="Type a quick utos…"
          className="flex-1 bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          onClick={sendCustom}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Send
        </button>
      </div>

      {/* Voice utos */}
      <div className="mt-3">
        <button
          onMouseDown={() => setHolding(true)}
          onTouchStart={() => setHolding(true)}
          onMouseUp={() => {
            if (holding) {
              onSend("🎙️ Voice utos · 0:04");
              setHolding(false);
            }
          }}
          onMouseLeave={() => {
            if (holding) {
              onSend("🎙️ Voice utos · 0:04");
              setHolding(false);
            }
          }}
          onTouchEnd={() => {
            if (holding) {
              onSend("🎙️ Voice utos · 0:04");
              setHolding(false);
            }
          }}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-soft transition ${
            holding
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border bg-background text-foreground hover:border-accent/50"
          }`}
        >
          <Mic className="h-4 w-4" />{" "}
          {holding ? "Recording… release to send" : "Hold to record a voice utos"}
        </button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Need it tracked, timed, or done a certain way? Use New task instead.
      </p>
    </section>
  );
}
