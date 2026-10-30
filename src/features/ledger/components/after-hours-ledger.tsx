import { useMemo, useState } from "react";

import { useMounted } from "@/hooks/use-mounted";
import { formatTimeOfDay } from "@/lib/time";

import type { LedgerEntry, LedgerResolution } from "../ledger.types";
import { fmtHoursMinutes, ledgerEntryMinutes, reasonLabel } from "../ledger.utils";
import { useT } from "@/lib/i18n/locale-context";

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
  const t = useT();
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
        className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft"
        suppressHydrationWarning
      >
        <div className="text-xs font-semibold text-muted-foreground">{heading}</div>
        <div className="mt-1 font-display text-2xl text-foreground">—</div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft">
      {/* Stacks on a phone: side by side, the toggle squeezed the explanation
          into a one-word-per-line column. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted-foreground">{heading}</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-display text-2xl text-foreground">
              {fmtHoursMinutes(restMin)}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("ledger.timeOffInLieu")}
              {premiumMin > 0 &&
                t("ledger.atRestDayPremium", { time: fmtHoursMinutes(premiumMin) })}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("ledger.theSameNumbersShowOn")}</p>
        </div>
        {audience === "manager" && onSetDefault && (
          <div className="shrink-0 sm:text-right">
            <div className="text-xs font-semibold text-muted-foreground">
              {helperName
                ? t("ledger.helpersDefault", { name: helperName })
                : t("ledger.defaultLabel")}
            </div>
            <div className="mt-1 inline-flex rounded-xl border border-border bg-background p-0.5">
              {/* eslint-disable-next-line i18next/no-literal-string -- values, not words */}
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
                  className={`min-h-11 rounded-lg px-3 text-xs font-semibold transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 motion-reduce:transition-none ${
                    ledgerDefault === k
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k === "rest" ? t("ledger.bankedRest") : t("ledger.restDayPremium")}
                </button>
              ))}
            </div>
            {/* Which of the two states this is matters. Unset means nobody has
                chosen -- it is NOT derived from live-in/live-out, deliberately
                (supabase/fix-resolution-default-to-rest.sql): while rest-day
                premium is not paid in cash both tags are taken as time off, so
                a helper should only carry the premium tag because a manager
                decided it. Tapping the selected option clears it back to here. */}
            <p className="mt-1 text-xs text-muted-foreground">
              {isExplicitDefault ? t("ledger.setForHelper") : t("ledger.notSetDefaults")}
            </p>
          </div>
        )}
      </div>

      {monthEntries.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {t("ledger.noAfterHoursYet")}{" "}
          {audience === "helper" ? t("ledger.restWell") : t("ledger.nothingToReconcile")}
        </p>
      ) : (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-soft transition hover:border-primary/40"
          >
            {open
              ? t("ledger.hideEntries")
              : t("ledger.showEntries", { count: monthEntries.length })}
          </button>
          {open && (
            <ul className="mt-3 divide-y divide-border/70">
              {monthEntries.map((e) => {
                const meta = reasonLabel(e.reason);
                const mins = ledgerEntryMinutes(e);
                return (
                  <li key={e.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {e.title}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>
                            {formatTimeOfDay(e.startTs)} → {formatTimeOfDay(e.doneTs)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold ${meta.cls}`}
                          >
                            {meta.label}
                          </span>
                          {e.kind === "utos" && (
                            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs font-semibold text-pine-deep">
                              {t("ledger.utos")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-display text-base text-foreground tabular-nums">
                          {fmtHoursMinutes(mins)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {e.resolution === "premium"
                            ? t("ledger.restDayPremiumLower")
                            : t("ledger.bankedRestLower")}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        {t("ledger.adjust")}
                        <input
                          type="number"
                          value={e.adjustMinutes}
                          onChange={(ev) =>
                            onUpdateEntry(e.id, { adjustMinutes: Number(ev.target.value) || 0 })
                          }
                          className="w-16 rounded-lg border border-border bg-card px-2 py-1 text-right text-xs font-semibold text-foreground focus:border-primary/50 focus:outline-none"
                        />
                        <span>{t("ledger.min")}</span>
                      </label>
                      <div className="inline-flex rounded-xl border border-border bg-card p-0.5">
                        {/* eslint-disable-next-line i18next/no-literal-string -- values, not words */}
                        {(["rest", "premium"] as const).map((k) => (
                          <button
                            key={k}
                            onClick={() => onUpdateEntry(e.id, { resolution: k })}
                            aria-pressed={e.resolution === k}
                            className={`rounded-lg px-2.5 py-0.5 text-xs font-semibold ${
                              e.resolution === k
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {k === "rest" ? t("ledger.bankedRest") : t("ledger.restDayPremium")}
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

      <p className="mt-3 text-xs text-muted-foreground">{t("ledger.workOffShiftStillCounts")}</p>
    </section>
  );
}
