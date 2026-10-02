import { Search, X } from "lucide-react";

/**
 * Search box plus filter chips over a list. Pantry and the grocery list use
 * it (client feedback, 2026-10-02: lists need search and filter). The chips
 * are soft rectangles, not pills: they act (DESIGN.md, Pills-Mean-Status).
 */
export function ListFilter<K extends string>({
  query,
  onQuery,
  chips,
  active,
  onChip,
  label,
}: {
  query: string;
  onQuery: (q: string) => void;
  chips: { key: K; label: string }[];
  active: K;
  onChip: (key: K) => void;
  /** What's being searched, for screen readers: "Search pantry". */
  label: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-3 focus-within:border-primary">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search…"
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear search"
            className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => onChip(chip.key)}
            aria-pressed={chip.key === active}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
              chip.key === active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
