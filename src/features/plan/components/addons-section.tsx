import { Minus, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/shared/modal";

import {
  addonChange,
  addonsBlocked,
  formatCentavos,
  LIMIT_LABEL,
  limitText,
  limitsFor,
  MAX_ADDON_QUANTITY,
  priceText,
} from "../plan.logic";
import { ADDONS } from "../plan.sample";
import { getPlanState, removeAddons, removeAddonsLive, type SamplePayment } from "../plan.store";
import type { AddonLine, MySubscription } from "../plan.types";
import { AddonPaymentStep, PaymentDone } from "./payment-step";

const card = "rounded-3xl bg-card p-5 shadow-soft sm:p-7";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-colors duration-150 ease-out hover:bg-pine-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:translate-y-0";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-card px-4 text-sm font-semibold text-primary transition-colors duration-150 ease-out hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const owned = (sub: MySubscription, id: string) =>
  sub.addons.filter((l) => l.addonId === id).reduce((n, l) => n + l.quantity, 0);

function Stepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
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
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function AddonsModal({
  sub,
  preset,
  onClose,
}: {
  sub: MySubscription;
  /** An add-on to start at one, when arriving from a limit message. */
  preset?: string;
  onClose: () => void;
}) {
  // How many more of each to buy, on top of what's owned. Removing is on the
  // section's rows, so this can't take any away.
  const [buy, setBuy] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      ADDONS.map((a) => [a.id, a.id === preset && owned(sub, a.id) < MAX_ADDON_QUANTITY ? 1 : 0]),
    ),
  );
  const [step, setStep] = useState<"choose" | "pay">("choose");
  const [receipt, setReceipt] = useState<SamplePayment | null>(null);
  const [busy, setBusy] = useState(false);
  const live = getPlanState().live;
  const lines: AddonLine[] = ADDONS.map((a) => ({
    addonId: a.id,
    quantity: owned(sub, a.id) + (buy[a.id] ?? 0),
  }));
  const change = addonChange(sub, lines);
  const buying = ADDONS.some((a) => (buy[a.id] ?? 0) > 0);
  const after = limitsFor({ ...sub, addons: lines });
  const close = () => {
    if (!busy) onClose();
  };

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
        <h3 className="font-display text-xl text-foreground">Pay for add-ons</h3>
        <div className="mt-4">
          <AddonPaymentStep
            sub={sub}
            lines={lines}
            onBack={() => setStep("choose")}
            onPaid={setReceipt}
            onBusyChange={setBusy}
          />
        </div>
      </Modal>
    );
  }

  const summary = !buying
    ? "Choose how many to add."
    : !change.ok
      ? change.message
      : `${formatCentavos(change.dueNow)} now, then ${priceText(change.newAmount, sub.cycle)} with your plan.`;
  const canPay = buying && change.ok && change.dueNow > 0;

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl text-foreground">Buy add-ons</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Added ones are charged now for the period that's running, then billed with your plan.
        {live
          ? " You pay on Xendit's secure page."
          : " Payments here are a sample: nothing is charged."}
      </p>
      <ul className="mt-4 divide-y divide-border">
        {ADDONS.map((a) => {
          const have = owned(sub, a.id);
          return (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 text-sm text-foreground">
                {a.name}
                <span className="block text-xs text-muted-foreground">
                  Adds {limitText(a.limitKey, a.step)}, {formatCentavos(a.monthlyPrice)} a month
                  each
                  {sub.cycle === "annual" ? " (twelve months on your yearly plan)" : ""}
                </span>
                {have > 0 ? (
                  <span className="block text-xs text-muted-foreground">You have {have}</span>
                ) : null}
              </span>
              <Stepper
                label={a.name}
                value={buy[a.id] ?? 0}
                max={Math.max(0, MAX_ADDON_QUANTITY - have)}
                onChange={(n) => setBuy({ ...buy, [a.id]: n })}
              />
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        After this, your plan allows {limitText("households", after.households)} and{" "}
        {limitText("kasambahay", after.kasambahay)}.
      </p>
      {/* The price gets its own line so the buttons never squeeze into wrapped text. */}
      <div className="mt-5 flex flex-col gap-3">
        <p
          className={`text-sm font-semibold ${canPay ? "text-foreground" : "text-muted-foreground"}`}
          aria-live="polite"
        >
          {summary}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!canPay}
            onClick={() => {
              if (canPay) setStep("pay");
            }}
            className={primaryBtn}
          >
            Continue to payment
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Taking one add-on off: it asks first, since it takes effect now and isn't refunded. */
function RemoveAddonModal({
  sub,
  addonId,
  onClose,
}: {
  sub: MySubscription;
  addonId: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addon = ADDONS.find((a) => a.id === addonId);
  if (!addon) return null;
  const lines: AddonLine[] = ADDONS.map((a) => ({
    addonId: a.id,
    quantity: Math.max(0, owned(sub, a.id) - (a.id === addonId ? 1 : 0)),
  }));
  const after = limitsFor({ ...sub, addons: lines });
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal onClose={close}>
      <h3 className="font-display text-xl text-foreground">Remove 1 {addon.name.toLowerCase()}?</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Your plan will allow {limitText(addon.limitKey, after[addon.limitKey])}. If you have more
        than that, you'll choose which stay active. It takes effect now. No refund for the period
        that's running.
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
        <button type="button" onClick={close} disabled={busy} className={secondaryBtn}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = getPlanState().live ? await removeAddonsLive(lines) : removeAddons(lines);
            setBusy(false);
            if (!res.ok) {
              setError(res.message);
              return;
            }
            toast.success("Add-on removed.", { description: "Nothing was charged." });
            onClose();
          }}
          className={primaryBtn}
        >
          Remove
        </button>
      </div>
    </Modal>
  );
}

/**
 * The add-ons on the manager's plan, and buying more (a sample payment).
 * Paid monthly or yearly plans only; nothing to buy inside the Android app.
 */
export function AddonsSection({
  sub,
  inApp,
  owner = true,
  preset,
  onPresetUsed,
}: {
  sub: MySubscription;
  inApp: boolean;
  /** The signed-in account pays for the plan (a co-manager only sees it). */
  owner?: boolean;
  /** Open the purchase with this add-on one higher (from a limit message). */
  preset?: string;
  onPresetUsed?: () => void;
}) {
  const blocked = owner ? addonsBlocked(sub) : "Only the household's primary manager buys add-ons.";
  const [open, setOpen] = useState<{ preset?: string } | null>(() =>
    preset && !inApp && !blocked ? { preset } : null,
  );
  const [removing, setRemoving] = useState<string | null>(null);
  // The link's job is done once it has opened the purchase; clear it so a reload doesn't reopen it.
  useEffect(() => {
    if (preset) onPresetUsed?.();
  }, [preset, onPresetUsed]);

  return (
    <section id="addons" className={card} aria-labelledby="addons-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="addons-heading" className="font-display text-xl text-foreground">
            Add-ons
          </h2>
          <p className="text-xs text-muted-foreground">
            Extra room on top of your plan, billed with it.
          </p>
        </div>
        {!inApp && !blocked ? (
          <button type="button" onClick={() => setOpen({})} className={primaryBtn}>
            Buy add-ons
          </button>
        ) : null}
      </div>
      <ul className="mt-4 divide-y divide-border">
        {ADDONS.map((a) => {
          const n = owned(sub, a.id);
          return (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{a.name}</span>
                <span className="block text-xs text-muted-foreground">
                  Adds {limitText(a.limitKey, a.step)}
                  {inApp ? "" : `, ${formatCentavos(a.monthlyPrice)} a month`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="text-sm tabular-nums text-foreground">
                  {n === 0
                    ? "None"
                    : `${n} ${n === 1 ? LIMIT_LABEL[a.limitKey].one : LIMIT_LABEL[a.limitKey].many}`}
                </span>
                {n > 0 && !inApp && !blocked ? (
                  <button
                    type="button"
                    aria-label={`Remove one ${a.name}`}
                    onClick={() => setRemoving(a.id)}
                    className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0"
                  >
                    Remove…
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {blocked && !inApp ? <p className="mt-3 text-sm text-muted-foreground">{blocked}</p> : null}
      {inApp ? (
        <p className="mt-3 text-sm text-muted-foreground">Add-ons can't be bought in the app.</p>
      ) : null}
      {open ? <AddonsModal sub={sub} preset={open.preset} onClose={() => setOpen(null)} /> : null}
      {removing ? (
        <RemoveAddonModal sub={sub} addonId={removing} onClose={() => setRemoving(null)} />
      ) : null}
    </section>
  );
}
