import { Search } from "lucide-react";
import { useState } from "react";

import { matchesQuery } from "@/components/shared/list-filter.utils";

import type { GroceryItem } from "../grocery.types";

/**
 * Choose lines from the Needed pool to put on a run. Suggestions (low
 * pantry items nobody listed yet) can be chosen too; they're listed as they
 * go on. Searchable once the pool is long.
 */
export function PoolPicker({
  items,
  picked,
  onPicked,
}: {
  items: GroceryItem[];
  picked: Set<string>;
  onPicked: (next: Set<string>) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = items.filter((g) => !g.bought && matchesQuery(g.name, query));
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onPicked(next);
  };
  const allShown = shown.length > 0 && shown.every((g) => picked.has(g.id));

  if (items.every((g) => g.bought)) {
    return (
      <p className="rounded-2xl bg-background/60 p-3 text-xs text-muted-foreground">
        Nothing is waiting in Needed. Add lines to the run below.
      </p>
    );
  }

  return (
    <div className="rounded-2xl bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          From Needed · {picked.size} chosen
        </span>
        <button
          type="button"
          onClick={() => {
            const next = new Set(picked);
            for (const g of shown) {
              if (allShown) next.delete(g.id);
              else next.add(g.id);
            }
            onPicked(next);
          }}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
        >
          {allShown ? "Choose none" : "Choose all"}
        </button>
      </div>
      {items.length > 8 && (
        <label className="mt-2 flex items-center gap-2 rounded-xl border border-input bg-card px-3 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an item"
            aria-label="Find an item in Needed"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
      )}
      <ul className="mt-2 max-h-56 divide-y divide-border/60 overflow-y-auto">
        {shown.map((g) => (
          <li key={g.id}>
            <label className="flex cursor-pointer items-center gap-2.5 py-2">
              <input
                type="checkbox"
                checked={picked.has(g.id)}
                onChange={() => toggle(g.id)}
                className="h-4 w-4 accent-primary"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{g.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {g.qty} {g.unit}
                {g.id.startsWith("sug-") && " · suggested"}
              </span>
            </label>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="py-2 text-xs text-muted-foreground">Nothing matches.</li>
        )}
      </ul>
    </div>
  );
}
