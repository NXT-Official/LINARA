import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { fmtCentavos } from "@/features/billing/money";

import {
  deleteCostEntryFn,
  listCostEntriesFn,
  listModelPricesFn,
  saveModelPriceFn,
} from "../analytics.actions";
import type { CostEntry, ModelPrice } from "../analytics.types";
import { monthHeading } from "../analytics.utils";
import { CostEntryModal } from "../components/cost-entry-modal";
import { usePlatformAdminSession } from "../hooks/use-platform-admin-session";

type Load =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unavailable" }
  | { kind: "ready"; entries: CostEntry[] };

type PriceLoad =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unavailable" }
  | { kind: "ready"; prices: ModelPrice[] };

const actionCls =
  "rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50";
const primaryCls =
  "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50";
const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground";

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function groupByMonth(entries: CostEntry[]): { month: string; items: CostEntry[] }[] {
  const groups: { month: string; items: CostEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.month === e.month) last.items.push(e);
    else groups.push({ month: e.month, items: [e] });
  }
  return groups;
}

/** Linara admin: log what Linara spends, and price the AI models. */
export function PlatformAdminCostsPage() {
  const { status, token } = usePlatformAdminSession();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [editing, setEditing] = useState<CostEntry | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoad({ kind: "loading" });
    try {
      const res = await listCostEntriesFn({ data: { token } });
      setLoad(res.available ? { kind: "ready", entries: res.entries } : { kind: "unavailable" });
    } catch {
      setLoad({ kind: "error" });
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function remove(entry: CostEntry) {
    if (!token) return;
    setBusyId(entry.id);
    try {
      const res = await deleteCostEntryFn({ data: { token, id: entry.id } });
      if (!res.available) {
        toast.error("Costs aren't switched on yet.");
        return;
      }
      setLoad((l) =>
        l.kind === "ready"
          ? { kind: "ready", entries: l.entries.filter((e) => e.id !== entry.id) }
          : l,
      );
      toast.success("Cost deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the cost.");
    } finally {
      setBusyId(null);
    }
  }

  function onSaved(saved: CostEntry) {
    setLoad((l) => {
      if (l.kind !== "ready") return l;
      const exists = l.entries.some((e) => e.id === saved.id);
      const entries = exists
        ? l.entries.map((e) => (e.id === saved.id ? saved : e))
        : [saved, ...l.entries];
      return {
        kind: "ready",
        entries: [...entries].sort((a, b) => b.month.localeCompare(a.month)),
      };
    });
    setEditing(null);
  }

  if (status === "loading" || (token && load.kind === "loading")) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading costs…
      </p>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-8">
      <section aria-labelledby="costs-heading">
        <div className="flex items-center justify-between gap-3">
          <h1 id="costs-heading" className="font-display text-2xl text-foreground">
            Costs
          </h1>
          {load.kind === "ready" && load.entries.length > 0 && (
            <button type="button" className={primaryCls} onClick={() => setEditing("new")}>
              Add cost
            </button>
          )}
        </div>

        {load.kind === "error" && (
          <div
            role="alert"
            className="mt-4 rounded-3xl border border-border/60 bg-card p-6 text-sm shadow-soft"
          >
            <p className="text-foreground">Couldn&rsquo;t load the costs.</p>
            <button type="button" className={`${actionCls} mt-3`} onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        )}
        {load.kind === "unavailable" && (
          <p className="mt-4 rounded-3xl border border-border/60 bg-card p-6 text-sm text-muted-foreground shadow-soft">
            Costs aren&rsquo;t switched on yet. Apply the platform analytics SQL, then reload.
          </p>
        )}
        {load.kind === "ready" && load.entries.length === 0 && (
          <div className="mt-4 rounded-3xl border border-border/60 bg-card p-6 shadow-soft">
            <p className="font-display text-lg text-foreground">No costs recorded</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add hosting, tools and other monthly costs so profit on the overview is true.
            </p>
            <button
              type="button"
              className={`${primaryCls} mt-4`}
              onClick={() => setEditing("new")}
            >
              Add cost
            </button>
          </div>
        )}
        {load.kind === "ready" &&
          groupByMonth(load.entries).map((group) => (
            <div key={group.month} className="mt-4">
              <h2 className="text-sm font-semibold text-foreground">{monthHeading(group.month)}</h2>
              <ul className="mt-2 divide-y divide-border/60 rounded-3xl border border-border/60 bg-card shadow-soft">
                {group.items.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{entry.label}</p>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">
                        {capitalise(entry.category)}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {fmtCentavos(entry.amountCentavos)}
                      </p>
                      <button
                        type="button"
                        className={actionCls}
                        aria-label={`Edit ${entry.label}`}
                        onClick={() => setEditing(entry)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={actionCls}
                        aria-label={`Delete ${entry.label}`}
                        disabled={busyId === entry.id}
                        onClick={() => void remove(entry)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </section>

      <ModelPricesSection token={token} />

      {editing !== null && (
        <CostEntryModal
          token={token}
          entry={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function ModelPricesSection({ token }: { token: string }) {
  const [load, setLoad] = useState<PriceLoad>({ kind: "loading" });

  const refresh = useCallback(async () => {
    setLoad({ kind: "loading" });
    try {
      const res = await listModelPricesFn({ data: { token } });
      setLoad(res.available ? { kind: "ready", prices: res.prices } : { kind: "unavailable" });
    } catch {
      setLoad({ kind: "error" });
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function onSaved(saved: ModelPrice) {
    setLoad((l) => {
      if (l.kind !== "ready") return l;
      const exists = l.prices.some((p) => p.model === saved.model);
      const prices = exists
        ? l.prices.map((p) => (p.model === saved.model ? saved : p))
        : [...l.prices, saved];
      return { kind: "ready", prices: [...prices].sort((a, b) => a.model.localeCompare(b.model)) };
    });
  }

  return (
    <section aria-labelledby="prices-heading">
      <h2 id="prices-heading" className="font-display text-xl text-foreground">
        Model prices
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        What each AI model costs you, in pesos. The overview prices AI calls from these.
      </p>
      <div className="mt-3 rounded-3xl border border-border/60 bg-card shadow-soft">
        {load.kind === "loading" && (
          <p role="status" className="p-6 text-sm text-muted-foreground">
            Loading model prices…
          </p>
        )}
        {load.kind === "error" && (
          <div role="alert" className="p-6 text-sm">
            <p className="text-foreground">Couldn&rsquo;t load the model prices.</p>
            <button type="button" className={`${actionCls} mt-3`} onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        )}
        {load.kind === "unavailable" && (
          <p className="p-6 text-sm text-muted-foreground">
            Model prices aren&rsquo;t switched on yet. Apply the platform analytics SQL, then
            reload.
          </p>
        )}
        {load.kind === "ready" && (
          <ul className="divide-y divide-border/60">
            {load.prices.map((p) => (
              <PriceRow key={p.model} token={token} price={p} onSaved={onSaved} />
            ))}
            <PriceRow key="new" token={token} price={null} onSaved={onSaved} />
          </ul>
        )}
      </div>
    </section>
  );
}

const toPesos = (centavos: number) => String(centavos / 100);

function PriceRow({
  token,
  price,
  onSaved,
}: {
  token: string;
  price: ModelPrice | null;
  onSaved: (saved: ModelPrice) => void;
}) {
  const [model, setModel] = useState(price?.model ?? "");
  const [input, setInput] = useState(price ? toPesos(price.inputCentavosPer1m) : "");
  const [output, setOutput] = useState(price ? toPesos(price.outputCentavosPer1m) : "");
  const [audio, setAudio] = useState(price ? toPesos(price.audioCentavosPerMinute) : "");
  const [note, setNote] = useState(price?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isNew = price === null;

  async function save() {
    const parsed = [input, output, audio].map((v) => (v.trim() === "" ? 0 : Number(v)));
    if (!model.trim()) {
      setError("Name the model.");
      return;
    }
    if (parsed.some((n) => !Number.isFinite(n) || n < 0)) {
      setError("Prices must be ₱0 or more.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await saveModelPriceFn({
        data: {
          token,
          price: {
            model: model.trim(),
            inputCentavosPer1m: Math.round(parsed[0] * 100),
            outputCentavosPer1m: Math.round(parsed[1] * 100),
            audioCentavosPerMinute: Math.round(parsed[2] * 100),
            note: note.trim() === "" ? null : note.trim(),
          },
        },
      });
      if (!res.available || !res.price) {
        toast.error("Model prices aren't switched on yet.");
        return;
      }
      toast.success("Price saved.");
      onSaved(res.price);
      if (isNew) {
        setModel("");
        setInput("");
        setOutput("");
        setAudio("");
        setNote("");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the price.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="space-y-3 p-4 sm:px-5">
      {isNew ? (
        <Field label="New model" error={error}>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            aria-invalid={error !== null}
            className={inputCls}
          />
        </Field>
      ) : (
        <>
          <h3 className="text-sm font-semibold text-foreground">{model}</h3>
          {error && (
            <p role="alert" className="text-[13px] font-semibold text-destructive">
              {error}
            </p>
          )}
        </>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Input ₱ per 1M tokens">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Output ₱ per 1M tokens">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Audio ₱ per minute">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={audio}
            onChange={(e) => setAudio(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Note">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputCls}
        />
      </Field>
      <button type="button" className={actionCls} disabled={saving} onClick={() => void save()}>
        {saving ? "Saving…" : isNew ? "Add model" : "Save"}
      </button>
    </li>
  );
}
