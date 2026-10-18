import { Loader2, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Field } from "@/components/shared/field";

import type { BillingHome, SeatUsage } from "../billing.types";
import { fmtCentavos } from "../money";
import { describePlanPricing, intervalLabel, quoteAmount } from "../plan.pricing";
import type { Plan } from "../plan.types";

export type CheckoutChoice = {
  planId: string;
  helperSeats: number;
  managerSeats: number;
  homeIds: string[];
  email: string;
};

const OVER_COPY = {
  helper: "helpers",
  manager: "managers",
  home: "homes",
} as const;

function Stepper({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (next: number) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Fewer ${label.toLowerCase()}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:border-primary disabled:opacity-40"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="w-8 text-center text-sm font-semibold text-foreground" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={`More ${label.toLowerCase()}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:border-primary"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </span>
    </li>
  );
}

/**
 * The public plans as rows, seat steppers that start at what the household
 * already uses (a plan can't be smaller than the people on it), and a live
 * price from the same arithmetic the database uses.
 */
export function PlanPicker({
  plans,
  usage,
  homes,
  currentHouseholdId,
  busy,
  onSubmit,
}: {
  plans: Plan[];
  usage: SeatUsage;
  homes: BillingHome[];
  currentHouseholdId: string;
  busy: boolean;
  onSubmit: (choice: CheckoutChoice) => void;
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [helperSeats, setHelperSeats] = useState(usage.helpers);
  const [managerSeats, setManagerSeats] = useState(usage.managers);
  const [pickedHomes, setPickedHomes] = useState<string[]>([currentHouseholdId]);
  const [email, setEmail] = useState("");

  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const primaries = homes.filter((h) => h.primary);
  const helpers = Math.max(helperSeats, usage.helpers);
  const managers = Math.max(managerSeats, usage.managers);
  const homeIds =
    primaries.length > 1 && pickedHomes.length > 0 ? pickedHomes : [currentHouseholdId];

  const quote = useMemo(
    () => (plan ? quoteAmount(plan, { helpers, managers, homes: homeIds.length }) : null),
    [plan, helpers, managers, homeIds.length],
  );

  if (!plan || !quote) return null;

  const toggleHome = (id: string) =>
    setPickedHomes((prev) => (prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]));

  const trial = plan.trialDays > 0;
  const buttonLabel = !quote.ok
    ? "Pick a smaller number"
    : trial
      ? `Start your ${plan.trialDays}-day free trial`
      : `Pay ${fmtCentavos(quote.amountCentavos)}`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!quote.ok) return;
        onSubmit({ planId: plan.id, helperSeats: helpers, managerSeats: managers, homeIds, email });
      }}
    >
      <fieldset>
        <legend className="sr-only">Plan</legend>
        <ul className="divide-y divide-border/60 border-y border-border/60">
          {plans.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-start gap-3 py-3.5">
                <input
                  type="radio"
                  name="plan"
                  value={p.id}
                  checked={p.id === plan.id}
                  onChange={() => setPlanId(p.id)}
                  className="mt-1 accent-[var(--primary)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{p.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {describePlanPricing(p)}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <ul className="divide-y divide-border/60 border-b border-border/60">
        <Stepper label="Helpers" value={helpers} min={usage.helpers} onChange={setHelperSeats} />
        <Stepper
          label="Managers"
          value={managers}
          min={usage.managers}
          onChange={setManagerSeats}
        />
      </ul>

      {primaries.length > 1 && (
        <fieldset className="border-b border-border/60 py-3">
          <legend className="text-[13px] font-semibold text-muted-foreground">
            Homes this plan covers
          </legend>
          <ul className="mt-2 space-y-1">
            {primaries.map((h) => (
              <li key={h.id}>
                <label className="flex cursor-pointer items-center gap-3 py-1.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={homeIds.includes(h.id)}
                    onChange={() => toggleHome(h.id)}
                    className="accent-[var(--primary)]"
                  />
                  {h.name}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <div className="py-3">
        <Field label="Send the receipt to (optional, defaults to your login email)">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
      </div>

      {quote.ok ? (
        <ul className="divide-y divide-border/60 border-y border-border/60" aria-label="Price">
          {quote.lines.map((line) => (
            <li key={line.label} className="flex justify-between gap-3 py-2.5 text-sm">
              <span className="text-foreground">{line.label}</span>
              <span className="text-foreground">{fmtCentavos(line.centavos)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 py-2.5 text-sm font-semibold">
            <span className="text-foreground">Total</span>
            <span className="text-foreground">
              {fmtCentavos(quote.amountCentavos)} {intervalLabel(plan.interval)}
            </span>
          </li>
        </ul>
      ) : (
        <p role="alert" className="py-3 text-sm font-semibold text-destructive">
          {`${plan.name} doesn't sell extra ${OVER_COPY[quote.over]}. Lower the number or pick another plan.`}
        </p>
      )}
      {trial && quote.ok && (
        <p className="pt-2 text-sm text-muted-foreground">
          Nothing to pay today. The first payment is after the trial.
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !quote.ok}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep disabled:opacity-50 sm:w-auto"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {buttonLabel}
      </button>
    </form>
  );
}
