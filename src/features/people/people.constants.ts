import type { Admin, AdminType, Helper, Station } from "./people.types";

// Seed household. No backend yet — this is the whole roster.
export const HELPERS: Helper[] = [
  {
    id: "rosa",
    name: "Ate Rosa",
    short: "Rosa",
    initials: "AR",
    station: "Yaya",
    shift: "6:00 AM – 7:00 PM",
    restDay: "Sunday",
  },
  {
    id: "manuel",
    name: "Kuya Manuel",
    short: "Manuel",
    initials: "KM",
    station: "Driver",
    shift: "6:00–9:00 AM & 2:30–6:00 PM",
    restDay: "Sunday",
  },
  {
    id: "lita",
    name: "Ate Lita",
    short: "Lita",
    initials: "AL",
    station: "Cook",
    shift: "5:30 AM – 7:30 PM",
    restDay: "Saturday",
  },
];

export const INITIAL_ADMINS: Admin[] = [
  {
    id: "ben",
    name: "Sir Ben",
    short: "Ben",
    initials: "SB",
    type: "primary",
    location: "On-site",
  },
  {
    id: "tina",
    name: "Ma'am Tina",
    short: "Tina",
    initials: "MT",
    type: "co",
    location: "On-site",
  },
  { id: "lolafe", name: "Lola Fe", short: "Fe", initials: "LF", type: "remote", location: "Dubai" },
];
// Regional minimum wage for Metro Manila (Batas Kasambahay)
export const REGIONAL_MINIMUM_WAGE = 6000;

export const adminTypeLabel: Record<AdminType, string> = {
  primary: "Primary manager",
  co: "Co-manager",
  remote: "Remote admin",
};
export const adminTypeShort: Record<AdminType, string> = {
  primary: "Primary",
  co: "Co-manager",
  remote: "Remote",
};
export const adminPermSummary: Record<AdminType, string> = {
  primary: "Full control — can edit admins, end the day, and edit shifts.",
  co: "Full manage — everything except adding or removing admins.",
  remote: "View + approve — no editing shifts, no ending the day.",
};

// Station accents: Tailwind pairs for chips, raw hex for lane borders and progress bars.
export const stationTone: Record<Station, string> = {
  Yaya: "bg-terracotta-soft/60 text-pine-deep",
  Cook: "bg-[oklch(0.92_0.05_140)] text-[oklch(0.35_0.08_140)]",
  Laundry: "bg-[oklch(0.92_0.04_240)] text-[oklch(0.35_0.08_240)]",
  Driver: "bg-[oklch(0.92_0.05_60)] text-[oklch(0.38_0.09_60)]",
  House: "bg-secondary text-pine-deep",
};

export const STATION_HEX: Record<Station, { solid: string; soft: string }> = {
  Yaya: { solid: "#E6A98F", soft: "rgba(230,169,143,0.16)" },
  Cook: { solid: "#7FA98C", soft: "rgba(127,169,140,0.18)" },
  Driver: { solid: "#8098B4", soft: "rgba(128,152,180,0.20)" },
  Laundry: { solid: "#8098B4", soft: "rgba(128,152,180,0.20)" },
  House: { solid: "#1F5A54", soft: "rgba(31,90,84,0.14)" },
};
