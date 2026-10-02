import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { PantryItem } from "../pantry.types";
import { STOCK_LABEL, stockState, unitFor } from "../pantry.utils";

/**
 * One line of the pantry: a row in a hairline-divided list, never its own
 * box (DESIGN.md: rows inside a card are split by dividers). The name wraps
 * rather than truncating, and on a phone the count drops under it.
 */
export function PantryRow({
  item,
  onAdjust,
  onSetQty,
  onEdit,
  onRemove,
}: {
  item: PantryItem;
  onAdjust: (id: string, delta: number) => void;
  onSetQty: (id: string, qty: number) => void;
  onEdit: (item: PantryItem) => void;
  onRemove: (id: string) => void;
}) {
  const state = stockState(item);
  const [editing, setEditing] = useState(false);
  // Removing takes a second click (client feedback, 2026-10-02: deletes
  // shouldn't be one tap).
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [draft, setDraft] = useState(String(item.qty));
  useEffect(() => {
    setDraft(String(item.qty));
  }, [item.qty]);
  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n)) onSetQty(item.id, n);
    setEditing(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <div className="min-w-[10rem] flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="group inline-flex min-w-0 items-center gap-1 text-left"
            aria-label={`Edit ${item.name}`}
          >
            <span className="text-sm font-semibold text-foreground group-hover:underline">
              {item.name}
            </span>
            <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
          {state !== "ok" && (
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                state === "out"
                  ? "bg-terracotta text-accent-foreground"
                  : "bg-terracotta-soft text-accent-foreground"
              }`}
            >
              {STOCK_LABEL[state]}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Buy more at {item.par} {unitFor(item.par, item.unit)}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          onClick={() => onAdjust(item.id, -1)}
          disabled={item.qty <= 0}
          className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition hover:border-primary/40 hover:text-foreground disabled:opacity-40"
          aria-label={`One less ${item.name}`}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(String(item.qty));
                setEditing(false);
              }
            }}
            aria-label={`${item.name} on hand`}
            className="w-16 rounded-lg border border-input bg-background px-2 py-1 text-center text-sm tabular-nums outline-none focus:border-primary"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="min-w-[64px] rounded-lg px-2 py-1 text-center text-sm font-semibold tabular-nums text-foreground hover:bg-secondary"
            aria-label={`Edit how much ${item.name} is on hand`}
          >
            {item.qty}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              {unitFor(item.qty, item.unit)}
            </span>
          </button>
        )}
        <button
          onClick={() => onAdjust(item.id, 1)}
          className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition hover:border-primary/40 hover:text-foreground"
          aria-label={`One more ${item.name}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        {confirmingRemove ? (
          <span className="ml-1 inline-flex items-center gap-1 text-xs">
            <button
              onClick={() => onRemove(item.id)}
              className="rounded-lg bg-destructive px-2 py-1 font-semibold text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </button>
            <button
              onClick={() => setConfirmingRemove(false)}
              className="rounded-lg px-2 py-1 font-semibold text-muted-foreground hover:text-foreground"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmingRemove(true)}
            className="ml-1 grid h-8 w-8 place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
            aria-label={`Remove ${item.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
