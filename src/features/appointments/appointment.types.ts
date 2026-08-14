// Fixed calendar events plus the prep tasks they schedule backwards from.

import type { Station } from "@/features/people/people.types";

export type Appointment = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // "6:00 AM"
  /** Which EVENT_TEMPLATES recipe this was created from, if any (e.g.
   * "tmpl-airport") -- undefined for a manually-built or AI-scheduled one. */
  recipeType?: string;
};

// Templates describe a station, not a specific helper -- who occupies that station
// varies per household, so the specific assignee is resolved when a template is
// applied (see new-appointment-modal.tsx).
export type TemplatePrep = { title: string; leadMinutes: number; station: Station; note: string };
export type EventTemplate = { id: string; title: string; blurb: string; preps: TemplatePrep[] };

// A prep row as submitted from a form — lead time is already normalised to minutes.
export type PrepDraft = { title: string; leadMinutes: number; helperId: string; note?: string };
