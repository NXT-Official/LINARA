import { X } from "lucide-react";
import { useState } from "react";

import { Modal } from "@/components/shared/modal";
import { Field } from "@/components/shared/field";
import { displayTimeTo24h } from "@/lib/time";

import type { Appointment } from "../appointment.types";

export function EditAppointmentModal({
  appointment,
  onClose,
  onSave,
}: {
  appointment: Appointment;
  onClose: () => void;
  onSave: (patch: { title: string; date: string; time: string }) => void;
}) {
  const [title, setTitle] = useState(appointment.title);
  const [date, setDate] = useState(appointment.date);
  const [time, setTime] = useState(displayTimeTo24h(appointment.time));

  const submit = () => {
    if (!title.trim()) return;
    const [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    const appTime = `${hr}:${String(m).padStart(2, "0")} ${suffix}`;
    onSave({ title: title.trim(), date, time: appTime });
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-foreground">Edit appointment</h3>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Prep tasks will move automatically to keep their lead offsets.
      </p>
      <div className="mt-4 space-y-3">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Time">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
        >
          Save changes
        </button>
      </div>
    </Modal>
  );
}
