import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";

import { fmtCentavos, pesosToCentavos } from "../money";
import { savePlanFn } from "../plan.actions";
import { quoteAmount } from "../plan.pricing";
import type { Plan, PlanInterval } from "../plan.types";

const PREVIEW_SEATS = { helpers: 2, managers: 1, homes: 1 };
const INTERVALS: PlanInterval[] = ["monthly", "yearly", "one_time"];

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const checkCls = "h-4 w-4 accent-primary";

type Form = {
  name: string;
  tagline: string;
  inclusions: string;
  interval: PlanInterval;
  base: string;
  trialDays: string;
  sortOrder: string;
  isPublic: boolean;
  included: Record<Dim, { unlimited: boolean; value: string }>;
  extra: Record<Dim, { notSold: boolean; value: string }>;
};
type Dim = "helper" | "manager" | "home";
const DIMS: { dim: Dim; label: string }[] = [
  { dim: "helper", label: "helpers" },
  { dim: "manager", label: "managers" },
  { dim: "home", label: "homes" },
];

const pesosText = (centavos: number) => (centavos / 100).toFixed(2);

function toForm(plan: Plan | null): Form {
  if (!plan) {
    return {
      name: "",
      tagline: "",
      inclusions: "",
      interval: "monthly",
      base: "",
      trialDays: "0",
      sortOrder: "0",
      isPublic: true,
      included: {
        helper: { unlimited: false, value: "1" },
        manager: { unlimited: false, value: "1" },
        home: { unlimited: true, value: "" },
      },
      extra: {
        helper: { notSold: true, value: "" },
        manager: { notSold: true, value: "" },
        home: { notSold: true, value: "" },
      },
    };
  }
  const inc = (n: number | null) => ({ unlimited: n === null, value: n === null ? "" : String(n) });
  const ext = (c: number | null) => ({
    notSold: c === null,
    value: c === null ? "" : pesosText(c),
  });
  return {
    name: plan.name,
    tagline: plan.tagline,
    inclusions: plan.inclusions.join("\n"),
    interval: plan.interval,
    base: pesosText(plan.baseCentavos),
    trialDays: String(plan.trialDays),
    sortOrder: String(plan.sortOrder),
    isPublic: plan.isPublic,
    included: {
      helper: inc(plan.includedHelpers),
      manager: inc(plan.includedManagers),
      home: inc(plan.includedHomes),
    },
    extra: {
      helper: ext(plan.extraHelperCentavos),
      manager: ext(plan.extraManagerCentavos),
      home: ext(plan.extraHomeCentavos),
    },
  };
}

/** A non-negative number from text, or null when it isn't one. */
function parseNonNegative(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const PESOS_ERROR = "Use pesos with up to two decimals";

type Built = { plan: Plan; errors: Record<string, string> };

/** Reads the form into a Plan; `errors` is empty when the plan can be saved. */
function build(form: Form, existing: Plan | null): Built {
  const errors: Record<string, string> = {};
  if (form.name.trim() === "") errors.name = "Give the plan a name.";
  else if (form.name.trim().length > 60) errors.name = "Keep the name to 60 characters.";

  const base = pesosToCentavos(form.base);
  if (base === null) errors.base = PESOS_ERROR;

  const trial = parseNonNegative(form.trialDays);
  if (trial === null || !Number.isInteger(trial)) errors.trialDays = "Whole days, zero or more.";

  const sort = Number(form.sortOrder);
  if (!Number.isInteger(sort)) errors.sortOrder = "A whole number.";

  const included = {} as Record<Dim, number | null>;
  const extra = {} as Record<Dim, number | null>;
  for (const { dim } of DIMS) {
    const inc = form.included[dim];
    if (inc.unlimited) included[dim] = null;
    else {
      const n = parseNonNegative(inc.value);
      if (n === null || !Number.isInteger(n))
        errors[`included-${dim}`] = "Whole seats, zero or more.";
      included[dim] = n;
    }
    const ex = form.extra[dim];
    if (ex.notSold || inc.unlimited) extra[dim] = null;
    else {
      const n = pesosToCentavos(ex.value);
      if (n === null) errors[`extra-${dim}`] = PESOS_ERROR;
      extra[dim] = n;
    }
  }

  const plan: Plan = {
    id: existing?.id ?? "",
    name: form.name.trim(),
    tagline: form.tagline.trim(),
    inclusions: form.inclusions
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== ""),
    interval: form.interval,
    baseCentavos: base ?? 0,
    includedHelpers: included.helper,
    includedManagers: included.manager,
    includedHomes: included.home,
    extraHelperCentavos: extra.helper,
    extraManagerCentavos: extra.manager,
    extraHomeCentavos: extra.home,
    trialDays: trial === null ? 0 : trial,
    isPublic: form.isPublic,
    status: existing?.status ?? "draft",
    sortOrder: Number.isInteger(sort) ? sort : 0,
  };
  return { plan, errors };
}

function previewText(plan: Plan): string {
  const quote = quoteAmount(plan, PREVIEW_SEATS);
  const who = "A household with 2 helpers, 1 manager, 1 home";
  if (quote.ok) return `${who} pays ${fmtCentavos(quote.amountCentavos)}.`;
  return `${who} can't buy this plan: there is no price for extra ${quote.over}s.`;
}

