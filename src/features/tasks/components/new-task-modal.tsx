import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

import { Modal } from "@/components/shared/modal";
import { Field } from "@/components/shared/field";
import { HelperPicker } from "@/features/teams/components/helper-picker";
import { TripFields } from "@/features/sharing/components/trip-fields";
import type { PlaceRef } from "@/features/sharing/sharing.types";
import type { Helper } from "@/features/people/people.types";
import type { HelperSchedule } from "@/features/shifts/shift.types";
import { isMinuteInShift } from "@/features/shifts/shift.utils";
import { approvedTimeOffAt, type TimeOff } from "@/features/shifts/time-off";
import { useBusyElsewhere } from "@/features/sharing/hooks/use-busy-elsewhere";
import { slotTime } from "@/features/sharing/sharing.utils";
import {
  WEEKDAYS,
  householdNow,
  parseHM,
  parseISODate,
  toISODate,
  weekdayOf,
  type Weekday,
} from "@/lib/time";

import type { Recurrence, Task } from "../task.types";
import { defaultTaskTime, taskFormErrors } from "../task.utils";
import { DurationField } from "./duration-field";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

export function NewTaskModal({
  activeHelpers,
  onClose,
  onAdd,
  isRemote = false,
  defaultDate,
  defaultHelperId,
  scheduleFor,
  timeOff = [],
}: {
  activeHelpers: Helper[];
  onClose: () => void;
  onAdd: (t: Omit<Task, "id" | "status" | "station">, opts?: { sendLive?: boolean }) => void;
  isRemote?: boolean;
  /** YYYY-MM-DD the form opens on: the board's day, or the planner day tapped. */
  defaultDate: string;
  /** Who the form opens on: the planner row tapped ("" = Unassigned). Else the first helper. */
  defaultHelperId?: string;
  /** For the out-of-shift warning; without it there is none. */
  scheduleFor?: (helperId: string) => HelperSchedule | undefined;
  /** Approved time off warns like an out-of-shift time does (KNOWN_GAPS O19). */
  timeOff?: TimeOff[];
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  // "" = Unassigned: a task can wait on the board until someone is picked.
  const [helperId, setHelperId] = useState(defaultHelperId ?? activeHelpers[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  // Follows the person and day until a time is picked (defaultTaskTime).
  const [pickedTime, setPickedTime] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [repeatKind, setRepeatKind] = useState<"none" | "daily" | "weekdays">("none");
  const [days, setDays] = useState<Weekday[]>([]);
  const [sendLive, setSendLive] = useState(false);
  const [trip, setTrip] = useState<{ from?: PlaceRef; to?: PlaceRef }>({});
  // Errors show once Save is pressed, then follow the typing.
  const [tried, setTried] = useState(false);

  // Planning never bypasses her boundaries silently, same as Edit.
  const schedule = helperId ? scheduleFor?.(helperId) : undefined;
  const now = householdNow();
  const todayIso = toISODate(now);
  const time =
    pickedTime ?? defaultTaskTime(date, todayIso, now.getHours() * 60 + now.getMinutes(), schedule);
  const errors = tried ? taskFormErrors({ title, date, time }) : {};
  const assignee = activeHelpers.find((h) => h.id === helperId);
  const outsideShift =
    schedule && date && time
      ? !isMinuteInShift(parseHM(time), weekdayOf(parseISODate(date)), schedule)
      : false;
  // Booked at another of the family's houses around then (O41).
  const elsewhere = useBusyElsewhere().busyOverlap(
    helperId,
    date,
    time ? parseHM(time) : -1,
    duration,
  );
  const inTimeOff =
    !!helperId && !!date && !!time && !!approvedTimeOffAt(timeOff, helperId, date, parseHM(time));

  const toggleDay = (d: Weekday) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const submit = () => {
    setTried(true);
    if (Object.keys(taskFormErrors({ title, date, time })).length > 0) return;
    const [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    const recurrence: Recurrence =
      repeatKind === "daily"
        ? "daily"
        : repeatKind === "weekdays" && days.length > 0
          ? WEEKDAYS.filter((d) => days.includes(d)) // keep canonical order
          : "none";
    onAdd(
      {
        title: title.trim(),
        helperId: helperId || null,
        time: `${hr}:${String(m).padStart(2, "0")} ${suffix}`,
        note: note.trim() || undefined,
        recurrence,
        scheduledDate: date,
        durationMinutes: duration ?? undefined,
        from: trip.from,
        to: trip.to,
      },
      { sendLive: isRemote ? sendLive : undefined },
    );
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-foreground">
          {isRemote ? t("tasks.suggestATask") : t("tasks.newTask")}
        </h3>
        <button
          onClick={onClose}
          aria-label={t("tasks.close")}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {isRemote && (
        <p className="mt-1 text-xs text-muted-foreground">{t("tasks.fromAfarYouCanPropose")}</p>
      )}
      <div className="mt-4 space-y-3">
        <Field label={t("tasks.title")} error={errors.title}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("tasks.eGFoldLaundry")}
            aria-invalid={!!errors.title}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary aria-[invalid=true]:border-destructive"
          />
        </Field>
        <Field label={t("tasks.assignTo")}>
          <HelperPicker
            helpers={activeHelpers}
            value={helperId}
            onChange={setHelperId}
            ariaLabel="Assign to"
            before={[{ value: "", label: "Unassigned (decide later)" }]}
          />
        </Field>
        <TripFields from={trip.from} to={trip.to} onChange={(from, to) => setTrip({ from, to })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("tasks.date")} error={errors.date}>
            <input
              type="date"
              value={date}
              min={todayIso < defaultDate ? todayIso : defaultDate}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!errors.date}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary aria-[invalid=true]:border-destructive"
            />
          </Field>
          <Field label={t("tasks.time")} error={errors.time}>
            <input
              type="time"
              value={time}
              onChange={(e) => setPickedTime(e.target.value)}
              aria-invalid={!!errors.time}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary aria-[invalid=true]:border-destructive"
            />
          </Field>
        </div>
        <DurationField
          value={duration}
          onChange={setDuration}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        {(inTimeOff || outsideShift) && (
          <p className="flex items-start gap-2 rounded-xl bg-terracotta-soft/50 px-3 py-2 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-ink" />
            {inTimeOff
              ? t("tasks.inApprovedTimeOff", { name: assignee?.short ?? t("tasks.theHelper") })
              : t("tasks.outsideShift", { name: assignee?.short ?? t("tasks.theHelper") })}{" "}
            {t("tasks.countsAsAfterHours")}
          </p>
        )}
        {elsewhere && (
          <p className="flex items-start gap-2 rounded-xl bg-terracotta-soft/50 px-3 py-2 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-ink" />
            {t("tasks.isAtElsewhere", {
              name: assignee?.short ?? t("tasks.theHelperCap"),
              place: elsewhere.householdName,
              time: slotTime(elsewhere),
            })}
          </p>
        )}
        <Field label={t("tasks.houseStandardNoteOptional")}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={t("tasks.eGWarmWaterOnly")}
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label={t("tasks.repeat")}>
          <div className="inline-flex w-full rounded-xl border border-input bg-background p-1">
            {(
              [
                { key: "none", label: t("tasks.repeatNone") },
                { key: "daily", label: t("tasks.repeatDaily") },
                { key: "weekdays", label: t("tasks.repeatWeekdays") },
              ] as const
            ).map((opt) => {
              const active = repeatKind === opt.key;
              return (
                <button
                  type="button"
                  key={opt.key}
                  onClick={() => setRepeatKind(opt.key)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {repeatKind === "weekdays" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const active = days.includes(d);
                return (
                  <button
                    type="button"
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
        </Field>
      </div>
      {isRemote && (
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-2xl ring-1 ring-border/20 bg-background/60 p-3">
          <input
            type="checkbox"
            checked={sendLive}
            onChange={(e) => setSendLive(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span className="text-xs text-muted-foreground">
            {richText(t("tasks.straightToTheHelperIf"), {
              span: (
                <span className="font-semibold text-foreground">{t("tasks.sendLiveUrgent")}</span>
              ),
            })}
          </span>
        </label>
      )}
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {t("tasks.cancel")}
        </button>
        <button
          onClick={submit}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
        >
          {isRemote
            ? sendLive
              ? t("tasks.sendLive")
              : t("tasks.sendToOnSite")
            : t("tasks.addToBoard")}
        </button>
      </div>
    </Modal>
  );
}
