import { Check, Info, Loader2, Lock, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/shared/modal";
import { inMobileApp } from "@/lib/mobile-app";

import { usePlanUsage } from "../hooks/use-plan-usage";
import {
  addonFor,
  addonsBlocked,
  cycleName,
  cyclesOf,
  dayText,
  formatCentavos,
  graceEndsAt,
  hasFeature,
  limitName,
  limitTitle,
  limitText,
  limitsFor,
  MAX_ADDON_QUANTITY,
  nextPeriod,
  overLimits,
  periodRunning,
  planById,
  planMove,
  priceText,
  quote,
} from "../plan.logic";
import { ADDONS, CATALOG, FEATURES } from "../plan.sample";
import { AddonsSection } from "../components/addons-section";
import { PaymentDone, PlanPaymentStep } from "../components/payment-step";
import {
  cancelPlan,
  cancelPlanLive,
  changeToFree,
  changeToFreeLive,
  getPlanState,
  isCurrentPlan,
  METHOD_LABEL,
  methodLabel,
  previewStatus,
  refreshPlan,
  resetPlan,
  resumePlan,
  resumePlanLive,
  startTrialLive,
  usePlan,
  type PaymentMethod,
  type PlanPayment,
  type SamplePayment,
} from "../plan.store";
import type { Cycle, LimitKey, MySubscription, SubStatus, Usage } from "../plan.types";
import type { MessageKey, Translate } from "@/lib/i18n/instance";
import { useIntlLocale, useListText, useT } from "@/lib/i18n/locale-context";

/** Dates in the reader’s language, on Manila time. */
function useFmtDate(): (iso: string) => string {
  const locale = useIntlLocale();
  return useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Manila",
    });
    return (iso: string) => fmt.format(new Date(iso));
  }, [locale]);
}

const card = "rounded-3xl bg-card p-5 shadow-soft sm:p-7";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-colors duration-150 ease-out hover:bg-pine-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:translate-y-0";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-card px-4 text-sm font-semibold text-primary transition-colors duration-150 ease-out hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:translate-y-0";

function statusLine(
  sub: MySubscription,
  t: Translate,
  fmtDate: (iso: string) => string,
): { tone: "calm" | "warn" | "late"; text: string } {
  const grace = graceEndsAt(sub);
  switch (sub.status) {
    case "trialing":
      return {
        tone: "calm",
        text: sub.periodEnd
          ? t("plan.trialUntil", { date: fmtDate(sub.periodEnd) })
          : t("plan.trialPlain"),
      };
    case "past_due":
      return {
        tone: "warn",
        text: t("plan.pastDueNote", { date: grace ? fmtDate(grace) : t("plan.graceEnd") }),
      };
    case "restricted":
      return {
        tone: "late",
        text: t("plan.restrictedNote"),
      };
    case "active":
      if (!sub.periodEnd) return { tone: "calm", text: t("plan.nothingToRenew") };
      return {
        tone: "calm",
        text: sub.cancelAtPeriodEnd
          ? t("plan.endsMoves", { date: fmtDate(sub.periodEnd) })
          : t("plan.renewsOnDate", { date: fmtDate(sub.periodEnd) }),
      };
  }
}

