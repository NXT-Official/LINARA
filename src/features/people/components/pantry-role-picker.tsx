import { useState } from "react";
import { toast } from "sonner";

import type { PantryRole } from "../people.types";

const OPTIONS: { role: PantryRole; label: string; hint: string }[] = [
  {
    role: "lead",
    label: "In charge",
    hint: "Keeps the stock and the palengke list, like you do.",
  },
  {
    role: "runner",
    label: "Buys from the list",
    hint: "Ticks off what they bought and can say when something runs out.",
  },
];

/** "In charge" / "Buys from the list", for a line of text about a helper. */
export const PANTRY_ROLE_LABEL: Record<PantryRole, string> = Object.fromEntries(
  OPTIONS.map((o) => [o.role, o.label]),
) as Record<PantryRole, string>;

/**
 * Who keeps the pantry, per helper (client feedback, 2026-10-02: some homes
 * have a mayordoma, others someone who just does the pabili). Any number of
 * helpers can be in charge. Read-only for anyone who can't change it.
 */
export function PantryRolePicker({
  name,
  role,
  canChange,
  onChange,
}: {
  name: string;
  role: PantryRole;
  canChange: boolean;
  onChange: (role: PantryRole) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const current = OPTIONS.find((o) => o.role === role) ?? OPTIONS[1];

  if (!canChange) {
    return (
      <div className="mt-1 text-xs text-muted-foreground">
        Pantry: <span className="font-semibold text-foreground">{current.label}</span>
      </div>
    );
  }

  const choose = async (next: PantryRole) => {
    if (next === role || saving) return;
    setSaving(true);
    try {
      await onChange(next);
    } catch {
      toast.error(`Couldn't change ${name}'s pantry access. Try again.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-foreground">Pantry</span>
        <div
          role="radiogroup"
          aria-label={`Pantry access for ${name}`}
          className="inline-flex rounded-lg bg-secondary/70 p-0.5"
        >
          {OPTIONS.map((o) => {
            const on = o.role === role;
            return (
              <button
                key={o.role}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={saving}
                onClick={() => void choose(o.role)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  on
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{current.hint}</p>
    </div>
  );
}
