import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { Helper } from "@/features/people/people.types";

import { useTeamView } from "../hooks/use-team-view";
import { LARGE_STAFF } from "../teams.constants";
import { groupByTeam } from "../teams.utils";

export type PickerOption = { value: string; label: string };

const FIELD =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";

/**
 * Choose one helper. A small household with no teams gets the plain select it
 * always had; past LARGE_STAFF, or once there are teams, it's a searchable
 * list grouped by team, so finding one person among a hundred is typing a
 * few letters. `extra` options (Unassigned, Everyone, Remove them…) sit above
 * or below the helpers, as each caller had them.
 */
export function HelperPicker({
  helpers,
  value,
  onChange,
  ariaLabel,
  before = [],
  after = [],
  emptyLabel,
  className = FIELD,
  describe = (h) => `${h.name} · ${h.station}`,
  align = "left",
}: {
  helpers: Helper[];
  /** A helper id, or one of the extra options' values. */
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  before?: PickerOption[];
  after?: PickerOption[];
  /** Shown when there's nobody to pick and no extra options. */
  emptyLabel?: string;
  /** The closed field's classes (and the plain select's). */
  className?: string;
  describe?: (h: Helper) => string;
  /** Which edge the open list lines up with: "right" for a picker at the end of a row. */
  align?: "left" | "right";
}) {
  const { teams } = useTeamView();
  const hasTeams = teams.available && teams.teams.length > 0;
  const large = helpers.length > LARGE_STAFF || hasTeams;

  if (!large) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={className}
      >
        {helpers.length === 0 && before.length + after.length === 0 && emptyLabel && (
          <option value="">{emptyLabel}</option>
        )}
        {before.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {helpers.map((h) => (
          <option key={h.id} value={h.id}>
            {describe(h)}
          </option>
        ))}
        {after.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <SearchablePicker
      helpers={helpers}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      before={before}
      after={after}
      emptyLabel={emptyLabel}
      className={className}
      describe={describe}
      hasTeams={hasTeams}
      align={align}
    />
  );
}

type Row =
  | { kind: "heading"; key: string; title: string }
  | { kind: "option"; key: string; value: string; label: string; sub?: string };

function SearchablePicker({
  helpers,
  value,
  onChange,
  ariaLabel,
  before,
  after,
  emptyLabel,
  className,
  describe,
  hasTeams,
  align,
}: {
  helpers: Helper[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  before: PickerOption[];
  after: PickerOption[];
  emptyLabel?: string;
  className: string;
  describe: (h: Helper) => string;
  hasTeams: boolean;
  align: "left" | "right";
}) {
  const { teams } = useTeamView();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selectedLabel =
    [...before, ...after].find((o) => o.value === value)?.label ??
    (() => {
      const h = helpers.find((x) => x.id === value);
      return h ? describe(h) : (emptyLabel ?? "Choose someone");
    })();

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (h: Helper) => {
      if (!q) return true;
      const team = h.teamId ? (teams.teamById.get(h.teamId)?.name ?? "") : "";
      const labels = teams
        .labelsOf(h.id)
        .map((l) => l.name)
        .join(" ");
      return `${h.name} ${h.station} ${team} ${labels}`.toLowerCase().includes(q);
    };
    const extra = (opts: PickerOption[]): Row[] =>
      opts
        .filter((o) => !q || o.label.toLowerCase().includes(q))
        .map((o) => ({ kind: "option", key: `x:${o.value}`, value: o.value, label: o.label }));
    const people = [...helpers].filter(matches).sort((a, b) => a.name.localeCompare(b.name));
    const option = (h: Helper): Row => ({
      kind: "option",
      key: h.id,
      value: h.id,
      label: describe(h),
    });
    const middle: Row[] = hasTeams
      ? groupByTeam(people, teams.teams).flatMap((g) => [
          { kind: "heading" as const, key: `h:${g.key}`, title: g.title },
          ...g.items.map(option),
        ])
      : people.map(option);
    return [...extra(before), ...middle, ...extra(after)];
  }, [query, helpers, before, after, hasTeams, teams, describe]);

  const options = rows.filter((r): r is Extract<Row, { kind: "option" }> => r.kind === "option");

  // Close on a tap outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [cursor, open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      // Close the list, not the dialog it sits in.
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = options[cursor];
      if (o) choose(o.value);
    }
  };

  let index = -1;
  return (
    <div ref={wrapRef} className="relative" onKeyDown={onKey}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setCursor(
            Math.max(
              0,
              options.findIndex((o) => o.value === value),
            ),
          );
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${selectedLabel}`}
        className={`${className} flex items-center justify-between gap-2 text-left`}
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        // Cancels the click's default: inside a <label> (Field), a tap on an
        // option would otherwise be passed on to the button and reopen it.
        <div
          onClick={(e) => e.preventDefault()}
          className={`absolute top-full z-20 mt-1 w-full min-w-[16rem] ${align === "right" ? "right-0" : "left-0"} overflow-hidden rounded-2xl border border-border bg-card shadow-lift`}
        >
          <div className="flex items-center gap-2 border-b border-border/60 px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              placeholder="Name, team or label…"
              aria-label={`Search: ${ariaLabel}`}
              aria-controls={listId}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {options.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">Nobody by that name.</li>
            )}
            {rows.map((r) => {
              if (r.kind === "heading") {
                return (
                  <li
                    key={r.key}
                    role="presentation"
                    className="px-3 pb-1 pt-2.5 text-xs font-semibold text-muted-foreground"
                  >
                    {r.title}
                  </li>
                );
              }
              index += 1;
              const i = index;
              const selected = r.value === value;
              return (
                <li
                  key={r.key}
                  role="option"
                  aria-selected={selected}
                  data-index={i}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(r.value)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                    i === cursor ? "bg-secondary" : ""
                  } ${selected ? "font-semibold text-primary" : "text-foreground"}`}
                >
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