function UsageRow({
  k,
  used,
  limit,
  canAddOn,
}: {
  k: LimitKey;
  used: number;
  limit: number | null;
  /** Add-ons can be bought on this plan (not on Free). */
  canAddOn: boolean;
}) {
  const t = useT();
  const over = limit !== null && used > limit;
  const pct = limit === null || limit === 0 ? 0 : Math.min(100, (used / limit) * 100);
  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{limitTitle(k, t)}</span>
        <span
          className={`text-sm tabular-nums ${over ? "font-semibold text-status-late-ink" : "text-foreground"}`}
        >
          {limit === null ? t("plan.usageNoLimit", { used }) : t("plan.usageOf", { used, limit })}
        </span>
      </div>
      {limit !== null && limit > 0 ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
          <div
            className={`h-full origin-left rounded-full transition-transform duration-300 ease-out motion-reduce:transition-none ${over ? "bg-status-late" : "bg-primary"}`}
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>
      ) : null}
      {over ? (
        <p className="mt-1.5 text-xs text-status-late-ink">
          {t("plan.overBy", { count: used - limit })}{" "}
          {canAddOn ? t("plan.addMoreOrBigger") : t("plan.chooseBigger")}
        </p>
      ) : null}
    </li>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={t("plan.fewer", { label })}
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
        className="grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
      >
        <Minus className="size-4" />
      </button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={t("plan.more", { label })}
        disabled={value >= MAX_ADDON_QUANTITY}
        onClick={() => onChange(value + 1)}
        className="grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function ChangePlanModal({
  sub,
  usage,
  initialPlanId,
  onClose,
}: {
  sub: MySubscription;
  usage: Usage;
  /** Picked to start with (from a lock's "Upgrade to"). */
  initialPlanId?: string;
  onClose: () => void;
}) {
  const t = useT();
  const listText = useListText();
  const [planId, setPlanId] = useState(initialPlanId ?? sub.planId);
  const plan = planById(planId) ?? CATALOG[0];
  const cycles = cyclesOf(plan);
  const [cycleState, setCycle] = useState<Cycle>(sub.cycle);
  const cycle = cycles.includes(cycleState) ? cycleState : cycles[0];
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(sub.addons.map((a) => [a.addonId, a.quantity])),
  );
  const paid = (plan.prices[cycle] ?? 0) > 0 && cycle !== "one_time";
  const addons = paid ? ADDONS.map((a) => ({ addonId: a.id, quantity: qty[a.id] ?? 0 })) : [];
  const q = quote(planId, cycle, addons, t);
  // Up only while a paid period runs, at the price the database charges (planMove).
  const running = periodRunning(sub);
  const move = planMove(sub, planId, cycle, addons, Date.now(), t);
  const current = isCurrentPlan(planId, cycle, addons);
  const live = getPlanState().live;
  const { owner, trialAvailable } = usePlan();
  // A first plan can start as its free trial (billing_start_trial).
  const trialOffered =
    live &&
    owner &&
    trialAvailable &&
    planId !== "free" &&
    plan.trialDays > 0 &&
    q.ok &&
    q.amount > 0;
  const [startingTrial, setStartingTrial] = useState(false);
  // Late or in a trial, a payment's period isn't from today (billing_next_period).
  const owesOrTrial =
    sub.status === "past_due" || sub.status === "restricted" || sub.status === "trialing";
  const period = nextPeriod(sub, cycle);
  const lowerThanNow = (id: string) => {
    if (!running || id === sub.planId) return false;
    const p = planById(id);
    if (!p) return true;
    const cs = cyclesOf(p);
    const m = planMove(sub, id, cs.includes(sub.cycle) ? sub.cycle : cs[0], [], Date.now(), t);
    return !m.ok && !!m.lower;
  };
  const after = overLimits({ ...sub, planId, addons }, usage);
  // Paid add-ons left out of an upgrade go with it, unrefunded (as Remove does).
  const dropped = running
    ? ADDONS.flatMap((a) => {
        const had = sub.addons
          .filter((l) => l.addonId === a.id)
          .reduce((n, l) => n + l.quantity, 0);
        const keep = addons.find((l) => l.addonId === a.id)?.quantity ?? 0;
        const n = had - keep;
        if (n <= 0) return [];
        const name = a.name.toLowerCase();
        return [`${n} ${n === 1 ? name : name.replace("household", "households")}`];
      })
    : [];
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"choose" | "pay">("choose");
  // A payment going through can't be closed away: it would finish unseen.
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (!busy) onClose();
  };
  const [receipt, setReceipt] = useState<SamplePayment | null>(null);
  const needsPayment = move.ok && move.dueNow > 0;
  const fullPrice = q.ok ? priceText(q.amount, cycle, t) : "";
  const summary = current
    ? t("plan.yourPlanNow", { price: fullPrice })
    : !move.ok
      ? move.message
      : move.keepsPeriod && sub.periodEnd
        ? t("plan.nowRestThen", {
            amount: formatCentavos(move.dueNow),
            price: fullPrice,
            date: dayText(sub.periodEnd, t),
          })
        : move.prorated
          ? t("plan.nowYearLessThen", { amount: formatCentavos(move.dueNow), price: fullPrice })
          : owesOrTrial && needsPayment && period.end
            ? t("plan.priceForRange", {
                price: fullPrice,
                from: dayText(period.start, t),
                to: dayText(period.end, t),
              })
            : fullPrice;

  if (receipt) {
    return (
      <Modal onClose={onClose}>
        <PaymentDone payment={receipt} onDone={onClose} />
      </Modal>
    );
  }

  if (step === "pay") {
    return (
      <Modal onClose={close}>
        <h3 className="font-display text-xl text-foreground">
          {t("plan.payForPlan", { plan: plan.name })}
        </h3>
        <div className="mt-4">
          <PlanPaymentStep
            planId={planId}
            cycle={cycle}
            addons={addons}
            onBack={() => setStep("choose")}
            onPaid={setReceipt}
            onBusyChange={setBusy}
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl text-foreground">{t("plan.changePlan")}</h3>
        <button
          onClick={onClose}
          aria-label={t("plan.close")}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {running && sub.periodEnd
          ? t("plan.moveUpAnyTime", { date: dayText(sub.periodEnd, t) })
          : owesOrTrial
            ? ""
            : t("plan.startsOncePaid")}
        {live ? t("plan.payOnXendit") : t("plan.paymentsSample")}
      </p>

      <fieldset className="mt-4">
        <legend className="text-xs font-semibold text-muted-foreground">{t("plan.plan")}</legend>
        <div className="mt-1.5 divide-y divide-border rounded-2xl border border-border">
          {CATALOG.map((p) => {
            const chosen = p.id === planId;
            const lower = lowerThanNow(p.id);
            return (
              <label
                key={p.id}
                className={`flex min-h-14 items-start gap-3 px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl ${lower ? "cursor-not-allowed opacity-60" : chosen ? "cursor-pointer bg-secondary/70" : "cursor-pointer hover:bg-secondary/40"}`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={p.id}
                  checked={chosen}
                  disabled={lower}
                  onChange={() => {
                    setPlanId(p.id);
                    setError(null);
                  }}
                  className="mt-1 size-4 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-sm font-semibold text-foreground">{p.name}</span>
                    <span className="text-sm text-foreground tabular-nums">
                      {priceText(p.prices.monthly ?? 0, "monthly", t)}
                    </span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {limitText("households", p.limits.households, t)},{" "}
                    {limitText("kasambahay", p.limits.kasambahay, t)},{" "}
                    {limitText("co_managers", p.limits.co_managers, t)}
                  </span>
                  {lower ? (
                    <span className="block text-xs text-muted-foreground">
                      {t("plan.lowerThanYourPlanCancel")}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {cycles.length > 1 ? (
        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-muted-foreground">
            {t("plan.billed")}
          </legend>
          <div
            className="mt-1.5 inline-flex rounded-xl border border-border bg-card p-1"
            role="group"
          >
            {cycles.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cycle === c}
                // Yearly to monthly is a move down: it waits for the year to end.
                disabled={running && sub.cycle === "annual" && c === "monthly"}
                onClick={() => setCycle(c)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${cycle === c ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`}
              >
                {cycleName(c, t)}, {formatCentavos(plan.prices[c] ?? 0)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {paid ? (
        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-muted-foreground">
            {t("plan.addOns")}
          </legend>
          <ul className="mt-1 divide-y divide-border">
            {ADDONS.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 text-sm text-foreground">
                  {a.name}
                  <span className="block text-xs text-muted-foreground">
                    {t("plan.aMonthEach", { price: formatCentavos(a.monthlyPrice) })}
                  </span>
                </span>
                <Stepper
                  label={a.name}
                  value={qty[a.id] ?? 0}
                  onChange={(n) => setQty({ ...qty, [a.id]: n })}
                />
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      {dropped.length && !current ? (
        <p className="mt-4 rounded-xl bg-terracotta-soft px-3 py-2 text-sm text-hearth-ink">
          {t("plan.dropsPaid", { items: listText(dropped) })}
        </p>
      ) : null}

      {after.length ? (
        <p className="mt-4 rounded-xl bg-terracotta-soft px-3 py-2 text-sm text-hearth-ink">
          {t("plan.overAfterChange", {
            items: listText(after.map((k) => limitName(k, t))),
          })}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-status-late-soft px-3 py-2 text-sm text-status-late-ink"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-3">
        <p
          className={`text-sm font-semibold ${move.ok ? "text-foreground" : "text-muted-foreground"}`}
          aria-live="polite"
        >
          {q.ok ? summary : q.message}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>
            {t("plan.cancel")}
          </button>
          {trialOffered ? (
            <button
              type="button"
              disabled={startingTrial}
              onClick={async () => {
                if (startingTrial) return;
                setStartingTrial(true);
                setError(null);
                const res = await startTrialLive(planId);
                setStartingTrial(false);
                if (!res.ok) {
                  setError(res.message);
                  return;
                }
                const ends = getPlanState().subscription.periodEnd;
                toast.success(t("plan.trialStarted", { plan: plan.name }), {
                  description: ends ? t("plan.trialEnds", { date: dayText(ends, t) }) : undefined,
                });
                onClose();
              }}
              className={secondaryBtn}
            >
              {startingTrial ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : null}
              {t("plan.startTrial", { plan: plan.name, days: plan.trialDays })}
            </button>
          ) : null}
          <button
            type="button"
            disabled={!q.ok || (!move.ok && !current)}
            onClick={async () => {
              if (current) {
                setError(t("plan.alreadyHavePlan"));
                return;
              }
              if (!move.ok) return;
              if (needsPayment) {
                setStep("pay");
                return;
              }
              const res = live ? await changeToFreeLive() : changeToFree();
              if (!res.ok) {
                setError(res.message);
                return;
              }
              toast.success(t("plan.youReOn", { name: plan.name }), {
                description: live ? t("common.nothingWasCharged") : t("plan.billingNotLiveCharged"),
              });
              onClose();
            }}
            className={primaryBtn}
          >
            {/* A paid plan goes to payment; moving to Free with nothing running doesn't. */}
            {needsPayment || (q.ok && q.amount > 0)
              ? t("plan.continueToPayment")
              : t("plan.changePlan")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Cancelling: asks first. The plan stays until its renewal date, then it's Free. */
function CancelPlanModal({ sub, onClose }: { sub: MySubscription; onClose: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = planById(sub.planId)?.name ?? "your plan";
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal onClose={close}>
      <h3 className="font-display text-xl text-foreground">
        {t("plan.cancelPlanTitle", { plan: name })}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("plan.keepUntil", {
          plan: name,
          date: sub.periodEnd ? dayText(sub.periodEnd, t) : t("plan.itEnds"),
        })}
      </p>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-status-late-soft px-3 py-2 text-sm text-status-late-ink"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={close} disabled={busy} className={secondaryBtn}>
          {t("plan.keepPlan", { plan: name })}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = getPlanState().live ? await cancelPlanLive() : cancelPlan();
            setBusy(false);
            if (!res.ok) {
              setError(res.message);
              return;
            }
            toast.success(
              sub.periodEnd
                ? t("plan.ends", { name, day: dayText(sub.periodEnd, t) })
                : t("plan.endsSoon", { name }),
              {
                description: t("plan.nothingChangesUntilThen"),
              },
            );
            onClose();
          }}
          className={primaryBtn}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : null}
          {t("plan.cancelPlan")}
        </button>
      </div>
    </Modal>
  );
}

function PayNowModal({ sub, onClose }: { sub: MySubscription; onClose: () => void }) {
  const t = useT();
  const [paid, setPaid] = useState<SamplePayment | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={() => !busy && onClose()}>
      {paid ? (
        <PaymentDone payment={paid} onDone={onClose} />
      ) : (
        <>
          <h3 className="font-display text-xl text-foreground">{t("plan.payNow")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("plan.paysWhatSOwedAnd")}</p>
          <div className="mt-4">
            <PlanPaymentStep
              planId={sub.planId}
              cycle={sub.cycle}
              addons={sub.addons}
              onPaid={setPaid}
              onBusyChange={setBusy}
            />
          </div>
        </>
      )}
    </Modal>
  );
}

const PAYMENT_STATUS: Record<PlanPayment["status"], { label: MessageKey; tone: string }> = {
  paid: { label: "plan.statusPaid", tone: "bg-status-done-soft text-status-done-ink" },
  failed: { label: "plan.statusDeclined", tone: "bg-status-late-soft text-status-late-ink" },
  pending: { label: "plan.statusWaiting", tone: "bg-terracotta-soft text-hearth-ink" },
  expired: { label: "plan.statusNotPaid", tone: "bg-secondary text-pine-deep" },
  review: { label: "plan.statusChecking", tone: "bg-terracotta-soft text-hearth-ink" },
  cancelled: { label: "plan.statusReplaced", tone: "bg-secondary text-pine-deep" },
};

/** "GCash", or Xendit's channel ("CREDIT_CARD" reads "Credit card"). */
function methodName(method: string | null, t: Translate): string | null {
  if (!method) return null;
  if (method in METHOD_LABEL) return methodLabel(method as PaymentMethod, t);
  const known: Record<string, string> = { GCASH: "GCash", PAYMAYA: "Maya", QRPH: "QR Ph" };
  if (known[method]) return known[method];
  const words = method.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function PaymentRow({ p }: { p: PlanPayment }) {
  const t = useT();
  const fmtDate = useFmtDate();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
      <span className="min-w-0 text-sm">
        <span className="font-semibold text-foreground tabular-nums">
          {formatCentavos(p.amount)}
        </span>{" "}
        <span className="text-muted-foreground">
          {[
            p.kind === "addons" ? t("plan.addOns") : (planById(p.planId)?.name ?? p.planId),
            methodName(p.method, t),
            fmtDate(p.at),
          ]
            .filter(Boolean)
            .join(", ")}
        </span>
        {p.failureReason ? (
          <span className="block text-xs text-status-late-ink">{p.failureReason}</span>
        ) : null}
        {/* For support and receipts, on its own quiet line. */}
        {p.reference ? (
          <span className="block text-xs text-muted-foreground tabular-nums">
            {t("plan.ref", { reference: p.reference })}
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-2">
        {"invoiceUrl" in p && p.invoiceUrl ? (
          <a
            href={p.invoiceUrl}
            className="inline-flex min-h-11 items-center text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("plan.finishPaying")}
          </a>
        ) : null}
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PAYMENT_STATUS[p.status].tone}`}
        >
          {t(PAYMENT_STATUS[p.status].label)}
        </span>
      </span>
    </li>
  );
}

/**
 * Payments that went somewhere first. Pages replaced by a newer one changed
 * nothing and charged nothing, so they wait behind "Show N replaced".
 */
function PaymentHistory({ payments, live }: { payments: PlanPayment[]; live: boolean }) {
  const t = useT();
  const [showReplaced, setShowReplaced] = useState(false);
  const shown = payments.filter((p) => p.status !== "cancelled");
  const replaced = payments.filter((p) => p.status === "cancelled");
  return (
    <section className={card} aria-labelledby="payments-heading">
      <h2 id="payments-heading" className="mb-3 font-display text-xl text-foreground">
        {t("plan.payments")}
      </h2>
      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {live ? t("plan.noPaymentsYet") : t("plan.noPaymentsPreview")}
        </p>
      ) : (
        <>
          {shown.length ? (
            <ul className="divide-y divide-border">
              {shown.map((p) => (
                <PaymentRow key={p.id} p={p} />
              ))}
            </ul>
          ) : null}
          {replaced.length ? (
            <>
              <button
                type="button"
                aria-expanded={showReplaced}
                onClick={() => setShowReplaced((v) => !v)}
                className="mt-2 inline-flex min-h-11 items-center rounded-lg px-1 text-sm font-semibold text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                {showReplaced
                  ? t("plan.hideReplaced")
                  : t("plan.showReplaced", { count: replaced.length })}
              </button>
              {showReplaced ? (
                <ul className="divide-y divide-border border-t border-border">
                  {replaced.map((p) => (
                    <PaymentRow key={p.id} p={p} />
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

const PREVIEW: { value: SubStatus; label: string }[] = [
  { value: "active", label: "Paid" },
  { value: "trialing", label: "On trial" },
  { value: "past_due", label: "Payment failed" },
  { value: "restricted", label: "Grace over" },
];

/**
 * How long to wait for Xendit's callback after coming back from its page:
 * every 2 seconds for the first minute and a half, then every 15 seconds up
 * to 10 minutes (on dev, 2026-10-28, one callback took 2 minutes).
 */
const CONFIRM_FAST_MS = 2_000;
const CONFIRM_FAST_FOR_MS = 90_000;
const CONFIRM_SLOW_MS = 15_000;
const CONFIRM_GIVE_UP_MS = 10 * 60_000;

/**
 * Back from Xendit's page: the plan changes only once Xendit's callback
 * reaches the database, so this asks again until that payment is settled,
 * and once more whenever the tab comes back. Sent back without paying
 * (result "failed"), there's nothing to wait for.
 */
function ReturnNotice({
  paymentId,
  result,
  onDismiss,
}: {
  paymentId: string;
  result?: "paid" | "failed";
  onDismiss?: () => void;
}) {
  const t = useT();
  const { payments, live } = usePlan();
  const payment = payments.find((p) => p.id === paymentId);
  const status = payment?.status ?? "pending";
  const waiting = live && status === "pending" && result !== "failed";
  const [phase, setPhase] = useState<"fast" | "slow" | "gave_up">("fast");
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    let t = 0;
    const tick = () => {
      const waited = Date.now() - started;
      if (waited >= CONFIRM_GIVE_UP_MS) {
        setPhase("gave_up");
        return;
      }
      const slow = waited >= CONFIRM_FAST_FOR_MS;
      setPhase(slow ? "slow" : "fast");
      void refreshPlan();
      t = window.setTimeout(tick, slow ? CONFIRM_SLOW_MS : CONFIRM_FAST_MS);
    };
    t = window.setTimeout(tick, CONFIRM_FAST_MS);
    return () => window.clearTimeout(t);
  }, [waiting]);
  useEffect(() => {
    if (!waiting) return;
    const again = () => {
      if (document.visibilityState !== "hidden") void refreshPlan();
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [waiting]);
  if (!live) return null;
  const gaveUp = phase === "gave_up";
  const text =
    status === "paid"
      ? t("plan.returnPaid")
      : status === "review"
        ? t("plan.returnReview")
        : status === "failed" || status === "expired" || result === "failed"
          ? t("plan.returnFailed")
          : gaveUp
            ? t("plan.returnGaveUp")
            : phase === "slow"
              ? t("plan.returnSlow")
              : t("plan.returnWaiting");
  const tone =
    status === "paid"
      ? "bg-status-done-soft text-status-done-ink"
      : status === "failed" || status === "expired"
        ? "bg-status-late-soft text-status-late-ink"
        : "bg-secondary text-pine-deep";
  return (
    <p
      role="status"
      className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm ${tone}`}
    >
      <span className="flex items-center gap-2">
        {waiting && !gaveUp ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : null}
        {text}
      </span>
      {onDismiss && !waiting ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("plan.dismiss")}
          className="rounded-lg p-1 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </p>
  );
}

/** The manager's plan, usage and add-ons: the real ones where billing is live, else a sample. */
export function MyPlanPage({
  buyAddon,
  upgradeTo,
  onUpgradeUsed,
  onBuyAddonUsed,
  paymentId,
  paymentResult,
  onPaymentSeen,
}: {
  /** From a limit message: open the add-on purchase with this one already added. */
  buyAddon?: string;
  onBuyAddonUsed?: () => void;
  /** From a locked feature: open Change plan with this plan picked. */
  upgradeTo?: string;
  onUpgradeUsed?: () => void;
  /** Back from Xendit's page with this payment. */
  paymentId?: string;
  /** Which way Xendit sent them back. */
  paymentResult?: "paid" | "failed";
  onPaymentSeen?: () => void;
} = {}) {
  const t = useT();
  const listText = useListText();
  const { subscription: sub, payments, live, testMode, owner, paymentsOpen } = usePlan();
  const usage = usePlanUsage();
  // A lock's "Upgrade to" lands here: open Change plan with that plan picked,
  // when it's one this manager can move to now (a move down waits for a cancel).
  const {
    subscription: start,
    owner: startOwner,
    paymentsOpen: startPaymentsOpen,
  } = getPlanState();
  const [changing, setChanging] = useState<{ planId?: string } | false>(() => {
    if (!upgradeTo || !startOwner || !startPaymentsOpen || inMobileApp()) return false;
    const p = planById(upgradeTo);
    if (!p) return false;
    const cs = cyclesOf(p);
    const move = planMove(start, upgradeTo, cs.includes(start.cycle) ? start.cycle : cs[0], []);
    return move.ok ? { planId: upgradeTo } : false;
  });
  // The link's job is done once it has opened the dialog; clear it so a reload doesn't reopen it.
  useEffect(() => {
    if (upgradeTo) onUpgradeUsed?.();
  }, [upgradeTo, onUpgradeUsed]);
  const [payingNow, setPayingNow] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [keepError, setKeepError] = useState<string | null>(null);
  const owes = sub.status === "past_due" || sub.status === "restricted";
  const running = periodRunning(sub);
  // Paid on Xendit, not confirmed yet: another purchase now would only be
  // refused (billing-checkout won't open a second page over a paid one).
  const confirming =
    live &&
    !!paymentId &&
    paymentResult === "paid" &&
    payments.find((p) => p.id === paymentId)?.status === "pending";
  const inApp = inMobileApp();
  // Payments closed (production until Xendit is set up): the plan shows, nothing is sold.
  const canBuy = !inApp && paymentsOpen;
  const plan = planById(sub.planId);
  const limits = limitsFor(sub);
  const fmtDate = useFmtDate();
  const status = statusLine(sub, t, fmtDate);
  const amount = quote(sub.planId, sub.cycle, sub.addons);
  const addonLines = sub.addons.filter((a) => a.quantity > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-foreground">{t("plan.yourPlan")}</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {!live
              ? t("plan.previewNotLive")
              : testMode && paymentsOpen
                ? t("plan.testModeNote")
                : owner
                  ? t("plan.coversEveryHousehold")
                  : t("plan.belongsToPrimary")}
          </p>
        </div>
        {!live || (testMode && paymentsOpen) ? (
          <span className="inline-flex rounded-full bg-terracotta-soft px-2.5 py-1 text-xs font-semibold text-hearth-ink">
            {live ? t("plan.testMode") : t("plan.preview")}
          </span>
        ) : null}
      </div>

      {paymentId ? (
        <ReturnNotice paymentId={paymentId} result={paymentResult} onDismiss={onPaymentSeen} />
      ) : null}

      <section className={card} aria-labelledby="plan-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="plan-heading" className="font-display text-xl text-foreground">
              {plan?.name ?? t("plan.unknownPlan")}
            </h2>
            <p className="text-sm text-muted-foreground">{plan?.description}</p>
            {canBuy && amount.ok ? (
              <p className="mt-2 text-sm font-semibold text-foreground tabular-nums">
                {priceText(amount.amount, sub.cycle, t)}
                {plan?.pricePlaceholder ? (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {t("plan.placeholderPrice")}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          {canBuy && owner ? (
            <div className="flex flex-wrap gap-2">
              {owes && amount.ok && amount.amount > 0 ? (
                <button
                  type="button"
                  disabled={confirming}
                  onClick={() => setPayingNow(true)}
                  className={primaryBtn}
                >
                  {t("plan.payAmountNow", { amount: formatCentavos(amount.amount) })}
                </button>
              ) : null}
              <button
                type="button"
                disabled={confirming}
                onClick={() => setChanging({})}
                className={owes ? secondaryBtn : primaryBtn}
              >
                {t("plan.changePlan")}
              </button>
            </div>
          ) : null}
        </div>
        <div
          className={`mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-sm ${
            status.tone === "late"
              ? "bg-status-late-soft text-status-late-ink"
              : status.tone === "warn"
                ? "bg-terracotta-soft text-hearth-ink"
                : "bg-secondary text-pine-deep"
          }`}
        >
          <p>{status.text}</p>
          {!inApp && owner && running ? (
            sub.cancelAtPeriodEnd ? (
              <button
                type="button"
                disabled={keeping}
                onClick={async () => {
                  setKeeping(true);
                  setKeepError(null);
                  const res = live ? await resumePlanLive() : resumePlan();
                  setKeeping(false);
                  if (!res.ok) {
                    setKeepError(res.message);
                    return;
                  }
                  toast.success(
                    plan ? t("plan.youReKeeping", { name: plan.name }) : t("plan.keepingYourPlan"),
                    {
                      description: sub.periodEnd
                        ? t("plan.renewsOn", { day: dayText(sub.periodEnd, t) })
                        : undefined,
                    },
                  );
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-primary transition-colors duration-150 ease-out hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:translate-y-0"
              >
                {keeping ? (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : null}
                {t("plan.keepMyPlan")}
              </button>
            ) : (
              <button
                type="button"
                disabled={confirming}
                onClick={() => setCancelling(true)}
                className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-black/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0"
              >
                {t("plan.cancelPlan")}
              </button>
            )
          ) : null}
        </div>
        {confirming ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("plan.waitingForXenditToConfirm")}
          </p>
        ) : null}
        {keepError ? (
          <p role="alert" className="mt-2 text-sm text-status-late-ink">
            {keepError}
          </p>
        ) : null}
        {inApp || !paymentsOpen ? (
          <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {inApp ? t("plan.planChangesArenTAvailable") : t("plan.paymentsNotOpen")}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className={card} aria-labelledby="usage-heading">
          <h2 id="usage-heading" className="font-display text-xl text-foreground">
            {t("plan.whatYouReUsing")}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {live && owner ? t("plan.acrossHouseholds") : t("plan.countsThisHousehold")}
          </p>
          <ul className="divide-y divide-border">
            {(Object.keys(limits) as LimitKey[]).map((k) => (
              <UsageRow
                key={k}
                k={k}
                used={usage[k]}
                limit={limits[k]}
                canAddOn={!addonsBlocked(sub) && !!addonFor(k)}
              />
            ))}
          </ul>
          {addonLines.length ? (
            <p className="mt-4 text-sm text-foreground">
              {t("plan.addOnsLine", {
                items: listText(
                  addonLines.map((l) =>
                    t("plan.addonQty", {
                      name: ADDONS.find((a) => a.id === l.addonId)?.name ?? l.addonId,
                      count: l.quantity,
                    }),
                  ),
                ),
              })}
            </p>
          ) : null}
        </section>

        <IncludedSection sub={sub} className={card} />
      </div>

      <AddonsSection
        sub={sub}
        inApp={inApp}
        closed={!paymentsOpen}
        owner={owner}
        preset={buyAddon}
        waiting={confirming}
        onPresetUsed={onBuyAddonUsed}
      />

      {!inApp && owner ? <PaymentHistory payments={payments} live={live} /> : null}

      {live ? null : (
        <section
          className="rounded-3xl border border-dashed border-border p-5 sm:p-7"
          aria-labelledby="preview-heading"
        >
          <h2 id="preview-heading" className="font-display text-lg text-foreground">
            {t("plan.previewControls")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("plan.seeHowTheAppLooks")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div
              className="inline-flex flex-wrap rounded-xl border border-border bg-card p-1"
              role="group"
              aria-label={t("plan.paymentStatus")}
            >
              {PREVIEW.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={sub.status === p.value}
                  onClick={() => previewStatus(p.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${sub.status === p.value ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={resetPlan} className={secondaryBtn}>
              {t("plan.resetPreview")}
            </button>
          </div>
        </section>
      )}

      {changing ? (
        <ChangePlanModal
          sub={sub}
          usage={usage}
          initialPlanId={changing.planId}
          onClose={() => setChanging(false)}
        />
      ) : null}
      {payingNow ? <PayNowModal sub={sub} onClose={() => setPayingNow(false)} /> : null}
      {cancelling ? <CancelPlanModal sub={sub} onClose={() => setCancelling(false)} /> : null}
    </div>
  );
}

/**
 * What the plan includes, folded to one line until asked for: ten rows on
 * every visit made Your plan three screens tall (UI/UX audit 2026-10-29).
 */
function IncludedSection({ sub, className }: { sub: MySubscription; className: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const onPlan = FEATURES.filter((f) => hasFeature(sub, f.key)).length;
  return (
    <section className={className} aria-labelledby="features-heading">
      <h2 id="features-heading" className="font-display text-xl text-foreground">
        {t("plan.included")}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("plan.featuresOnPlan", { onPlan, total: FEATURES.length })}
      </p>
      {open && (
        <ul id="features-list" className="mt-3 divide-y divide-border">
          {FEATURES.map((f) => {
            const has = hasFeature(sub, f.key);
            return (
              <li key={f.key} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                {has ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-status-done-ink" aria-hidden />
                ) : (
                  <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={`text-sm font-semibold ${has ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {f.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">{f.description}</span>
                </span>
                {!has ? (
                  <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-pine-deep">
                    {f.offForEveryone ? t("plan.offForEveryone") : t("plan.notOnYourPlan")}
                  </span>
                ) : f.everyPlan ? (
                  <span
                    title={f.everyPlan}
                    className="shrink-0 rounded-full bg-status-done-soft px-2.5 py-0.5 text-xs font-semibold text-status-done-ink"
                  >
                    {t("plan.everyPlan")}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="features-list"
        className="mt-2 -ml-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-primary transition-colors duration-150 ease-out hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? t("plan.hideTheList") : t("plan.showWhatsIncluded")}
      </button>
    </section>
  );
}
