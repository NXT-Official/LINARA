import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";

import { formatCentavos, planById, priceText, quote } from "../plan.logic";
import { ADDONS } from "../plan.sample";
import { METHOD_LABEL, payForPlan, type PaymentMethod, type SamplePayment } from "../plan.store";
import type { AddonLine, Cycle } from "../plan.types";

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-colors duration-150 ease-out hover:bg-pine-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:translate-y-0";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-card px-4 text-sm font-semibold text-primary transition-colors duration-150 ease-out hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Choosing how to pay and paying, on sample data: Pay goes through after a
 * moment without charging anything, so the flow can be tried end to end.
 */
export function PaymentStep({
  planId,
  cycle,
  addons,
  onBack,
  onPaid,
}: {
  planId: string;
  cycle: Cycle;
  addons: AddonLine[];
  /** Back to the plan choice; omitted when paying what's already owed. */
  onBack?: () => void;
  onPaid: (payment: SamplePayment) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("gcash");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = planById(planId);
  const lines = addons.filter((a) => a.quantity > 0);
  const extras = lines
    .map((l) => `${ADDONS.find((a) => a.id === l.addonId)?.name ?? l.addonId} × ${l.quantity}`)
    .join(", ");

  const pay = async () => {
    setPaying(true);
    setError(null);
    const res = await payForPlan(planId, cycle, addons, method);
    setPaying(false);
    if (res.ok) onPaid(res.payment);
    else setError(res.message);
  };

  // The same quote the store charges.
  const q = quote(planId, cycle, addons);
  const amount = q.ok ? q.amount : 0;

  return (
    <div>
      <div className="rounded-2xl bg-secondary/60 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">
          {plan?.name ?? "Plan"}, {priceText(amount, cycle)}
        </p>
        {extras ? <p className="text-xs text-muted-foreground">Includes {extras}</p> : null}
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
