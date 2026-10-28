import { Check, Info, Loader2, Lock, Minus, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/shared/modal";
import { inMobileApp } from "@/lib/mobile-app";

import { usePlanUsage } from "../hooks/use-plan-usage";
import {
  addonFor,
  addonsBlocked,
  CYCLE_LABEL,
  cyclesOf,
  dayText,
  formatCentavos,
  graceEndsAt,
  hasFeature,
  LIMIT_LABEL,
  limitText,
  limitsFor,
  MAX_ADDON_QUANTITY,
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
  previewStatus,
  refreshPlan,
  resetPlan,
  resumePlan,
  resumePlanLive,
  usePlan,
  type PaymentMethod,
  type PlanPayment,
  type SamplePayment,
} from "../plan.store";
import type { Cycle, LimitKey, MySubscription, SubStatus, Usage } from "../plan.types";

const dateFmt = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});
const fmtDate = (iso: string) => dateFmt.format(new Date(iso));

const SAMPLE = "Billing isn't live yet, so nothing was charged.";

const card = "rounded-3xl bg-card p-5 shadow-soft sm:p-7";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-colors duration-150 ease-out hover:bg-pine-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:translate-y-0";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-card px-4 text-sm font-semibold text-primary transition-colors duration-150 ease-out hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:translate-y-0";

