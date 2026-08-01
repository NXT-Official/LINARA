// Fixed calendar events plus the prep tasks they schedule backwards from.

export type Appointment = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // "6:00 AM"
};

export type TemplatePrep = { title: string; leadMinutes: number; helperId: string; note: string };
export type EventTemplate = { id: string; title: string; blurb: string; preps: TemplatePrep[] };

// A prep row as submitted from a form — lead time is already normalised to minutes.
export type PrepDraft = { title: string; leadMinutes: number; helperId: string; note?: string };
