import { Check, Loader2 } from "lucide-react";
import { useState } from "react";

import type { PantryItem } from "../pantry.types";
import { CATEGORY_LABEL, STARTER_ITEMS, STARTER_ORDER, unitFor } from "../pantry.utils";

/**
 * What an empty Pantry shows instead of a blank card (client feedback,
 * 2026-10-02: "we can't use anything from Pantry view, it's empty"). The
 * usual staples, ticked by category, go in with one button; anything the home
 * doesn't keep is one untick away, and the rest can be added by hand.
 */
export function PantryStarter({
  onAdd,
  onAddOwn,
}: {
  onAdd: (items: Omit<PantryItem, "id">[]) => Promise<boolean>;
  onAddOwn: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(STARTER_ITEMS.filter((i) => i.picked).map((i) => i.name)),
  );
  const [saving, setSaving] = useState(false);
  const toggle = (name: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const chosen = STARTER_ITEMS.filter((i) => picked.has(i.name));

  return (
    <div className="mt-4">
      <h3 className="font-display text-lg text-foreground">Start with the basics</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Tick what your home keeps. Each one starts as stocked; once something runs low, it goes on
        the grocery list for the next palengke run.
      </p>

      <div className="mt-4 space-y-4">
        {STARTER_ORDER.map((cat) => {
          const items = STARTER_ITEMS.filter((i) => i.category === cat);
          if (items.length === 0) return null;
          return (
            <fieldset key={cat}>
              <legend className="mb-1 text-xs font-semibold text-muted-foreground">
                {CATEGORY_LABEL[cat]}
              </legend>
              <div className="divide-y divide-border/60">
                {items.map((item) => {
                  const on = picked.has(item.name);
                  return (
                    <label
                      key={item.name}
                      className="flex min-h-11 cursor-pointer items-center gap-3 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(item.name)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 ${
                          on ? "border-primary bg-primary text-primary-foreground" : "border-input"
                        }`}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-foreground">{item.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        keep at least {item.par} {unitFor(item.par, item.unit)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={chosen.length === 0 || saving}
          onClick={async () => {
            setSaving(true);
            await onAdd(chosen.map(({ picked: _picked, ...item }) => item));
            setSaving(false);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Add {chosen.length} {chosen.length === 1 ? "item" : "items"}
        </button>
        <button
          type="button"
          onClick={onAddOwn}
          className="rounded-lg border border-primary/30 bg-card px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/5"
        >
          Add my own instead
        </button>
      </div>
    </div>
  );
}