function statusLine(sub: MySubscription): { tone: "calm" | "warn" | "late"; text: string } {
  const grace = graceEndsAt(sub);
  switch (sub.status) {
    case "trialing":
      return {
        tone: "calm",
        text: sub.periodEnd ? `Free trial until ${fmtDate(sub.periodEnd)}.` : "Free trial.",
      };
    case "past_due":
      return {
        tone: "warn",
        text: `The last payment didn't go through. Everything keeps working until ${grace ? fmtDate(grace) : "the grace period ends"}; pay before then to keep it that way.`,
      };
    case "restricted":
      return {
        tone: "late",
        text: "The payment is overdue. Only the households and kasambahay you choose stay active; for the rest, new tasks and changes pause until it's paid. Nothing is deleted, and every kasambahay keeps her own record, leave and rest days.",
      };
    case "active":
      if (!sub.periodEnd) return { tone: "calm", text: "Nothing to renew." };
      return {
        tone: "calm",
        text: sub.cancelAtPeriodEnd
          ? `Ends ${fmtDate(sub.periodEnd)}, then moves to Free.`
          : `Renews ${fmtDate(sub.periodEnd)}.`,
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
  const over = limit !== null && used > limit;
  const pct = limit === null || limit === 0 ? 0 : Math.min(100, (used / limit) * 100);
  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{LIMIT_LABEL[k].title}</span>
        <span
          className={`text-sm tabular-nums ${over ? "font-semibold text-status-late-ink" : "text-foreground"}`}
        >
          {limit === null ? `${used}, no limit` : `${used} of ${limit}`}
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
          {used - limit} over.{" "}
          {canAddOn ? "Add more with an add-on, or choose a bigger plan." : "Choose a bigger plan."}
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
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Fewer: ${label}`}
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
        aria-label={`More: ${label}`}
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
  onClose,
}: {
  sub: MySubscription;
  usage: Usage;
  onClose: () => void;
}) {
  const [planId, setPlanId] = useState(sub.planId);
  const plan = planById(planId) ?? CATALOG[0];
  const cycles = cyclesOf(plan);
  const [cycleState, setCycle] = useState<Cycle>(sub.cycle);
  const cycle = cycles.includes(cycleState) ? cycleState : cycles[0];
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(sub.addons.map((a) => [a.addonId, a.quantity])),
  );
  const paid = (plan.prices[cycle] ?? 0) > 0 && cycle !== "one_time";
  const addons = paid ? ADDONS.map((a) => ({ addonId: a.id, quantity: qty[a.id] ?? 0 })) : [];
  const q = quote(planId, cycle, addons);
  // Up only while a paid period runs, at the price the database charges (planMove).
  const running = periodRunning(sub);
  const move = planMove(sub, planId, cycle, addons);
  const current = isCurrentPlan(planId, cycle, addons);
  const live = getPlanState().live;
  const lowerThanNow = (id: string) => {
    if (!running || id === sub.planId) return false;
    const p = planById(id);
    if (!p) return true;
    const cs = cyclesOf(p);
    const m = planMove(sub, id, cs.includes(sub.cycle) ? sub.cycle : cs[0], []);
    return !m.ok && !!m.lower;
  };
  const after = overLimits({ ...sub, planId, addons }, usage);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"choose" | "pay">("choose");
  // A payment going through can't be closed away: it would finish unseen.
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (!busy) onClose();
  };
  const [receipt, setReceipt] = useState<SamplePayment | null>(null);
  const needsPayment = move.ok && move.dueNow > 0;
  const fullPrice = q.ok ? priceText(q.amount, cycle) : "";
  const summary = current
    ? `${fullPrice}, your plan now`
    : !move.ok
      ? move.message
      : move.keepsPeriod && sub.periodEnd
        ? `${formatCentavos(move.dueNow)} now for the rest of this period, then ${fullPrice} from ${dayText(sub.periodEnd)}.`
        : move.prorated
          ? `${formatCentavos(move.dueNow)} now (the year, less what's unused of this month), then ${fullPrice}.`
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
        <h3 className="font-display text-xl text-foreground">Pay for {plan.name}</h3>
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
        <h3 className="font-display text-xl text-foreground">Change plan</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {running && sub.periodEnd
          ? `You can move up any time. To move to a lower plan, cancel this one: you keep it until ${dayText(sub.periodEnd)}.`
          : "The new plan starts once it's paid."}
        {live
          ? " You pay on Xendit's secure page."
          : " Payments here are a sample: nothing is charged."}
      </p>

      <fieldset className="mt-4">
        <legend className="text-xs font-semibold text-muted-foreground">Plan</legend>
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
                      {priceText(p.prices.monthly ?? 0, "monthly")}
                    </span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {limitText("households", p.limits.households)},{" "}
                    {limitText("kasambahay", p.limits.kasambahay)},{" "}
                    {limitText("co_managers", p.limits.co_managers)}
                  </span>
                  {lower ? (
                    <span className="block text-xs text-muted-foreground">
                      Lower than your plan: cancel first.
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
          <legend className="text-xs font-semibold text-muted-foreground">Billed</legend>
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
                {CYCLE_LABEL[c].name}, {formatCentavos(plan.prices[c] ?? 0)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {paid ? (
        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-muted-foreground">Add-ons</legend>
          <ul className="mt-1 divide-y divide-border">
            {ADDONS.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 text-sm text-foreground">
                  {a.name}
                  <span className="block text-xs text-muted-foreground">
                    {formatCentavos(a.monthlyPrice)} a month each
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

      {after.length ? (
        <p className="mt-4 rounded-xl bg-terracotta-soft px-3 py-2 text-sm text-hearth-ink">
          You'd have more than this plan allows ({after.map((k) => LIMIT_LABEL[k].many).join(", ")}
          ). You'll choose which stay active; for the rest, new tasks and changes pause. Nothing is
          deleted, and every kasambahay keeps her own record, leave and rest days.
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
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!q.ok || (!move.ok && !current)}
            onClick={async () => {
              if (current) {
                setError("That's the plan you already have.");
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
              toast.success(`You're on ${plan.name}.`, {
                description: live ? "Nothing was charged." : SAMPLE,
              });
              onClose();
            }}
            className={primaryBtn}
          >
            {/* A paid plan goes to payment; moving to Free with nothing running doesn't. */}
            {needsPayment || (q.ok && q.amount > 0) ? "Continue to payment" : "Change plan"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Cancelling: asks first. The plan stays until its renewal date, then it's Free. */
function CancelPlanModal({ sub, onClose }: { sub: MySubscription; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = planById(sub.planId)?.name ?? "your plan";
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal onClose={close}>
      <h3 className="font-display text-xl text-foreground">Cancel {name}?</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        You keep everything on {name} until {sub.periodEnd ? dayText(sub.periodEnd) : "it ends"}.
        Then you're on Free, and you can choose any plan. Changed your mind before then? Keep it
        from Your plan.
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
          Keep {name}
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
            toast.success(`${name} ends ${sub.periodEnd ? dayText(sub.periodEnd) : "soon"}.`, {
              description: "Nothing changes until then.",
            });
            onClose();
          }}
          className={primaryBtn}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : null}
          Cancel plan
        </button>
      </div>
    </Modal>
  );
}

function PayNowModal({ sub, onClose }: { sub: MySubscription; onClose: () => void }) {
  const [paid, setPaid] = useState<SamplePayment | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={() => !busy && onClose()}>
      {paid ? (
        <PaymentDone payment={paid} onDone={onClose} />
      ) : (
        <>
          <h3 className="font-display text-xl text-foreground">Pay now</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pays what's owed and keeps everything working.
          </p>
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

const PAYMENT_STATUS: Record<PlanPayment["status"], { label: string; tone: string }> = {
  paid: { label: "Paid", tone: "bg-status-done-soft text-status-done-ink" },
  failed: { label: "Declined", tone: "bg-status-late-soft text-status-late-ink" },
  pending: { label: "Waiting", tone: "bg-terracotta-soft text-hearth-ink" },
  expired: { label: "Not paid", tone: "bg-secondary text-pine-deep" },
  review: { label: "Being checked", tone: "bg-terracotta-soft text-hearth-ink" },
  cancelled: { label: "Replaced", tone: "bg-secondary text-pine-deep" },
};

/** "GCash", or Xendit's channel ("CREDIT_CARD" reads "Credit card"). */
function methodName(method: string | null): string | null {
  if (!method) return null;
  const sample = METHOD_LABEL[method as PaymentMethod];
  if (sample) return sample.name;
  const known: Record<string, string> = { GCASH: "GCash", PAYMAYA: "Maya", QRPH: "QR Ph" };
  if (known[method]) return known[method];
  const words = method.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function PaymentHistory({ payments, live }: { payments: PlanPayment[]; live: boolean }) {
  return (
    <section className={card} aria-labelledby="payments-heading">
      <h2 id="payments-heading" className="mb-3 font-display text-xl text-foreground">
        Payments
      </h2>
      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {live ? "No payments yet." : "No payments in this preview yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {payments.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="min-w-0 text-sm">
                <span className="font-semibold text-foreground tabular-nums">
                  {formatCentavos(p.amount)}
                </span>{" "}
                <span className="text-muted-foreground">
                  {[
                    p.kind === "addons" ? "Add-ons" : (planById(p.planId)?.name ?? p.planId),
                    methodName(p.method),
                    fmtDate(p.at),
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  {p.reference ? (
                    <>
                      , <span className="tabular-nums">{p.reference}</span>
                    </>
                  ) : null}
                </span>
                {p.failureReason ? (
                  <span className="block text-xs text-status-late-ink">{p.failureReason}</span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                {"invoiceUrl" in p && p.invoiceUrl ? (
                  <a
                    href={p.invoiceUrl}
                    className="text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Finish paying
                  </a>
                ) : null}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PAYMENT_STATUS[p.status].tone}`}
                >
                  {PAYMENT_STATUS[p.status].label}
                </span>
              </span>
            </li>
          ))}
        </ul>
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

/** How long to wait for Xendit's callback after coming back from its page. */
const CONFIRM_POLL_MS = 2_000;
const CONFIRM_TRIES = 45;

/**
 * Back from Xendit's page: the plan changes only once Xendit's callback
 * reaches the database, so this asks again every couple of seconds until
 * that payment is settled, for up to a minute and a half.
 */
function ReturnNotice({ paymentId, onDismiss }: { paymentId: string; onDismiss?: () => void }) {
  const { payments, live } = usePlan();
  const payment = payments.find((p) => p.id === paymentId);
  const status = payment?.status ?? "pending";
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!live || status !== "pending") return;
    let tries = 0;
    const t = window.setInterval(() => {
      tries += 1;
      if (tries > CONFIRM_TRIES) {
        window.clearInterval(t);
        setGaveUp(true);
        return;
      }
      void refreshPlan();
    }, CONFIRM_POLL_MS);
    return () => window.clearInterval(t);
  }, [live, status]);
  if (!live) return null;
  const text =
    status === "paid"
      ? "Payment received. Your plan is updated."
      : status === "review"
        ? "Payment received, but the amount needs checking. We'll sort it out; nothing else is needed from you."
        : status === "failed" || status === "expired"
          ? "That payment didn't go through, so nothing was charged. You can try again."
          : gaveUp
            ? "Xendit hasn't confirmed it yet. If you paid, it will show here once it does."
            : "Confirming your payment with Xendit…";
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
        {status === "pending" && !gaveUp ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : null}
        {text}
      </span>
      {onDismiss && status !== "pending" ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
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
  onBuyAddonUsed,
  paymentId,
  onPaymentSeen,
}: {
  /** From a limit message: open the add-on purchase with this one already added. */
  buyAddon?: string;
  onBuyAddonUsed?: () => void;
  /** Back from Xendit's page with this payment. */
  paymentId?: string;
  onPaymentSeen?: () => void;
} = {}) {
  const { subscription: sub, payments, live, testMode, owner } = usePlan();
  const usage = usePlanUsage();
  const [changing, setChanging] = useState(false);
  const [payingNow, setPayingNow] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [keepError, setKeepError] = useState<string | null>(null);
  const owes = sub.status === "past_due" || sub.status === "restricted";
  const running = periodRunning(sub);
  const inApp = inMobileApp();
  const plan = planById(sub.planId);
  const limits = limitsFor(sub);
  const status = statusLine(sub);
  const amount = quote(sub.planId, sub.cycle, sub.addons);
  const addonLines = sub.addons.filter((a) => a.quantity > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-foreground">Your plan</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {!live
              ? "A preview: billing isn't live yet, so nothing here charges you."
              : testMode
                ? "Test mode: payments go through Xendit's test page, so nothing real is charged."
                : owner
                  ? "Your plan covers every household you own."
                  : "This household's plan belongs to its primary manager."}
          </p>
        </div>
        {!live || testMode ? (
          <span className="inline-flex rounded-full bg-terracotta-soft px-2.5 py-1 text-xs font-semibold text-hearth-ink">
            {live ? "Test mode" : "Preview"}
          </span>
        ) : null}
      </div>

      {paymentId ? <ReturnNotice paymentId={paymentId} onDismiss={onPaymentSeen} /> : null}

      <section className={card} aria-labelledby="plan-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="plan-heading" className="font-display text-xl text-foreground">
              {plan?.name ?? "Unknown plan"}
            </h2>
            <p className="text-sm text-muted-foreground">{plan?.description}</p>
            {!inApp && amount.ok ? (
              <p className="mt-2 text-sm font-semibold text-foreground tabular-nums">
                {priceText(amount.amount, sub.cycle)}
                {plan?.pricePlaceholder ? (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    (placeholder price)
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          {!inApp && owner ? (
            <div className="flex flex-wrap gap-2">
              {owes && amount.ok && amount.amount > 0 ? (
                <button type="button" onClick={() => setPayingNow(true)} className={primaryBtn}>
                  Pay {formatCentavos(amount.amount)} now
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setChanging(true)}
                className={owes ? secondaryBtn : primaryBtn}
              >
                Change plan
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
                  toast.success(`You're keeping ${plan?.name ?? "your plan"}.`, {
                    description: sub.periodEnd ? `It renews ${dayText(sub.periodEnd)}.` : undefined,
                  });
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-primary transition-colors duration-150 ease-out hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:translate-y-0"
              >
                {keeping ? (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : null}
                Keep my plan
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCancelling(true)}
                className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-black/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0"
              >
                Cancel plan
              </button>
            )
          ) : null}
        </div>
        {keepError ? (
          <p role="alert" className="mt-2 text-sm text-status-late-ink">
            {keepError}
          </p>
        ) : null}
        {inApp ? (
          <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            Plan changes aren't available in the app.
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className={card} aria-labelledby="usage-heading">
          <h2 id="usage-heading" className="font-display text-xl text-foreground">
            What you're using
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {live && owner
              ? "Across every household you own. A kasambahay working in two of them counts once."
              : "Kasambahay counts this household for now; across all your households once billing is live."}
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
              Add-ons:{" "}
              {addonLines
                .map(
                  (l) =>
                    `${ADDONS.find((a) => a.id === l.addonId)?.name ?? l.addonId} × ${l.quantity}`,
                )
                .join(", ")}
            </p>
          ) : null}
        </section>

        <section className={card} aria-labelledby="features-heading">
          <h2 id="features-heading" className="mb-3 font-display text-xl text-foreground">
            Included
          </h2>
          <ul className="divide-y divide-border">
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
                      {f.offForEveryone ? "Off for everyone" : "Not on your plan"}
                    </span>
                  ) : f.everyPlan ? (
                    <span
                      title={f.everyPlan}
                      className="shrink-0 rounded-full bg-status-done-soft px-2.5 py-0.5 text-xs font-semibold text-status-done-ink"
                    >
                      Every plan
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <AddonsSection
        sub={sub}
        inApp={inApp}
        owner={owner}
        preset={buyAddon}
        onPresetUsed={onBuyAddonUsed}
      />

      {!inApp && owner ? <PaymentHistory payments={payments} live={live} /> : null}

      {live ? null : (
        <section
          className="rounded-3xl border border-dashed border-border p-5 sm:p-7"
          aria-labelledby="preview-heading"
        >
          <h2 id="preview-heading" className="font-display text-lg text-foreground">
            Preview controls
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            See how the app looks on another payment status. Only this tab changes, until it's
            reloaded.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div
              className="inline-flex flex-wrap rounded-xl border border-border bg-card p-1"
              role="group"
              aria-label="Payment status"
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
              Reset preview
            </button>
          </div>
        </section>
      )}

      {changing ? (
        <ChangePlanModal sub={sub} usage={usage} onClose={() => setChanging(false)} />
      ) : null}
      {payingNow ? <PayNowModal sub={sub} onClose={() => setPayingNow(false)} /> : null}
      {cancelling ? <CancelPlanModal sub={sub} onClose={() => setCancelling(false)} /> : null}
    </div>
  );
}
