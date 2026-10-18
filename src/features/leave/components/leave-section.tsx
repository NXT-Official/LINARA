import { CalendarOff, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/shared/avatar";
import { fmtHoursMinutes } from "@/features/ledger/ledger.utils";
import type { Helper } from "@/features/people/people.types";
import type { RecordLeaveInput } from "@/features/shifts/hooks/use-time-off";
import { parseISODate } from "@/lib/time";

import { getLeaveBalancesFn, getLeavePolicyFn, setLeavePolicyFn } from "../leave.actions";
import {
  LEAVE_KIND_LABEL,
  LEAVE_REASON_LABEL,
  LEAVE_STATUS_LABEL,
  PAY_DAYS_OPTIONS,
  silHint,
} from "../leave.constants";
import type { LeaveBalance, LeavePolicy, LeaveRequest } from "../leave.types";
import { LeaveRules } from "./leave-rules";
import { RecordLeaveModal } from "./record-leave-modal";

const SHOWN = 5;

const shortDate = (iso: string) =>
  parseISODate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dates = (l: LeaveRequest) =>
  l.startDate === l.endDate
    ? shortDate(l.startDate)
    : `${shortDate(l.startDate)} – ${shortDate(l.endDate)}`;
const longDate = (iso: string) =>
  parseISODate(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/** Why SIL can't be recorded for her now, or null when it can (or isn't known yet). */
const silUnavailable = (b: LeaveBalance | undefined): string | null =>
  !b || b.silDays > 0
    ? null
    : b.silYearEnd
      ? "has none left this service year"
      : b.silEligibleFrom
        ? `starts ${longDate(b.silEligibleFrom)}`
        : "starts after a year of service";

/**
 * Leave on People: per helper, what she has left (service incentive leave
 * this service year, rest owed for days off in kind), her recent leave with
 * anything she disputed, the unpaid-leave divisor, and Record leave for when
 * she calls in sick. Asking for leave happens in her app; deciding it, on the
 * Pass under Needs you.
 */
export function LeaveSection({
  helpers,
  leave,
  token,
  todayIso,
  canManage,
  payDaysFor,
  onSetPayDays,
  onRecord,
  onCancel,
}: {
  /** Current helpers. */
  helpers: Helper[];
  leave: LeaveRequest[];
  token: string | null;
  todayIso: string;
  /** Primary and co-managers; remote admins only look. */
  canManage: boolean;
  payDaysFor: (helperId: string) => number;
  onSetPayDays: (helperId: string, days: 365 | 313 | 261) => void;
  onRecord: (input: RecordLeaveInput) => Promise<boolean>;
  onCancel: (id: string) => void;
}) {
  const [balances, setBalances] = useState<Record<string, LeaveBalance>>({});
  const [recordingFor, setRecordingFor] = useState<Helper | null>(null);
  // null until loaded, and stays null before add-leave-policy.sql is applied.
  const [policy, setPolicy] = useState<LeavePolicy | null>(null);
  const helperKey = helpers.map((h) => h.id).join(",");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getLeavePolicyFn({ data: { token } })
      .then((p) => !cancelled && setPolicy(p))
      .catch((err) => console.error("[LeaveSection] Failed to load leave rules:", err));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const changePolicy = async (next: LeavePolicy) => {
    if (!token) return;
    setPolicy(await setLeavePolicyFn({ data: { token, policy: next } }));
  };

  // Refetched whenever the leave list changes: an approval or a cancel moves them.
  useEffect(() => {
    if (!token || !helperKey) return;
    let cancelled = false;
    getLeaveBalancesFn({ data: { token, helperIds: helperKey.split(",") } })
      .then((rows) => {
        if (!cancelled) setBalances(Object.fromEntries(rows.map((b) => [b.helperId, b])));
      })
      .catch((err) => console.error("[LeaveSection] Failed to load balances:", err));
    return () => {
      cancelled = true;
    };
  }, [token, helperKey, leave, policy]);

  if (helpers.length === 0) return null;

  return (
    <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-foreground">Leave</h2>
          <p className="text-xs text-muted-foreground">
            What each helper has left, and recent leave. They ask from their app; you decide on the
            Pass.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-pine-deep">
          <CalendarOff className="h-3 w-3" /> {leave.filter((l) => l.status === "pending").length}{" "}
          waiting
        </span>
      </div>

      {policy && <LeaveRules policy={policy} canChange={canManage} onChange={changePolicy} />}

      <div className="divide-y divide-border/70">
        {helpers.map((h) => {
          const b = balances[h.id];
          const hers = leave.filter((l) => l.helperId === h.id);
          return (
            <div key={h.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar initials={h.initials} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground">{h.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {!b
                      ? "Loading…"
                      : b.silYearEnd
                        ? `${b.silDays} of ${policy?.silDaysPerYear ?? 5} SIL days left until ${shortDate(b.silYearEnd)}`
                        : b.silEligibleFrom
                          ? `SIL starts ${longDate(b.silEligibleFrom)}`
                          : "SIL starts after a year of service"}
                    {b ? ` · ${fmtHoursMinutes(b.restOwedMinutes)} rest owed` : ""}
                  </div>
                </div>
                {canManage && (
                  <button
                    onClick={() => setRecordingFor(h)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Record leave
                  </button>
                )}
              </div>

              <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                Unpaid leave counts
                <select
                  value={payDaysFor(h.id)}
                  disabled={!canManage}
                  onChange={(e) => onSetPayDays(h.id, Number(e.target.value) as 365 | 313 | 261)}
                  className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary disabled:opacity-70"
                >
                  {PAY_DAYS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span>(a day is monthly pay × 12 ÷ {payDaysFor(h.id)})</span>
              </label>

              {hers.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {hers.slice(0, SHOWN).map((l) => {
                    const cancellable =
                      canManage &&
                      (l.status === "pending" ||
                        (l.status === "approved" && l.startDate > todayIso));
                    return (
                      <li
                        key={l.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl bg-secondary/40 px-3 py-2 text-xs"
                      >
                        <span className="min-w-0">
                          <span className="font-semibold text-foreground">
                            {LEAVE_KIND_LABEL[l.kind]}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            · {dates(l)} · {l.days} {l.days === 1 ? "day" : "days"} ·{" "}
                            {LEAVE_REASON_LABEL[l.reason]}
                          </span>
                          {l.helperAck === "disputed" && (
                            <span className="mt-0.5 block font-semibold text-terracotta-ink">
                              {h.short} disputes this
                              {l.helperAckNote ? `: "${l.helperAckNote}"` : "."}
                            </span>
                          )}
                          {l.helperAck === "pending" && (
                            <span className="mt-0.5 block text-muted-foreground">
                              Waiting for {h.short} to confirm.
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-muted-foreground">
                            {LEAVE_STATUS_LABEL[l.status]}
                          </span>
                          {cancellable && (
                            <button
                              onClick={() => onCancel(l.id)}
                              className="font-semibold text-primary hover:underline"
                            >
                              Cancel
                            </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {recordingFor && (
        <RecordLeaveModal
          helperName={recordingFor.short}
          helperId={recordingFor.id}
          token={token}
          defaultDate={todayIso}
          silUnavailable={silUnavailable(balances[recordingFor.id])}
          onClose={() => setRecordingFor(null)}
          onRecord={onRecord}
          silHintText={silHint(policy)}
        />
      )}
    </section>
  );
}
