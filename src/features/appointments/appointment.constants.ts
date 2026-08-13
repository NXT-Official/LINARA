import type { EventTemplate } from "./appointment.types";

// Reusable appointment recipes — picking one preloads its prep rows. Station-based
// so they apply to any household regardless of who's actually staffing each role.

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: "tmpl-airport",
    title: "Airport departure",
    blurb: "Pack, baon, and load the car in time for the flight.",
    preps: [
      {
        title: "Pack Sir's bags",
        leadMinutes: 600,
        station: "Yaya",
        note: "Passport, boarding pass, chargers, meds. Suit bag on the hook.",
      },
      {
        title: "Prepare baon for the trip",
        leadMinutes: 120,
        station: "Cook",
        note: "Sandwich + water, no strong smells. Pack in the small cooler.",
      },
      {
        title: "Load car & wake driver",
        leadMinutes: 45,
        station: "Driver",
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
        station: "Yaya",
        note: "Vacuum, wipe glass tables, fluff cushions, fresh water in the vases.",
      },
      {
        title: "Market run for menu",
        leadMinutes: 300,
        station: "Cook",
        note: "Buy fresh — nothing frozen. Keep receipts, budget ₱2,500.",
      },
      {
        title: "Prep courses",
        leadMinutes: 180,
        station: "Cook",
        note: "Follow the menu card on the ref. Plating photos in the binder.",
      },
      {
        title: "Set table",
        leadMinutes: 60,
        station: "Yaya",
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
        station: "Cook",
        note: "5 gallons drinking + 2 pails per bathroom. Candles + matches in the drawer.",
      },
      {
        title: "Charge power banks",
        leadMinutes: 720,
        station: "Yaya",
        note: "All 4 power banks + phones + Sofia's tablet to 100%.",
      },
      {
        title: "Secure windows",
        leadMinutes: 360,
        station: "Driver",
        note: "Tape the big glass panels. Move the plants inside the sala.",
      },
    ],
  },
];
