import { HELPERS } from "./people.constants";
import type { Helper } from "./people.types";

export const helperById = (id: string): Helper => HELPERS.find((h) => h.id === id)!;

// "Ate Marites" -> "AM". Used for invited helpers, who have no seeded initials yet.
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "??";