export function PlanFormModal({
  token,
  plan,
  onClose,
  onSaved,
}: {
  token: string;
  plan: Plan | null;
  onClose: () => void;
  onSaved: (saved: Plan) => void;
}) {
  const [form, setForm] = useState<Form>(() => toForm(plan));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setIncluded = (dim: Dim, patch: Partial<Form["included"][Dim]>) =>
    setForm((f) => ({
      ...f,
      included: { ...f.included, [dim]: { ...f.included[dim], ...patch } },
    }));
  const setExtra = (dim: Dim, patch: Partial<Form["extra"][Dim]>) =>
    setForm((f) => ({ ...f, extra: { ...f.extra, [dim]: { ...f.extra[dim], ...patch } } }));

  const built = build(form, plan);
  const previewable = Object.keys(built.errors).length === 0;

  async function save() {
    const { plan: next, errors: found } = build(form, plan);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const saved = await savePlanFn({ data: { token, plan: next } });
      toast.success(plan ? "Plan saved." : "Plan created.");
      onSaved(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the plan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} size="lg">
      <h2 className="font-display text-xl text-foreground">{plan ? "Edit plan" : "New plan"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Prices are final, in pesos, with tax included.
      </p>

      <div className="mt-5 space-y-4">
        <Field label="Name" error={errors.name}>
          <input
            className={inputCls}
            value={form.name}
            aria-invalid={Boolean(errors.name)}
            maxLength={60}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label="Tagline">
          <input
            className={inputCls}
            value={form.tagline}
            onChange={(e) => set("tagline", e.target.value)}
          />
        </Field>
        <Field label="What is included (one per line)">
          <textarea
            className={`${inputCls} h-24 py-2`}
            value={form.inclusions}
            onChange={(e) => set("inclusions", e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Billing">
            <select
              className={inputCls}
              value={form.interval}
              onChange={(e) => set("interval", e.target.value as PlanInterval)}
            >
              {INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {i === "one_time" ? "One-time" : i === "monthly" ? "Monthly" : "Yearly"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Base price (pesos)" error={errors.base}>
            <input
              className={inputCls}
              inputMode="decimal"
              value={form.base}
              aria-invalid={Boolean(errors.base)}
              onChange={(e) => set("base", e.target.value)}
            />
          </Field>
          <Field label="Free trial (days)" error={errors.trialDays}>
            <input
              className={inputCls}
              inputMode="numeric"
              value={form.trialDays}
              aria-invalid={Boolean(errors.trialDays)}
              onChange={(e) => set("trialDays", e.target.value)}
            />
          </Field>
          <Field label="Order on the pricing page" error={errors.sortOrder}>
            <input
              className={inputCls}
              inputMode="numeric"
              value={form.sortOrder}
              aria-invalid={Boolean(errors.sortOrder)}
              onChange={(e) => set("sortOrder", e.target.value)}
            />
          </Field>
        </div>

        <div className="divide-y divide-border/60 rounded-2xl border border-border/60">
          {DIMS.map(({ dim, label }) => {
            const inc = form.included[dim];
            const ex = form.extra[dim];
            return (
              <div key={dim} className="space-y-3 p-4">
                <p className="text-sm font-semibold text-foreground">Included {label}</p>
                <div className="grid items-end gap-3 sm:grid-cols-2">
                  <Field label={`Included ${label}`} error={errors[`included-${dim}`]}>
                    <input
                      className={inputCls}
                      inputMode="numeric"
                      value={inc.value}
                      disabled={inc.unlimited}
                      aria-invalid={Boolean(errors[`included-${dim}`])}
                      onChange={(e) => setIncluded(dim, { value: e.target.value })}
                    />
                  </Field>
                  <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className={checkCls}
                      checked={inc.unlimited}
                      onChange={(e) => setIncluded(dim, { unlimited: e.target.checked })}
                    />
                    Unlimited {label}
                  </label>
                  <Field label={`Price per extra ${dim} (pesos)`} error={errors[`extra-${dim}`]}>
                    <input
                      className={inputCls}
                      inputMode="decimal"
                      value={ex.value}
                      disabled={ex.notSold || inc.unlimited}
                      aria-invalid={Boolean(errors[`extra-${dim}`])}
                      onChange={(e) => setExtra(dim, { value: e.target.value })}
                    />
                  </Field>
                  <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className={checkCls}
                      checked={ex.notSold || inc.unlimited}
                      disabled={inc.unlimited}
                      onChange={(e) => setExtra(dim, { notSold: e.target.checked })}
                    />
                    Extra {label} not sold
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className={checkCls}
            checked={form.isPublic}
            onChange={(e) => set("isPublic", e.target.checked)}
          />
          Show on the public pricing page once active
        </label>

        <p role="status" className="rounded-xl bg-muted px-3 py-2.5 text-sm text-foreground">
          {previewable ? previewText(built.plan) : "Fix the highlighted fields to see a price."}
        </p>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save plan"}
        </button>
      </div>
    </Modal>
  );
}
