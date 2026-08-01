import { Check, Package, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { GroceryItem } from "../grocery.types";

export function GroceryRow({
  item,
  onToggle,
  onRemove,
  onCost,
  tone,
}: {
  item: GroceryItem;
  onToggle: () => void;
  onRemove: () => void;
  onCost?: (cost: number | undefined) => void;
  tone?: "light";
}) {
  const suggested = item.id.startsWith("sug-");
  const [draft, setDraft] = useState(item.costPHP != null ? String(item.costPHP) : "");
  useEffect(() => {
    setDraft(item.costPHP != null ? String(item.costPHP) : "");
  }, [item.costPHP]);
  const commit = () => {
    if (!onCost) return;
    if (draft.trim() === "") {
      onCost(undefined);
      return;
    }
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) onCost(n);
  };
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border p-2 ${tone === "light" ? "border-transparent bg-card/70" : "border-border/70 bg-background/60"}`}
    >
      <button
        onClick={onToggle}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition ${
          item.bought
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-transparent hover:border-primary/60"
        }`}
        aria-label={item.bought ? "Mark not bought" : "Mark bought"}
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">
        <div
          className={`flex items-center gap-1.5 text-sm ${item.bought ? "text-muted-foreground" : "text-foreground"}`}
        >
          <span className={`truncate font-medium ${item.bought ? "line-through" : ""}`}>
            {item.name}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            · {item.qty} {item.unit}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {suggested && !item.bought && (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 font-semibold text-pine-deep">
              Suggested
            </span>
          )}
          {item.pantryItemId && (
            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
              <Package className="h-2.5 w-2.5" /> restocks pantry
            </span>
          )}
        </div>
      </div>
      {item.bought && !suggested && onCost && (
        <label className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card px-1.5 py-1 text-xs text-muted-foreground focus-within:border-primary">
          <span>₱</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            inputMode="decimal"
            placeholder="—"
            className="w-14 bg-transparent text-right text-sm tabular-nums text-foreground outline-none"
          />
        </label>
      )}
      <button
        onClick={onRemove}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
        aria-label={`Remove ${item.name}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
