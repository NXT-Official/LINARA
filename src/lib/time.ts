// Calendar + clock helpers shared across features. Pure functions, no React.

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

// Combine a YYYY-MM-DD date and a "6:30 AM"-style display time into a full
// ISO timestamp -- how a client-side (date, time) pair becomes tickets.scheduled_start.
export const combineDateAndTime = (dateIso: string, time: string): string => {
  const [y, mo, d] = dateIso.split("-").map(Number);
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  dt.setMinutes(parseTimeToMinutes(time));
  return dt.toISOString();
};

// Start of the local calendar day containing `d`, as an ISO timestamp -- the
// "has this ticket's day already passed" boundary for listTicketsFn.
export const startOfDayIso = (d: Date): string =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();

// The reverse of combineDateAndTime -- split a stored ISO timestamp back into
// its display-time and date-string components.
export const isoToDisplayTime = (iso: string): string => {
  const d = new Date(iso);
  return formatDisplayTime(d.getHours() * 60 + d.getMinutes());
};
export const isoToISODate = (iso: string): string => toISODate(new Date(iso));

export const parseHM = (s: string): number => {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
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
  const d = new Date(ts);
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
  const d = new Date(ts);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  const suffix = d.getHours() >= 12 ? "PM" : "AM";
  return `${h}:${m} ${suffix}`;
}
