import { Check, Info, Lock, Minus, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/shared/modal";
import { inMobileApp } from "@/lib/mobile-app";

import { usePlanUsage } from "../hooks/use-plan-usage";
import {
  CYCLE_LABEL,
  cyclesOf,
  formatCentavos,
  graceEndsAt,
  hasFeature,
  LIMIT_LABEL,
  limitText,
  limitsFor,
  MAX_ADDON_QUANTITY,
  overLimits,
  planById,
  priceText,
  quote,
} from "../plan.logic";
import { ADDONS, CATALOG, FEATURES } from "../plan.sample";
import { changePlan, previewStatus, resetPlan, usePlan } from "../plan.store";
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

function UsageRow({ k, used, limit }: { k: LimitKey; used: number; limit: number | null }) {
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
          {used - limit} over. Add more with an add-on, or choose a bigger plan.
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
  const after = overLimits({ ...sub, planId, addons }, usage);
  const [error, setError] = useState<string | null>(null);

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
      <p className="mt-1 text-sm text-muted-foreground">The new plan starts today. {SAMPLE}</p>

      <fieldset className="mt-4">
        <legend className="text-xs font-semibold text-muted-foreground">Plan</legend>
        <div className="mt-1.5 divide-y divide-border rounded-2xl border border-border">
          {CATALOG.map((p) => {
            const chosen = p.id === planId;
            return (
              <label
                key={p.id}
                className={`flex min-h-14 cursor-pointer items-start gap-3 px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl ${chosen ? "bg-secondary/70" : "hover:bg-secondary/40"}`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={p.id}
                  checked={chosen}
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
                onClick={() => setCycle(c)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${cycle === c ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`}
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

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-foreground" aria-live="polite">
          {q.ok ? priceText(q.amount, cycle) : q.message}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!q.ok}
            onClick={() => {
              const res = changePlan(planId, cycle, addons);
              if (!res.ok) {
                setError(res.message);
                return;
              }
              toast.success(`You're on ${plan.name}.`, { description: SAMPLE });
              onClose();
            }}
            className={primaryBtn}
          >
            Change plan
          </button>
        </div>
      </div>
    </Modal>
  );
}

const PREVIEW: { value: SubStatus; label: string }[] = [
  { value: "active", label: "Paid" },
  { value: "trialing", label: "On trial" },
  { value: "past_due", label: "Payment failed" },
  { value: "restricted", label: "Grace over" },
];

/** The manager's plan, usage and add-ons, on sample data until billing is live. */
export function MyPlanPage() {
  const { subscription: sub } = usePlan();
  const usage = usePlanUsage();
  const [changing, setChanging] = useState(false);
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
            A preview: billing isn't live yet, so nothing here charges you.
          </p>
        </div>
        <span className="inline-flex rounded-full bg-terracotta-soft px-2.5 py-1 text-xs font-semibold text-hearth-ink">
          Preview
        </span>
      </div>

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
          {!inApp ? (
            <button type="button" onClick={() => setChanging(true)} className={primaryBtn}>
              Change plan
            </button>
          ) : null}
        </div>
        <p
          className={`mt-4 rounded-xl px-3 py-2 text-sm ${
            status.tone === "late"
              ? "bg-status-late-soft text-status-late-ink"
              : status.tone === "warn"
                ? "bg-terracotta-soft text-hearth-ink"
                : "bg-secondary text-pine-deep"
          }`}
        >
          {status.text}
        </p>
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
            Kasambahay counts this household for now; across all your households once billing is
            live.
          </p>
          <ul className="divide-y divide-border">
            {(Object.keys(limits) as LimitKey[]).map((k) => (
              <UsageRow key={k} k={k} used={usage[k]} limit={limits[k]} />
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

      {changing ? (
        <ChangePlanModal sub={sub} usage={usage} onClose={() => setChanging(false)} />
      ) : null}
    </div>
  );
}
