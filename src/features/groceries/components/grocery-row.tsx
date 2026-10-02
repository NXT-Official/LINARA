import { Check, Package, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";

import { fmtPeso } from "../grocery.utils";
import type { GroceryItem } from "../grocery.types";

type Patch = { name: string; qty: number; unit: string };

/**
 * One item. Bought/cost are real, mostly set by LINARA_MOBILE (see
 * KNOWN_GAPS.md Closed Gap C13); `onToggleBought` lets a manager who did the
 * shopping tick it here too. Edit and remove are only passed for
 * not-yet-bought items: curating the plan, not touching a completed
 * purchase. A
 * suggestion (from a low pantry item) lives only in this browser until it's
 * added, so it says so and offers "Add to list".
 */
export function GroceryRow({
  item,
  onRemove,
  onEdit,
  onAddSuggestion,
  onToggleBought,
  tone,
}: {
  item: GroceryItem;
  onRemove?: () => void;
  onEdit?: (patch: Patch) => void;
  onAddSuggestion?: () => void;
  onToggleBought?: () => void;
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
    <div className={`flex items-center gap-2 py-2.5 ${tone === "light" ? "px-2" : ""}`}>
      {onToggleBought && !suggested ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={item.bought}
          aria-label={`Bought ${item.name}`}
          onClick={onToggleBought}
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition ${
            item.bought
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-transparent hover:border-primary hover:text-primary/40"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      ) : (
        <div
          aria-hidden
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
            item.bought
              ? "border-primary bg-primary text-primary-foreground"
              : suggested
                ? "border-dashed border-border bg-card text-transparent"
                : "border-border bg-card text-transparent"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
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
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            · {item.qty} {item.unit}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {suggested && !item.bought && (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 font-semibold text-pine-deep">
              Suggested · not on the list yet
            </span>
          )}
          {item.pantryItemId && (
            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
              <Package className="h-2.5 w-2.5" /> restocks pantry
            </span>
          )}
        </div>
      </div>
      {item.bought && item.costPHP != null && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {fmtPeso(item.costPHP)}
        </span>
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
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
          aria-label={suggested ? `Dismiss ${item.name}` : `Remove ${item.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
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
