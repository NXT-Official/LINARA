import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";

import {
  addonChange,
  dayText,
  formatCentavos,
  planById,
  planMove,
  priceText,
  quote,
} from "../plan.logic";
import { ADDONS } from "../plan.sample";
import {
  checkout,
  METHOD_LABEL,
  payForAddons,
  payForPlan,
  usePlan,
  type CheckoutResult,
  type PaymentMethod,
  type PayResult,
  type SamplePayment,
} from "../plan.store";
import type { AddonLine, Cycle, MySubscription } from "../plan.types";

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-colors duration-150 ease-out hover:bg-pine-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:translate-y-0";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-card px-4 text-sm font-semibold text-primary transition-colors duration-150 ease-out hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const addonsText = (lines: AddonLine[]) =>
  lines
    .filter((l) => l.quantity > 0)
    .map((l) => `${ADDONS.find((a) => a.id === l.addonId)?.name ?? l.addonId} × ${l.quantity}`)
    .join(", ");

type StepProps = {
  /** Back to the previous choice; omitted when there's nothing to go back to. */
  onBack?: () => void;
  onPaid: (payment: SamplePayment) => void;
  /** While a payment is going through, so the dialog around it can't be closed. */
  onBusyChange?: (busy: boolean) => void;
};

/**
 * Paying for real: the amount is worked out in the database and paid on
 * Xendit's page, which takes GCash, Maya, cards, QR Ph and over the counter.
 * The browser goes there and comes back to Your plan.
 */
