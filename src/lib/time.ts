// Calendar + clock helpers shared across features. Pure functions, no React.
//
// Wall-clock times are the HOUSEHOLD's, not the device's (KNOWN_GAPS.md O9).
// A task at 7:30 PM is 7:30 PM in the house, whether the manager reading it
// is in the living room or in Dubai. The session sets the household's zone
// (households.timezone) once it knows it; every conversion between a stored
// instant and a "date + 6:30 PM" pair below goes through it. Until then -- and
// in tests that don't set one -- the device's own zone is used, as before.
//
// Calendar dates in this app (simDate, a routine's day, a cutoff) are plain
// local Dates at midnight whose fields read the household's calendar. Only
// the edges that meet a real instant need the zone: toHouseholdClock() for
// instant -> wall clock, fromHouseholdClock() for wall clock -> instant.

let householdZone: string | undefined;

const isValidZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Set by the session from households.timezone; null goes back to the device's zone. */
export function setHouseholdTimeZone(tz: string | null | undefined): void {
  householdZone = tz && isValidZone(tz) ? tz : undefined;
}

/** The zone wall-clock times are shown and entered in. */
export const householdTimeZone = (): string =>
  householdZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();
function wallClockIn(ms: number, tz: string) {
  let fmt = zoneFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    zoneFormatters.set(tz, fmt);
  }
  const part: Record<string, number> = {};
  for (const p of fmt.formatToParts(ms)) {
    if (p.type !== "literal") part[p.type] = Number(p.value);
  }
  return {
    y: part.year,
    mo: part.month,
    d: part.day,
    h: part.hour === 24 ? 0 : part.hour,
    mi: part.minute,
    s: part.second,
  };
}

const msPart = (ms: number) => ((ms % 1000) + 1000) % 1000;

/**
 * The household's wall clock at `instant`, as a Date whose LOCAL fields
 * (getHours, getDay, getDate...) read it -- so toISODate, weekdayOf and the
 * rest work on it unchanged. For reading and calendar math only: it is not
 * the same instant, so never send it to the server.
 */
export function toHouseholdClock(instant: Date | number | string): Date {
  const ms = new Date(instant).getTime();
  if (!householdZone || Number.isNaN(ms)) return new Date(ms);
  const w = wallClockIn(ms, householdZone);
  return new Date(w.y, w.mo - 1, w.d, w.h, w.mi, w.s, msPart(ms));
}

/** The household's "now", read as toHouseholdClock does. */
export const householdNow = (): Date => toHouseholdClock(Date.now());

/** The instant at which the household's clock reads y-mo-d h:mi (mo is 1-12). */
export function fromHouseholdClock(y: number, mo: number, d: number, h = 0, mi = 0): Date {
  if (!householdZone) return new Date(y, mo - 1, d, h, mi, 0, 0);
  const zone = householdZone;
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms: number) => {
    const w = wallClockIn(ms, zone);
    return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - (ms - msPart(ms));
  };
  // Two passes settle the offset across a DST change in the household's zone.
  let guess = wanted - offsetAt(wanted);
  guess = wanted - offsetAt(guess);
  return new Date(guess);
}

/**
 * A calendar day plus the household's UTC offset that day, e.g.
 * "2026-10-01T00:00:00+08:00" -- how a day is sent to the scheduler AI, so
 * it (and its mock) knows the date and the zone without guessing either.
 */
