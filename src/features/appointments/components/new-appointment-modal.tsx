import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/shared/field";
import { HELPERS } from "@/features/people/people.constants";

import { EVENT_TEMPLATES } from "../appointment.constants";
import type { Appointment, EventTemplate, PrepDraft } from "../appointment.types";

export type PrepRow = {
  title: string;
  leadValue: number;
  leadUnit: "m" | "h";
  helperId: string;
  note: string;
};

export function NewAppointmentModal({
  onClose,
  onAdd,
  defaultDate,
}: {
  onClose: () => void;
  onAdd: (a: Omit<Appointment, "id">, preps: PrepDraft[]) => void;
  defaultDate: string;
}) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("06:00");
  const [preps, setPreps] = useState<PrepRow[]>([
    { title: "", leadValue: 1, leadUnit: "h", helperId: HELPERS[0].id, note: "" },
  ]);

  const applyTemplate = (tmpl: EventTemplate) => {
    setTemplateId(tmpl.id);
    if (!title.trim()) setTitle(tmpl.title);
    setPreps(
      tmpl.preps.map((p) => {
        const useHours = p.leadMinutes % 60 === 0;
        return {
          title: p.title,
          leadValue: useHours ? p.leadMinutes / 60 : p.leadMinutes,
          leadUnit: useHours ? "h" : "m",
          helperId: p.helperId,
          note: p.note,
        };
      }),
    );
  };

  const clearTemplate = () => {
    setTemplateId(null);
    setPreps([{ title: "", leadValue: 1, leadUnit: "h", helperId: HELPERS[0].id, note: "" }]);
  };

  const addRow = () =>
    setPreps((p) => [
      ...p,
      { title: "", leadValue: 1, leadUnit: "h", helperId: HELPERS[0].id, note: "" },
    ]);
  const removeRow = (i: number) => setPreps((p) => p.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<PrepRow>) =>
    setPreps((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = () => {
    if (!title.trim()) return;
    const [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    const appTime = `${hr}:${String(m).padStart(2, "0")} ${suffix}`;
    const validPreps = preps
      .filter((r) => r.title.trim())
      .map((r) => ({
        title: r.title.trim(),
        leadMinutes: r.leadUnit === "h" ? r.leadValue * 60 : r.leadValue,
        helperId: r.helperId,
        note: r.note.trim() || undefined,
      }));
    onAdd({ title: title.trim(), date, time: appTime }, validPreps);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl text-foreground">New appointment</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Start from a template
              </span>
              {templateId && (
                <button
                  type="button"
                  onClick={clearTemplate}
                  className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_TEMPLATES.map((tmpl) => {
                const active = templateId === tmpl.id;
                return (
                  <button
                    type="button"
                    key={tmpl.id}
                    onClick={() => applyTemplate(tmpl)}
                    title={tmpl.blurb}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-soft"
                        : "border-border bg-card text-pine-deep hover:border-primary/40"
                    }`}
                  >
                    {tmpl.title}
                  </button>
                );
              })}
            </div>
            {templateId && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Prep loaded from template. House-standard notes come along — tweak below if needed,
                then set the date and time.
              </p>
            )}
          </div>
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sir's flight"
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

          <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Prep tasks
              </span>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5"
              >
                <Plus className="h-3 w-3" /> Add prep
              </button>
            </div>
            <div className="space-y-3">
              {preps.map((p, i) => (
                <div key={i} className="rounded-xl border border-border/70 bg-card p-2.5">
                  <div className="flex items-start gap-2">
                    <input
                      value={p.title}
                      onChange={(e) => updateRow(i, { title: e.target.value })}
                      placeholder="Prep task title"
                      className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label="Remove prep"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        How long before
                      </span>
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={p.leadValue}
                          onChange={(e) =>
                            updateRow(i, { leadValue: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="w-16 rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                        />
                        <select
                          value={p.leadUnit}
                          onChange={(e) => updateRow(i, { leadUnit: e.target.value as "m" | "h" })}
                          className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                        >
                          <option value="m">minutes</option>
                          <option value="h">hours</option>
                        </select>
                      </div>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Assign to
                      </span>
                      <select
                        value={p.helperId}
                        onChange={(e) => updateRow(i, { helperId: e.target.value })}
                        className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                      >
                        {HELPERS.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.short} · {h.station}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <textarea
                    value={p.note}
                    onChange={(e) => updateRow(i, { note: e.target.value })}
                    rows={2}
                    placeholder="House-standard note (optional)"
                    className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
          >
            Save appointment
          </button>
        </div>
      </div>
    </div>
  );
}
