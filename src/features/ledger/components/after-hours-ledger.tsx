import { useMemo, useState } from "react";

import { useMounted } from "@/hooks/use-mounted";
import { formatTimeOfDay } from "@/lib/time";

import type { LedgerEntry, LedgerResolution } from "../ledger.types";
import { fmtHoursMinutes, ledgerEntryMinutes, reasonLabel } from "../ledger.utils";

export function AfterHoursLedger({
  entries,
  ledgerDefault,
  isExplicitDefault = false,
  onSetDefault,
  onUpdateEntry,
  audience,
  helperName,
}: {
  entries: LedgerEntry[];
  /**
   * The SELECTED helper's effective default (Session E / E2) -- not a house
   * setting. Comes from helper_profiles.effective_resolution, which Postgres
   * derives from the explicit default or, failing that, employment.
   */
  ledgerDefault: LedgerResolution;
  /** True when a manager set it explicitly, false when it is following
   *  employment. Both are legitimate states and the UI says which. */
  isExplicitDefault?: boolean;
  /** `null` clears the override, returning the helper to their employment type. */
  onSetDefault?: (r: LedgerResolution | null) => void | Promise<unknown>;
  onUpdateEntry: (
    id: string,
    patch: Partial<Pick<LedgerEntry, "adjustMinutes" | "resolution">>,
  ) => void;
  audience: "manager" | "helper";
  helperName?: string;
}) {
  const mounted = useMounted();
  const [open, setOpen] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);

  // Filter to current month (based on doneTs).
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEntries = useMemo(
    () => entries.filter((e) => e.doneTs >= monthStart).sort((a, b) => b.doneTs - a.doneTs),
    [entries, monthStart],
  );

  const totalMin = monthEntries.reduce((s, e) => s + ledgerEntryMinutes(e), 0);
  const premiumMin = monthEntries
    .filter((e) => e.resolution === "premium")
    .reduce((s, e) => s + ledgerEntryMinutes(e), 0);
  const restMin = totalMin - premiumMin;

  const heading =
    audience === "manager"
      ? `Rest owed this month${helperName ? ` · ${helperName}` : ""}`
      : "Rest owed this month · yours";

  if (!mounted) {
    return (
      <section
        className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft"
        suppressHydrationWarning
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {heading}
        </div>
        <div className="mt-1 font-display text-2xl text-foreground">—</div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {heading}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-display text-2xl text-foreground">
              {fmtHoursMinutes(restMin)}
            </span>
            <span className="text-sm text-muted-foreground">
              time off in lieu
              {premiumMin > 0 && <> · {fmtHoursMinutes(premiumMin)} at rest-day premium</>}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Same numbers on both sides. On-shift work never lands here — every off-shift completion
            does.
          </p>
        </div>
        {audience === "manager" && onSetDefault && (
          <div className="shrink-0 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {helperName ? `${helperName}'s default` : "Default"}
            </div>
            <div className="mt-1 inline-flex rounded-full border border-border bg-background p-0.5">
              {(["rest", "premium"] as const).map((k) => (
                <button
                  key={k}
                  onClick={async () => {
                    // Tapping the selected option clears the override rather
                    // than being a no-op -- that is the only way back to
                    // "follow employment" without a third button.
                    setSavingDefault(true);
                    try {
                      await onSetDefault(ledgerDefault === k && isExplicitDefault ? null : k);
                    } finally {
                      setSavingDefault(false);
                    }
                  }}
                  aria-pressed={ledgerDefault === k}
                  disabled={savingDefault}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold disabled:opacity-60 ${
                    ledgerDefault === k
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k === "rest" ? "Banked rest" : "Rest-day premium"}
                </button>
              ))}
            </div>
            {/* Which of the two states this is matters. Unset means nobody has
                chosen -- it is NOT derived from live-in/live-out, deliberately
                (supabase/fix-resolution-default-to-rest.sql): while rest-day
                premium is not paid in cash both tags are taken as time off, so
                a helper should only carry the premium tag because a manager
                decided it. Tapping the selected option clears it back to here. */}
            <p className="mt-1 text-[10px] text-muted-foreground">
              {isExplicitDefault
                ? "Set for this helper · tap again to clear"
                : "Not set · defaults to banked rest"}
            </p>
          </div>
        )}
      </div>

      {monthEntries.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          No after-hours yet this month.{" "}
          {audience === "helper" ? "Rest well." : "Nothing to reconcile."}
        </p>
      ) : (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-foreground shadow-soft transition hover:border-primary/40"
          >
            {open
              ? "Hide entries"
              : `Show ${monthEntries.length} ${monthEntries.length === 1 ? "entry" : "entries"}`}
          </button>
          {open && (
            <ul className="mt-3 space-y-2">
              {monthEntries.map((e) => {
                const meta = reasonLabel(e.reason);
                const mins = ledgerEntryMinutes(e);
                return (
                  <li key={e.id} className="rounded-2xl border border-border/70 bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {e.title}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>
                            {formatTimeOfDay(e.startTs)} → {formatTimeOfDay(e.doneTs)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}
                          >
                            {meta.label}
                          </span>
                          {e.kind === "utos" && (
                            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-pine-deep">
                              utos
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-display text-base text-foreground tabular-nums">
                          {fmtHoursMinutes(mins)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {e.resolution === "premium" ? "rest-day premium" : "banked rest"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        Adjust
                        <input
                          type="number"
                          value={e.adjustMinutes}
                          onChange={(ev) =>
                            onUpdateEntry(e.id, { adjustMinutes: Number(ev.target.value) || 0 })
                          }
                          className="w-16 rounded-lg border border-border bg-card px-2 py-1 text-right text-[11px] font-semibold text-foreground focus:border-primary/50 focus:outline-none"
                        />
                        <span>min</span>
                      </label>
                      <div className="inline-flex rounded-full border border-border bg-card p-0.5">
                        {(["rest", "premium"] as const).map((k) => (
                          <button
                            key={k}
                            onClick={() => onUpdateEntry(e.id, { resolution: k })}
                            aria-pressed={e.resolution === k}
                            className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
                              e.resolution === k
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {k === "rest" ? "Banked rest" : "Rest-day premium"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <p className="mt-3 text-[10.5px] italic text-muted-foreground">
        Being Available doesn't waive rest — voluntarily reachable still counts.
      </p>
      <p className="mt-1 text-[10.5px] text-muted-foreground">
        Rest-day premium rates follow local law (placeholder, configurable).
      </p>
    </section>
  );
}
