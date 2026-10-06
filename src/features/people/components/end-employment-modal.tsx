import { AlertCircle, Info, Loader2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";
import { HelperPicker } from "@/features/teams/components/helper-picker";
import { fmtPeso } from "@/features/groceries/grocery.utils";
import { fmtHoursMinutes } from "@/features/ledger/ledger.utils";
import {
  netPayForCutoff,
  payComponentsForCutoff,
  thirteenthMonthEstimate,
  workedShareOfCutoff,
} from "@/features/pay/net-pay";
import { formatCutoffRange } from "@/features/pay/pay.utils";
import { householdNow, toISODate } from "@/lib/time";

import { employmentEndPreviewFn, type EmploymentEndPreview } from "../people.actions";
import type { Helper } from "../people.types";

const daysInclusive = (start: string, end: string) =>
  Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;

const longDay = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function problemText(p: EmploymentEndPreview): string | null {
  switch (p.problem) {
    case "future":
      return "Pick today or an earlier day. An employment can't be ended ahead of time.";
    case "before_start":
      return `That's before their first day (${longDay(p.startedOn)}).`;
    case "already_paid_past":
      return `Pay has already gone out through ${longDay(p.latestPaidCutoffEnd ?? p.today)}. Pick that day or later.`;
    case "not_active":
      return "They aren't employed here any more.";
    default:
      return null;
  }
}

/**
 * Ending an employment (KNOWN_GAPS.md O4). Everything it will do is shown
 * before the button is pressed, from employment_end_preview: the final pay for
 * the days worked in her last cutoff, and the things Linara can't settle for
 * the household (an unpaid earlier cutoff, 13th-month pay, rest owed), so
 * none of them is discovered after she has gone.
 */
export function EndEmploymentModal({
  helper,
  otherHelpers,
  token,
  initialLastDay,
  onClose,
  onConfirm,
}: {
  helper: Helper;
  /** The last day she gave notice for, if she did. */
  initialLastDay?: string;
  /** Active helpers her open tasks could move to. */
  otherHelpers: Helper[];
  token: string;
  onClose: () => void;
  onConfirm: (lastDay: string, reassignTo: string | null) => Promise<void>;
}) {
  const [lastDay, setLastDay] = useState(() => initialLastDay ?? toISODate(householdNow()));
  const [reassignTo, setReassignTo] = useState<string>(otherHelpers[0]?.id ?? "");
  const [preview, setPreview] = useState<EmploymentEndPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    employmentEndPreviewFn({ data: { token, helperId: helper.id, lastDay } })
      .then((p) => {
        if (cancelled) return;
        // The device can be a day ahead of the household; its "today" wins.
        if (p.problem === "future" && lastDay === toISODate(householdNow())) {
          setLastDay(p.today);
          return;
        }
        setPreview(p);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load this.");
      });
    return () => {
      cancelled = true;
    };
  }, [token, helper.id, lastDay]);

  const current = preview && preview.finalCutoffEnd === lastDay ? preview : null;
  const blocked = current ? problemText(current) : null;

  const share = current
    ? workedShareOfCutoff(
        current.finalCutoffStart,
        current.finalCutoffEnd,
        current.fullCutoffStart,
        current.fullCutoffEnd,
      )
    : 1;
  const components = payComponentsForCutoff(helper.monthlyRate, helper.paydayInterval, share);
  const finalNet = current
    ? netPayForCutoff(
        helper.monthlyRate,
        helper.paydayInterval,
        current.unsettledValeTotal,
        share,
        current.unpaidLeaveDeduction,
      )
    : 0;
  const daysWorked = current ? daysInclusive(current.finalCutoffStart, current.finalCutoffEnd) : 0;
  const thirteenth = current
    ? thirteenthMonthEstimate(
        current.basePaidThisYear +
          (current.finalCutoffPaid ? 0 : components.basePay - current.unpaidLeaveDeduction),
      )
    : 0;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(lastDay, current && current.openTasks > 0 && reassignTo ? reassignTo : null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't end the employment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl text-foreground">End {helper.short}'s employment</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {helper.short}&apos;s record stays. Payslips, finished tasks and time off remain here,
            and they keep their own copy in the Linara app. They can join another household later
            with a new invite code.
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <Field label="Last working day">
          <input
            type="date"
            value={lastDay}
            max={preview?.today}
            onChange={(e) => e.target.value && setLastDay(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>

        {loadError && (
          <p className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {loadError}
          </p>
        )}

        {!current && !loadError && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking pay and tasks…
          </p>
        )}

        {current && blocked && (
          <p className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {blocked}
          </p>
        )}

        {current && !blocked && (
          <>
            {current.openTasks > 0 && (
              <Field label={`Open tasks (${current.openTasks})`}>
                <HelperPicker
                  helpers={otherHelpers}
                  value={reassignTo}
                  onChange={setReassignTo}
                  ariaLabel="Open tasks"
                  after={[{ value: "", label: "Remove them from the board" }]}
                  describe={(h) => `Move them to ${h.name} (${h.station})`}
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Finished tasks stay on the record either way.
                </span>
              </Field>
            )}

            <div className="rounded-2xl bg-secondary/60 p-3.5">
              <h4 className="text-sm font-semibold text-foreground">Final pay</h4>
              {current.finalCutoffPaid ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Already paid for{" "}
                  {formatCutoffRange(current.finalCutoffStart, current.finalCutoffEnd)}. Nothing
                  more to send through Linara.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-foreground">
                    <span className="font-semibold tabular-nums">{fmtPeso(finalNet)}</span> for{" "}
                    {formatCutoffRange(current.finalCutoffStart, current.finalCutoffEnd)}
                    {share < 1 ? ` (${daysWorked} days worked of the cutoff)` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Basic {fmtPeso(components.basePay)} − contributions{" "}
                    {fmtPeso(components.statutoryEmployeeShare)}
                    {current.unsettledValeTotal > 0
                      ? ` − vale ${fmtPeso(current.unsettledValeTotal)}`
                      : ""}
                    {current.unpaidLeaveDeduction > 0
                      ? ` − unpaid leave ${fmtPeso(current.unpaidLeaveDeduction)} (${current.unpaidLeaveDays} ${current.unpaidLeaveDays === 1 ? "day" : "days"})`
                      : ""}
                    . You'll pay it from Past staff on this page, by GCash or Maya.
                  </p>
                </>
              )}
            </div>

            <ul className="space-y-2 text-xs text-foreground">
              {current.unpaidPeriods > 0 && (
                <Note tone="warn">
                  {current.unpaidPeriods === 1
                    ? "One earlier pay period has"
                    : `${current.unpaidPeriods} earlier pay periods have`}{" "}
                  no payment on record. You can still pay{" "}
                  {current.unpaidPeriods === 1 ? "it" : "them"} from Past staff, or record how you
                  paid outside Linara.
                </Note>
              )}
              {thirteenth > 0 && (
                <Note tone="warn">
                  13th-month pay: about <strong>{fmtPeso(thirteenth)}</strong>, a twelfth of the
                  basic pay on record for them this year. It becomes payable from Past staff once
                  the employment ends.
                </Note>
              )}
              {current.restOwedMinutes > 0 && (
                <Note tone="warn">
                  {helper.short} has <strong>{fmtHoursMinutes(current.restOwedMinutes)}</strong> of
                  rest owed. It can't be taken as time off any more, and Linara doesn't turn rest
                  into pay, so agree with {helper.short} how to settle it.
                </Note>
              )}
              {current.pendingVales > 0 && (
                <Note>
                  {current.pendingVales} pending vale request
                  {current.pendingVales === 1 ? "" : "s"} will be declined.
                </Note>
              )}
              {current.pendingRestOff + current.futureRestOff > 0 && (
                <Note>
                  {current.pendingRestOff + current.futureRestOff} rest-off request
                  {current.pendingRestOff + current.futureRestOff === 1 ? "" : "s"} after the last
                  day will be closed.
                </Note>
              )}
              <Note>
                {helper.short}&apos;s app loses the board, pantry and utos for this household. They
                keep read access to their own record here: terms, payslips and time off.
              </Note>
            </ul>
          </>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          disabled={submitting}
          className="rounded-lg px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting || !current || Boolean(blocked)}
          className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground shadow-soft transition hover:bg-destructive/90 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ending…
            </>
          ) : (
            "End employment"
          )}
        </button>
      </div>
    </Modal>
  );
}

function Note({ children, tone }: { children: ReactNode; tone?: "warn" }) {
  return (
    <li className="flex items-start gap-2">
      {tone === "warn" ? (
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-terracotta-ink" aria-hidden />
      ) : (
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span>{children}</span>
    </li>
  );
}
