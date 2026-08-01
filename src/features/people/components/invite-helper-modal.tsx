import { X } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/shared/field";

import type { Employment, Invite, Station } from "../people.types";

export function InviteHelperModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (
    data: Omit<Invite, "id" | "code" | "createdAt" | "createdBy" | "status" | "flags">,
  ) => void;
}) {
  const [name, setName] = useState("");
  const [station, setStation] = useState<Station>("Yaya");
  const [employment, setEmployment] = useState<Employment>("live-in");
  const [shift, setShift] = useState("6:00 AM – 7:00 PM");
  const [restDay, setRestDay] = useState("Sunday");
  const [wage, setWage] = useState("8000");
  const [phone, setPhone] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      station,
      employment,
      shift: shift.trim() || "—",
      restDay: restDay.trim() || "—",
      wagePHP: parseInt(wage, 10) || 0,
      phone: phone.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-xl text-foreground">Invite a helper</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              You're entering the household's record of the arrangement — not creating her account.
              She'll claim it herself with the invite code.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Full name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ate Marites"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Station / role">
              <select
                value={station}
                onChange={(e) => setStation(e.target.value as Station)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="Yaya">Yaya</option>
                <option value="Cook">Cook</option>
                <option value="Driver">Driver</option>
                <option value="House">All-around</option>
              </select>
            </Field>
            <Field label="Employment">
              <select
                value={employment}
                onChange={(e) => setEmployment(e.target.value as Employment)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="live-in">Live-in</option>
                <option value="live-out">Live-out</option>
              </select>
            </Field>
          </div>
          <Field label="Shift hours">
            <input
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              placeholder="e.g. 6:00 AM – 7:00 PM"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rest day">
              <input
                value={restDay}
                onChange={(e) => setRestDay(e.target.value)}
                placeholder="e.g. Sunday"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label="Monthly wage (₱)">
              <input
                inputMode="numeric"
                value={wage}
                onChange={(e) => setWage(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
          <Field label="Contact number">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0917 555 1234"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          >
            Generate invite code
          </button>
        </div>
      </div>
    </div>
  );
}
