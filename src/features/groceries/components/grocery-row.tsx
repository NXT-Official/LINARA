import { Check, Package, X } from "lucide-react";

import { fmtPeso } from "../grocery.utils";
import type { GroceryItem } from "../grocery.types";

/**
 * Read-only display of one item -- bought/cost are real, set by
 * LINARA_MOBILE (see KNOWN_GAPS.md Closed Gap C13). `onRemove` is only
 * passed for not-yet-bought items: curating the plan, not touching a
 * helper's completed purchase.
 */
export function GroceryRow({
  item,
  onRemove,
  tone,
}: {
  item: GroceryItem;
  onRemove?: () => void;
  tone?: "light";
}) {
  const suggested = item.id.startsWith("sug-");
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border p-2 ${tone === "light" ? "border-transparent bg-card/70" : "border-border/70 bg-background/60"}`}
    >
      <div
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
          item.bought
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-transparent"
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </div>
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
      {item.bought && item.costPHP != null && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {fmtPeso(item.costPHP)}
        </span>
      )}
      {onRemove && !item.bought && (
        <button
          onClick={onRemove}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
          aria-label={`Remove ${item.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