function XenditStep({
  amount,
  title,
  detail,
  open,
  testMode,
  onBack,
  onBusyChange,
}: Omit<StepProps, "onPaid"> & {
  amount: number;
  title: string;
  detail?: string;
  open: () => Promise<CheckoutResult>;
  testMode: boolean;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setOpening(true);
    onBusyChange?.(true);
    setError(null);
    const res = await open();
    // On success the browser is already leaving for Xendit; stay busy.
    if (res.ok) return;
    setOpening(false);
    onBusyChange?.(false);
    setError(res.message);
  };
  return (
    <div>
      <div className="rounded-2xl bg-secondary/60 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        You'll pay on Xendit's secure page: GCash, Maya, a card, QR Ph or over the counter. Then you
        come back here.
      </p>
      {testMode ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Test mode: Xendit's test page lets you finish the payment without paying anything real.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-status-late-soft px-3 py-2 text-sm text-status-late-ink"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        {onBack ? (
          <button type="button" onClick={onBack} disabled={opening} className={secondaryBtn}>
            Back
          </button>
        ) : null}
        <button type="button" onClick={go} disabled={opening} className={primaryBtn}>
          {opening ? (
            <>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              Opening Xendit…
            </>
          ) : (
            `Pay ${formatCentavos(amount)} on Xendit`
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Choosing how to pay and paying, on sample data: Pay goes through after a
 * moment without charging anything, so the flow can be tried end to end.
 * Where billing is live, the Xendit step instead.
 */
function PaymentStep({
  amount,
  title,
  detail,
  pay: charge,
  open,
  onBack,
  onPaid,
  onBusyChange,
}: StepProps & {
  amount: number;
  title: string;
  detail?: string;
  pay: (method: PaymentMethod) => Promise<PayResult>;
  open: () => Promise<CheckoutResult>;
}) {
  const { live, testMode } = usePlan();
  const [method, setMethod] = useState<PaymentMethod>("gcash");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (live) {
    return (
      <XenditStep
        amount={amount}
        title={title}
        detail={detail}
        open={open}
        testMode={testMode}
        onBack={onBack}
        onBusyChange={onBusyChange}
      />
    );
  }

  const pay = async () => {
    setPaying(true);
    onBusyChange?.(true);
    setError(null);
    const res = await charge(method);
    setPaying(false);
    onBusyChange?.(false);
    if (res.ok) onPaid(res.payment);
    else setError(res.message);
  };

  return (
    <div>
      <div className="rounded-2xl bg-secondary/60 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>

      <fieldset className="mt-4" disabled={paying}>
        <legend className="text-xs font-semibold text-muted-foreground">Pay with</legend>
        <div className="mt-1.5 divide-y divide-border rounded-2xl border border-border">
          {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
            <label
              key={m}
              className={`flex min-h-12 cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors first:rounded-t-2xl last:rounded-b-2xl ${method === m ? "bg-secondary/70" : "hover:bg-secondary/40"}`}
            >
              <input
                type="radio"
                name="pay-method"
                value={m}
                checked={method === m}
                onChange={() => {
                  setMethod(m);
                  setError(null);
                }}
                className="mt-1 size-4 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  {METHOD_LABEL[m].name}
                </span>
                <span className="block text-xs text-muted-foreground">{METHOD_LABEL[m].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="mt-3 text-xs text-muted-foreground">
        This is a sample payment: nothing is charged, and it goes through without paying.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-status-late-soft px-3 py-2 text-sm text-status-late-ink"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex justify-end gap-2">
        {onBack ? (
          <button type="button" onClick={onBack} disabled={paying} className={secondaryBtn}>
            Back
          </button>
        ) : null}
        <button type="button" onClick={pay} disabled={paying} className={primaryBtn}>
          {paying ? (
            <>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              Paying…
            </>
          ) : (
            `Pay ${formatCentavos(amount)}`
          )}
        </button>
      </div>
    </div>
  );
}

/** Paying for a plan: a change of plan, or what's owed on the current one. */
export function PlanPaymentStep({
  planId,
  cycle,
  addons,
  ...step
}: StepProps & { planId: string; cycle: Cycle; addons: AddonLine[] }) {
  // The same price the store and the database charge: prorated while a period runs.
  const { subscription } = usePlan();
  const q = quote(planId, cycle, addons);
  const move = planMove(subscription, planId, cycle, addons);
  const full = q.ok ? q.amount : 0;
  const amount = move.ok ? move.dueNow : full;
  const extras = addonsText(addons);
  const name = planById(planId)?.name ?? "Plan";
  const notes = [
    move.ok && move.keepsPeriod && subscription.periodEnd
      ? `${formatCentavos(amount)} now for the rest of this period, then ${priceText(full, cycle)} from ${dayText(subscription.periodEnd)}.`
      : move.ok && move.prorated
        ? `${formatCentavos(amount)} now: a year of ${name}, less what's unused of this month.`
        : null,
    extras ? `Includes ${extras}` : null,
  ].filter(Boolean);
  return (
    <PaymentStep
      {...step}
      amount={amount}
      title={move.ok && move.prorated ? `${name}, upgrade` : `${name}, ${priceText(amount, cycle)}`}
      detail={notes.length ? notes.join(" ") : undefined}
      pay={(method) => payForPlan(planId, cycle, addons, method)}
      open={() => checkout("plan", planId, cycle, addons)}
    />
  );
}

/** Paying for add-ons bought on the plan it has. */
export function AddonPaymentStep({
  sub,
  lines,
  ...step
}: StepProps & { sub: MySubscription; lines: AddonLine[] }) {
  // The same change the store charges.
  const change = addonChange(sub, lines);
  const dueNow = change.ok ? change.dueNow : 0;
  return (
    <PaymentStep
      {...step}
      amount={dueNow}
      title={`Add-ons: ${addonsText(lines) || "none"}`}
      detail={
        change.ok
          ? `${formatCentavos(dueNow)} now, for the period that's running. Then ${priceText(change.newAmount, sub.cycle)} with your plan.`
          : change.message
      }
      pay={(method) => payForAddons(lines, method)}
      open={() => checkout("addons", null, null, lines)}
    />
  );
}

/** What a sample payment shows once it has gone through. */
export function PaymentDone({ payment, onDone }: { payment: SamplePayment; onDone: () => void }) {
  return (
    <div className="text-center">
      <CheckCircle2
        className="mx-auto size-10 text-status-done-ink duration-200 ease-out animate-in fade-in-0 zoom-in-90 motion-reduce:animate-none"
        aria-hidden
      />
      <p className="mt-3 font-display text-lg text-foreground">Payment received</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatCentavos(payment.amount)} by {METHOD_LABEL[payment.method].name}, reference{" "}
        <span className="tabular-nums">{payment.reference}</span>. A sample: nothing was charged.
      </p>
      <button type="button" onClick={onDone} className={`${primaryBtn} mt-5`}>
        Done
      </button>
    </div>
  );
}
