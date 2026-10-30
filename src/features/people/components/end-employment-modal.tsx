import { AlertCircle, Info, Loader2, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

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
import { PAY_HR_ENABLED } from "@/lib/pay-hr";
import { householdNow, toISODate } from "@/lib/time";

import { employmentEndPreviewFn, type EmploymentEndPreview } from "../people.actions";
import type { Helper } from "../people.types";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

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
      // Paid ahead: no day is valid yet, since a last day can't be in the future.
      return p.latestPaidCutoffEnd && p.latestPaidCutoffEnd > p.today
        ? `Pay has already gone out through ${longDay(p.latestPaidCutoffEnd)}, so the last working day can't be earlier. You can end the employment from that day.`
        : `Pay has already gone out through ${longDay(p.latestPaidCutoffEnd ?? p.today)}. Pick that day or later.`;
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
  const t = useT();
  const [lastDay, setLastDay] = useState(() => initialLastDay ?? toISODate(householdNow()));
  // Until a day is picked, the form may move its default to the first valid one.
  const dayPicked = useRef(Boolean(initialLastDay));
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
        // Today's default would end it inside a cutoff already paid: open on
        // the paid-through day instead, when that day has come.
        if (
          !dayPicked.current &&
          p.problem === "already_paid_past" &&
          p.latestPaidCutoffEnd &&
          p.latestPaidCutoffEnd <= p.today &&
          p.latestPaidCutoffEnd !== lastDay
        ) {
          setLastDay(p.latestPaidCutoffEnd);
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
  // The final cutoff's own wage, which a raise set for later doesn't change.
  const rate = current?.monthlyRate ?? helper.monthlyRate;
  const components = payComponentsForCutoff(rate, helper.paydayInterval, share);
  const finalNet = current
    ? netPayForCutoff(
        rate,
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
          <h3 className="font-display text-xl text-foreground">
            {t("people.endEmploymentTitle", { name: helper.short })}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("people.recordStays", { name: helper.short })}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label={t("people.close")}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <Field label={t("people.lastWorkingDay")}>
          <input
            type="date"
            value={lastDay}
            max={preview?.today}
            onChange={(e) => {
              if (!e.target.value) return;
              dayPicked.current = true;
              setLastDay(e.target.value);
            }}
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
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("people.checkingPayAndTasks")}
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
                  {t("people.finishedTasksStayOnThe")}
                </span>
              </Field>
            )}

            {PAY_HR_ENABLED && (
              <div className="rounded-2xl bg-secondary/60 p-3.5">
                <h4 className="text-sm font-semibold text-foreground">{t("people.finalPay")}</h4>
                {current.finalCutoffPaid ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("people.alreadyPaidFor", {
                      range: formatCutoffRange(current.finalCutoffStart, current.finalCutoffEnd),
                    })}
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-foreground">
                      {richText(
                        t("people.finalForRange", {
                          range: formatCutoffRange(
                            current.finalCutoffStart,
                            current.finalCutoffEnd,
                          ),
                        }),
                        {
                          amount: (
                            <span className="font-semibold tabular-nums">{fmtPeso(finalNet)}</span>
                          ),
                        },
                      )}
                      {share < 1 ? t("people.daysWorkedOfCutoff", { days: daysWorked }) : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("people.finalBreakdown", {
                        basic: fmtPeso(components.basePay),
                        contributions: fmtPeso(components.statutoryEmployeeShare),
                        vale:
                          current.unsettledValeTotal > 0
                            ? t("people.breakdownVale", {
                                amount: fmtPeso(current.unsettledValeTotal),
                              })
                            : "",
                        leave:
                          current.unpaidLeaveDeduction > 0
                            ? t("people.breakdownLeave", {
                                amount: fmtPeso(current.unpaidLeaveDeduction),
                                count: current.unpaidLeaveDays,
                              })
                            : "",
                      })}
                    </p>
                  </>
                )}
              </div>
            )}

            <ul className="space-y-2 text-xs text-foreground">
              {PAY_HR_ENABLED && current.unpaidPeriods > 0 && (
                <Note tone="warn">
                  {t("people.earlierUnpaid", { count: current.unpaidPeriods })}
                </Note>
              )}
              {PAY_HR_ENABLED && thirteenth > 0 && (
                <Note tone="warn">
                  {richText(t("people.thirteenthAbout"), {
                    amount: <strong>{fmtPeso(thirteenth)}</strong>,
                  })}
                </Note>
              )}
              {current.restOwedMinutes > 0 && (
                <Note tone="warn">
                  {richText(t("people.restOwedSettle", { name: helper.short }), {
                    time: <strong>{fmtHoursMinutes(current.restOwedMinutes)}</strong>,
                  })}
                </Note>
              )}
              {current.pendingVales > 0 && (
                <Note>{t("people.pendingValesDeclined", { count: current.pendingVales })}</Note>
              )}
              {current.pendingRestOff + current.futureRestOff > 0 && (
                <Note>
                  {t("people.restOffClosed", {
                    count: current.pendingRestOff + current.futureRestOff,
                  })}
                </Note>
              )}
              <Note>{t("people.appLosesBoard", { name: helper.short })}</Note>
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
          {t("people.cancel")}
        </button>
        <button
          onClick={submit}
          disabled={submitting || !current || Boolean(blocked)}
          className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground shadow-soft transition hover:bg-destructive/90 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("people.ending")}
            </>
          ) : (
            t("people.endEmployment")
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
