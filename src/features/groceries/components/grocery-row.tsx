import { Check, Package, Pencil, Plus, Undo2, X } from "lucide-react";
import { useState } from "react";

import { fmtPeso, fmtQty } from "../grocery.utils";
import type { GroceryItem } from "../grocery.types";

type Patch = { name: string; qty: number; unit: string };

/**
 * One item. Bought/cost are real, mostly set by LINARA_MOBILE (see
 * KNOWN_GAPS.md Closed Gap C13); `onToggleBought` lets a manager who did the
 * shopping tick it here too. Edit and remove are only passed for
 * not-yet-bought items: curating the plan, not touching a completed
 * purchase. A
 * suggestion (from a low pantry item) lives only in this browser until it's
 * added, so it says so and offers "Add to list". On a run, `unlist` makes
 * the X put the line back in the Needed pool instead of deleting it, and
 * `onCost` lets whoever enters the figures type what a bought line cost.
 */
export function GroceryRow({
  item,
  onRemove,
  onEdit,
  onAddSuggestion,
  onToggleBought,
  onCost,
  unlist = false,
  tone,
}: {
  item: GroceryItem;
  onRemove?: () => void;
  onEdit?: (patch: Patch) => void;
  onAddSuggestion?: () => void;
  onToggleBought?: () => void;
  onCost?: (cost: number | null) => void;
  /** The X moves it back to Needed rather than deleting it. */
  unlist?: boolean;
  tone?: "light";
}) {
  const suggested = item.id.startsWith("sug-");
  const [editing, setEditing] = useState(false);

  if (editing && onEdit) {
    return (
      <GroceryEditRow
        item={item}
        onCancel={() => setEditing(false)}
        onSave={(patch) => {
          onEdit(patch);
          setEditing(false);
        }}
      />
    );
  }

  const canEdit = !!onEdit && !suggested && !item.bought;
  return (
    <div className={`flex items-center gap-1.5 py-1.5 ${tone === "light" ? "px-2" : ""}`}>
      {/* The tap target is 40px; the circle drawn inside it stays 28px. */}
      {onToggleBought && !suggested ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={item.bought}
          aria-label={`Bought ${item.name}`}
          onClick={onToggleBought}
          className="group -ml-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-full"
        >
          <span
            className={`grid h-7 w-7 place-items-center rounded-full border transition ${
              item.bought
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-transparent group-hover:border-primary group-hover:text-primary/40"
            }`}
          >
            <Check className="h-3.5 w-3.5" />
          </span>
        </button>
      ) : (
        <div aria-hidden className="-ml-1.5 grid h-10 w-10 shrink-0 place-items-center">
          <span
            className={`grid h-7 w-7 place-items-center rounded-full border ${
              item.bought
                ? "border-primary bg-primary text-primary-foreground"
                : suggested
                  ? "border-dashed border-border bg-card text-transparent"
                  : "border-border bg-card text-transparent"
            }`}
          >
            <Check className="h-3.5 w-3.5" />
          </span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div
          className={`flex items-center gap-1.5 text-sm ${item.bought ? "text-muted-foreground" : "text-foreground"}`}
        >
          {canEdit ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="group inline-flex min-w-0 items-center gap-1 text-left"
              aria-label={`Edit ${item.name}`}
            >
              <span className="truncate font-medium group-hover:underline">{item.name}</span>
              <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
            </button>
          ) : (
            <span className={`truncate font-medium ${item.bought ? "line-through" : ""}`}>
              {item.name}
            </span>
          )}
          {item.pantryItemId && (
            <span className="shrink-0 text-muted-foreground" title="Restocks the pantry">
              <Package className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">, restocks the pantry</span>
            </span>
          )}
        </div>
        {suggested && !item.bought && (
          <span className="mt-0.5 inline-block rounded-full bg-secondary px-1.5 py-0.5 text-xs font-semibold text-pine-deep">
            Suggested, not on the list yet
          </span>
        )}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {fmtQty(item.qty, item.unit)}
      </span>
      {item.bought && onCost ? (
        <CostInput key={item.costPHP ?? "none"} item={item} onCost={onCost} />
      ) : (
        item.bought &&
        item.costPHP != null && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {fmtPeso(item.costPHP)}
          </span>
        )
      )}
      {suggested && onAddSuggestion && (
        <button
          onClick={onAddSuggestion}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-primary/30 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
        >
          <Plus className="h-3 w-3" /> Add to list
        </button>
      )}
      {onRemove && !item.bought && (
        <button
          onClick={onRemove}
          className="-mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
          aria-label={
            suggested
              ? `Dismiss ${item.name}`
              : unlist
                ? `Move ${item.name} back to Needed`
                : `Remove ${item.name}`
          }
          title={unlist ? "Back to Needed" : undefined}
        >
          {unlist ? <Undo2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

/** What a bought line cost; saved when the field is left. Keyed by the saved cost upstream. */
function CostInput({ item, onCost }: { item: GroceryItem; onCost: (cost: number | null) => void }) {
  const [draft, setDraft] = useState(item.costPHP != null ? String(item.costPHP) : "");
  const commit = () => {
    const t = draft.trim();
    if (t === "") return item.costPHP != null && onCost(null);
    const n = Number(t.replace(/[,₱\s]/g, ""));
    if (Number.isFinite(n) && n >= 0 && n !== item.costPHP) onCost(n);
    else if (!Number.isFinite(n) || n < 0)
      setDraft(item.costPHP != null ? String(item.costPHP) : "");
  };
  return (
    <label className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      ₱
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        inputMode="decimal"
        placeholder="—"
        aria-label={`What ${item.name} cost`}
        className="w-20 rounded-lg border border-input bg-card px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-primary"
      />
    </label>
  );
}

function GroceryEditRow({
  item,
  onSave,
  onCancel,
}: {
  item: GroceryItem;
  onSave: (patch: Patch) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(String(item.qty));
  const [unit, setUnit] = useState(item.unit);
  const qtyN = parseFloat(qty);
  const valid = name.trim().length > 0 && !isNaN(qtyN) && qtyN >= 0;
  const save = () => valid && onSave({ name, qty: qtyN, unit });

  return (
    <div
      className="flex flex-wrap items-center gap-2 py-2.5"
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") onCancel();
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Item"
        className="min-w-0 flex-1 basis-40 rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-primary"
      />
      <input
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        inputMode="decimal"
        aria-label="Qty"
        className="w-16 rounded-lg border border-input bg-card px-2 py-1.5 text-center text-sm tabular-nums outline-none focus:border-primary"
      />
      <input
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        aria-label="Unit"
        className="w-20 rounded-lg border border-input bg-card px-2 py-1.5 text-center text-sm outline-none focus:border-primary"
      />
      <button
        onClick={save}
        disabled={!valid}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-pine-deep disabled:opacity-50"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