export function householdDayStamp(day: Date): string {
  const y = day.getFullYear();
  const mo = day.getMonth() + 1;
  const d = day.getDate();
  const offsetMin = Math.round(
    (Date.UTC(y, mo - 1, d) - fromHouseholdClock(y, mo, d).getTime()) / 60_000,
  );
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${toISODate(day)}T00:00:00${sign}${hh}:${mm}`;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LONG: Record<Weekday, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

const WEEKDAY_FROM_DAY: Weekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const weekdayOf = (d: Date): Weekday => {
  const idx = d.getDay();
  // Map JS 0=Sun..6=Sat to our WEEKDAYS order (Mon..Sun) — keep 3-letter code
  return WEEKDAY_FROM_DAY[idx];
};

export const formatSimDate = (d: Date): string =>
  d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// The reverse of toISODate -- a "YYYY-MM-DD" string back to a local Date at midnight.
export const parseISODate = (iso: string): Date => {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d, 0, 0, 0, 0);
};
export const formatAppointmentDate = (iso: string): string => {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};
// Parse "6:30 AM" / "11:30 AM" / "3:30 PM" -> minutes since midnight for sorting.
export const parseTimeToMinutes = (t: string): number => {
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const suf = m[3].toUpperCase();
  if (suf === "PM" && h !== 12) h += 12;
  if (suf === "AM" && h === 12) h = 0;
  return h * 60 + min;
};
export const formatDisplayTime = (totalMin: number): string => {
  const m = ((totalMin % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suf = h24 >= 12 ? "PM" : "AM";
  const hr = ((h24 + 11) % 12) + 1;
  return `${hr}:${String(mm).padStart(2, "0")} ${suf}`;
};
// Given appointment date+time and a lead offset in minutes, return the scheduled date+time for a prep task.
export const computePrepSchedule = (
  appDate: string,
  appTime: string,
  leadMinutes: number,
): { date: string; time: string } => {
  const [y, mo, d] = appDate.split("-").map(Number);
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  dt.setMinutes(parseTimeToMinutes(appTime) - leadMinutes);
  return { date: toISODate(dt), time: formatDisplayTime(dt.getHours() * 60 + dt.getMinutes()) };
};

// Combine a YYYY-MM-DD date and a "6:30 AM"-style display time, both in the
// household's time, into a full ISO timestamp -- how a client-side (date,
// time) pair becomes tickets.scheduled_start.
export const combineDateAndTime = (dateIso: string, time: string): string => {
  const [y, mo, d] = dateIso.split("-").map(Number);
  const minutes = parseTimeToMinutes(time);
  return fromHouseholdClock(y, mo, d, Math.floor(minutes / 60), minutes % 60).toISOString();
};

// Start of the household's calendar day `d`, as an ISO timestamp -- the
// "has this ticket's day already passed" boundary for listTicketsFn.
export const startOfDayIso = (d: Date): string =>
  fromHouseholdClock(d.getFullYear(), d.getMonth() + 1, d.getDate()).toISOString();

// The reverse of combineDateAndTime -- split a stored ISO timestamp back into
// its display-time and date-string components, in the household's time.
export const isoToDisplayTime = (iso: string): string => {
  const d = toHouseholdClock(iso);
  return formatDisplayTime(d.getHours() * 60 + d.getMinutes());
};
export const isoToISODate = (iso: string): string => toISODate(toHouseholdClock(iso));

// Postgres TIME columns (shift_start, shift_end, break_start, break_end) come
// back from Supabase as "HH:MM:SS", not "HH:MM". Splitting on ":" and reading
// only the first two parts tolerates both shapes -- the same approach
// ../LINARA_MOBILE/lib/availability.ts uses, kept deliberately in step. Returns
// 0 for anything unparseable, which several callers rely on (they treat a
// missing/!invalid schedule as "no window" rather than handling a throw).
export const parseHM = (s: string): number => {
  const [rawH, rawM] = s.split(":");
  const hours = Number(rawH);
  const minutes = Number(rawM);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return 0;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return 0;
  return hours * 60 + minutes;
};
export const fmtHM12 = (s: string): string => formatDisplayTime(parseHM(s));

// Convert display time like "6:00 AM" back to 24-hour "HH:MM" for <input type="time">.
export const displayTimeTo24h = (t: string): string => {
  const mins = parseTimeToMinutes(t);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export function formatClock(ts: number) {
  const d = toHouseholdClock(ts);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${wd} ${h}:${m} ${s}`;
}

// "6:05 PM" for a timestamp. Used for utos stamps, ledger rows, and availability windows.
export function formatTimeOfDay(ts: number): string {
  const d = toHouseholdClock(ts);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  const suffix = d.getHours() >= 12 ? "PM" : "AM";
  return `${h}:${m} ${suffix}`;
}
