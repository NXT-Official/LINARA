import { Loader2, Plus, Repeat, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";
import { useAppStores } from "@/features/dashboard/app-store-context";
import { parseAmount } from "@/features/pantry/pantry.utils";
import { HelperPicker } from "@/features/teams/components/helper-picker";

import { useGrocery } from "../grocery-context";
import type { GroceryTemplate, TemplateDraft, TemplateItem } from "../grocery.types";
import { WEEKDAYS, fmtPeso, isoDate, nextDue } from "../grocery.utils";

/**
 * Repeat runs ("Weekly palengke"): the usual name, day, team, people, cash
 * and items. Start makes a draft run from one (start_grocery_run), pulling
 * matching lines out of Needed instead of listing them twice.
 */
export function RepeatsList({ onStarted }: { onStarted: (runId: string) => void }) {
  const ctx = useGrocery();
  const { teams } = useAppStores();
  const [editing, setEditing] = useState<GroceryTemplate | "new" | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const start = async (t: GroceryTemplate) => {
    setStarting(t.id);
    try {
      onStarted(await ctx.startTemplate(t.id, nextDue(t, new Date())?.date ?? isoDate(new Date())));
    } catch {
      // useGroceryList already said what went wrong.
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          The runs you make every week. Start one and it becomes a draft to check and send.
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-primary ring-1 ring-primary/30 hover:bg-primary/5"
        >
          <Plus className="h-3.5 w-3.5" /> New repeat
        </button>
      </div>
      {ctx.templates.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No repeats yet. Make one here, or save a run as a repeat.
        </p>
      ) : (
        <ul className="divide-y divide-border/70">
          {ctx.templates.map((t) => {
            const meta = [
              t.weekday === null ? "No fixed day" : `Every ${WEEKDAYS[t.weekday]}`,
              t.teamId && teams.teamById.get(t.teamId)?.name,
              `${t.items.length} ${t.items.length === 1 ? "item" : "items"}`,
              t.cashDefault !== null && `${fmtPeso(t.cashDefault)} cash`,
            ].filter(Boolean);
            return (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => setEditing(t)}
                  className="min-w-0 flex-1 text-left"
                  aria-label={`Edit ${t.title}`}
                >
                  <span className="block truncate text-sm font-semibold text-foreground hover:underline">
                    {t.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {meta.join(" · ")}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={starting !== null}
                  onClick={() => void start(t)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-primary/30 hover:bg-primary/5 disabled:opacity-50"
                >
                  {starting === t.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Start
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <TemplateModal
          template={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

const FIELD =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";

function TemplateModal({ template, onClose }: { template?: GroceryTemplate; onClose: () => void }) {
  const ctx = useGrocery();
  const { teams, activeHelpers } = useAppStores();
  const [draft, setDraft] = useState<TemplateDraft>(
    template
      ? {
          title: template.title,
          teamId: template.teamId,
          weekday: template.weekday,
          cashDefault: template.cashDefault,
          shopperIds: template.shopperIds,
          items: template.items,
        }
      : { title: "", teamId: null, weekday: 6, cashDefault: null, shopperIds: [], items: [] },
  );
  const [cash, setCash] = useState(
    template?.cashDefault != null ? String(template.cashDefault) : "",
  );
  const [line, setLine] = useState({ name: "", qty: "1", unit: "pcs" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  const set = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const helperName = (id: string) => activeHelpers.find((h) => h.id === id)?.name ?? "Someone";
  // Someone who no longer works here stays listed only until this is saved.
  const shoppers = draft.shopperIds.filter((id) => activeHelpers.some((h) => h.id === id));

  const addLine = () => {
    const n = parseAmount(line.qty);
    if (!line.name.trim()) return setError("Type what to buy.");
    if (n === null || n === 0) return setError("Qty: a number above 0.");
    setError(null);
    set("items", [
      ...draft.items,
      { name: line.name.trim(), qty: n, unit: line.unit.trim() || "pcs", pantryItemId: null },
    ]);
    setLine({ name: "", qty: "1", unit: "pcs" });
  };

  const copyNeeded = () => {
    const have = new Set(draft.items.map((i) => i.name.toLowerCase()));
    const extra: TemplateItem[] = ctx.needed
      .filter((g) => !g.bought && !have.has(g.name.toLowerCase()))
      .map((g) => ({
        name: g.name,
        qty: g.qty,
        unit: g.unit,
        pantryItemId: g.pantryItemId ?? null,
      }));
    set("items", [...draft.items, ...extra]);
  };

  const save = async () => {
    if (!draft.title.trim()) return setError("Give it a name, like “Weekly palengke”.");
    const c = cash.trim() === "" ? null : Number(cash.replace(/[,₱\s]/g, ""));
    if (c !== null && (!Number.isFinite(c) || c < 0)) {
      return setError("Usual cash: an amount in pesos, or empty.");
    }
    setError(null);
    setBusy("save");
    try {
      await ctx.saveTemplate({ ...draft, shopperIds: shoppers, cashDefault: c }, template?.id);
      toast.success("Repeat saved.");
      onClose();
    } catch {
      // useGroceryList already said what went wrong.
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!template) return;
    setBusy("delete");
    try {
      await ctx.deleteTemplate(template.id);
      toast.success("Repeat deleted. Runs made from it stay.");
      onClose();
    } catch {
      // useGroceryList already said what went wrong.
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl text-foreground">
          {template ? template.title : "New repeat"}
        </h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name">
            <input
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Weekly palengke"
              maxLength={60}
              className={FIELD}
            />
          </Field>
        </div>
        <Field label="Every">
          <select
            value={draft.weekday ?? ""}
            onChange={(e) => set("weekday", e.target.value === "" ? null : Number(e.target.value))}
            className={FIELD}
          >
            <option value="">No fixed day</option>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Usual cash (₱)">
          <input
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            inputMode="decimal"
            placeholder="None"
            className={FIELD}
          />
        </Field>
        {teams.available && teams.teams.length > 0 && (
          <Field label="For team">
            <select
              value={draft.teamId ?? ""}
              onChange={(e) => set("teamId", e.target.value || null)}
              className={FIELD}
            >
              <option value="">No team</option>
              {teams.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="sm:col-span-2" role="group" aria-label="Who usually goes">
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
            Who usually goes
          </span>
          {shoppers.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {shoppers.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    set(
                      "shopperIds",
                      shoppers.filter((x) => x !== id),
                    )
                  }
                  aria-label={`Take ${helperName(id)} off this repeat`}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:border-primary"
                >
                  {helperName(id)} <X className="h-3 w-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
          <HelperPicker
            helpers={activeHelpers.filter((h) => !shoppers.includes(h.id))}
            value=""
            onChange={(id) => id && set("shopperIds", [...shoppers, id])}
            ariaLabel="Add someone to this repeat"
            before={[{ value: "", label: "Add someone…" }]}
          />
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Usual items · {draft.items.length}
          </span>
          {ctx.needed.some((g) => !g.bought) && (
            <button
              type="button"
              onClick={copyNeeded}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
            >
              Copy what&apos;s in Needed
            </button>
          )}
        </div>
        <ul className="divide-y divide-border/70">
          {draft.items.map((it, i) => (
            <li key={`${it.name}-${i}`} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{it.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {it.qty} {it.unit}
              </span>
              <button
                type="button"
                onClick={() =>
                  set(
                    "items",
                    draft.items.filter((_, j) => j !== i),
                  )
                }
                aria-label={`Remove ${it.name}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-2xl bg-background/60 p-3">
          <label className="min-w-0 basis-full sm:basis-auto sm:flex-1">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              Add an item
            </span>
            <input
              value={line.name}
              onChange={(e) => setLine((l) => ({ ...l, name: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addLine()}
              placeholder="e.g. Itlog"
              className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="w-16">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Qty</span>
            <input
              value={line.qty}
              onChange={(e) => setLine((l) => ({ ...l, qty: e.target.value }))}
              inputMode="decimal"
              className="w-full rounded-xl border border-input bg-card px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
            />
          </label>
          <label className="w-20">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Unit</span>
            <input
              value={line.unit}
              onChange={(e) => setLine((l) => ({ ...l, unit: e.target.value }))}
              className="w-full rounded-xl border border-input bg-card px-2 py-2 text-center text-sm outline-none focus:border-primary"
            />
          </label>
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-primary ring-1 ring-primary/30 hover:bg-primary/5"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
      <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/40 pt-4">
        {template && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void remove()}
            className="mr-auto inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            {busy === "delete" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}{" "}
            Delete
          </button>
        )}
        <button
          onClick={onClose}
          disabled={busy !== null}
          className="rounded-lg px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          onClick={() => void save()}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
        >
          {busy === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </button>
      </div>
    </Modal>
  );
}
