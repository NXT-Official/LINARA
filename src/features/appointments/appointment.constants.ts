import { helperById } from "@/features/people/people.utils";
import type { Status, Task } from "@/features/tasks/task.types";
import { computePrepSchedule } from "@/lib/time";
import type { Appointment, EventTemplate } from "./appointment.types";

// ---------- Seed appointments ----------
export const INITIAL_APPOINTMENTS: Appointment[] = [
  { id: "a1", title: "Sir's airport departure", date: "2026-07-10", time: "6:00 AM" },
];

// ---------- Event templates (reusable appointment recipes) ----------

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: "tmpl-airport",
    title: "Airport departure",
    blurb: "Pack, baon, and load the car in time for the flight.",
    preps: [
      {
        title: "Pack Sir's bags",
        leadMinutes: 600,
        helperId: "rosa",
        note: "Passport, boarding pass, chargers, meds. Suit bag on the hook.",
      },
      {
        title: "Prepare baon for the trip",
        leadMinutes: 120,
        helperId: "lita",
        note: "Sandwich + water, no strong smells. Pack in the small cooler.",
      },
      {
        title: "Load car & wake driver",
        leadMinutes: 45,
        helperId: "manuel",
        note: "Warm the car 10 min ahead. Bags in the trunk, not the back seat.",
      },
    ],
  },
  {
    id: "tmpl-dinner",
    title: "Dinner party",
    blurb: "Sala clean, market run, prep, and table set for guests.",
    preps: [
      {
        title: "Clean sala",
        leadMinutes: 360,
        helperId: "rosa",
        note: "Vacuum, wipe glass tables, fluff cushions, fresh water in the vases.",
      },
      {
        title: "Market run for menu",
        leadMinutes: 300,
        helperId: "lita",
        note: "Buy fresh — nothing frozen. Keep receipts, budget ₱2,500.",
      },
      {
        title: "Prep courses",
        leadMinutes: 180,
        helperId: "lita",
        note: "Follow the menu card on the ref. Plating photos in the binder.",
      },
      {
        title: "Set table",
        leadMinutes: 60,
        helperId: "rosa",
        note: "The blue linen set. Wine glasses on the right, water on the left.",
      },
    ],
  },
  {
    id: "tmpl-typhoon",
    title: "Typhoon prep",
    blurb: "Water, power, and windows before the storm lands.",
    preps: [
      {
        title: "Stock water & candles",
        leadMinutes: 1440,
        helperId: "lita",
        note: "5 gallons drinking + 2 pails per bathroom. Candles + matches in the drawer.",
      },
      {
        title: "Charge power banks",
        leadMinutes: 720,
        helperId: "rosa",
        note: "All 4 power banks + phones + Sofia's tablet to 100%.",
      },
      {
        title: "Secure windows",
        leadMinutes: 360,
        helperId: "manuel",
        note: "Tape the big glass panels. Move the plants inside the sala.",
      },
    ],
  },
];

type SeedPrep = { id: string; leadMinutes: number; title: string; helperId: string; note: string };
const SEED_PREP: Array<{
  appointmentId: string;
  appointmentTitle: string;
  date: string;
  time: string;
  items: SeedPrep[];
}> = INITIAL_APPOINTMENTS.map((a) => ({
  appointmentId: a.id,
  appointmentTitle: a.title,
  date: a.date,
  time: a.time,
  items:
    a.id === "a1"
      ? [
          {
            id: "a1-p1",
            leadMinutes: 600,
            title: "Pack Sir's bags",
            helperId: "rosa",
            note: "Passport, boarding pass, chargers, meds. Suit bag on the hook.",
          },
          {
            id: "a1-p2",
            leadMinutes: 120,
            title: "Prepare baon for the trip",
            helperId: "lita",
            note: "Sandwich + water, no strong smells. Pack in the small cooler.",
          },
          {
            id: "a1-p3",
            leadMinutes: 45,
            title: "Load car & wake driver",
            helperId: "manuel",
            note: "Warm the car 10 min ahead. Bags in the trunk, not the back seat.",
          },
        ]
      : [],
}));

export const INITIAL_PREP_TASKS: Task[] = SEED_PREP.flatMap((s) =>
  s.items.map((p) => {
    const { date, time } = computePrepSchedule(s.date, s.time, p.leadMinutes);
    const helper = helperById(p.helperId);
    return {
      id: p.id,
      title: p.title,
      note: p.note,
      time,
      helperId: p.helperId,
      station: helper.station,
      status: "todo" as Status,
      appointmentId: s.appointmentId,
      appointmentTitle: s.appointmentTitle,
      scheduledDate: date,
      leadMinutes: p.leadMinutes,
    };
  }),
);
