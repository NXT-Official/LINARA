import { AlertCircle, Loader2, X } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/shared/field";

import type { Employment, Invite, Station } from "../people.types";
import { REGIONAL_MINIMUM_WAGE, WEEKLY_REST_DAY_NAMES } from "../people.constants";
import { LegalContributionSplitCard } from "./legal-contribution-split-card";

type PaydayInterval = "semi_monthly" | "monthly";

export function InviteHelperModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (
    data: Omit<Invite, "id" | "code" | "createdAt" | "createdBy" | "status" | "flags" | "shift"> & {
      paydayInterval: PaydayInterval;
    },
  ) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [station, setStation] = useState<Station>("Yaya");
  const [employment, setEmployment] = useState<Employment>("live-in");
  const [shiftStart, setShiftStart] = useState("06:00");
  const [shiftEnd, setShiftEnd] = useState("19:00");
  const [restDay, setRestDay] = useState<(typeof WEEKLY_REST_DAY_NAMES)[number]>("Sunday");
  const [paydayInterval, setPaydayInterval] = useState<PaydayInterval>("semi_monthly");
  const [wage, setWage] = useState("8000");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        station,
        employment,
        shiftStart,
        shiftEnd,
        restDay,
        paydayInterval,
        wagePHP: parseInt(wage, 10) || 0,
        phone: phone.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the invite.");
    } finally {
      setSubmitting(false);
    }
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shift start">
              <input
                type="time"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label="Shift end">
              <input
                type="time"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rest day">
              <select
                value={restDay}
                onChange={(e) =>
                  setRestDay(e.target.value as (typeof WEEKLY_REST_DAY_NAMES)[number])
                }
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                {WEEKLY_REST_DAY_NAMES.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
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
          <Field label="Payday interval">
            <select
              value={paydayInterval}
              onChange={(e) => setPaydayInterval(e.target.value as PaydayInterval)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="semi_monthly">Semi-monthly</option>
              <option value="monthly">Monthly</option>
            </select>
          </Field>

          {parseInt(wage, 10) < REGIONAL_MINIMUM_WAGE && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">
                  Batas Kasambahay Compliance Warning
                </span>
                Ang sweldong ₱{(parseInt(wage, 10) || 0).toLocaleString()} ay mababa sa regional
                minimum wage na{" "}
                <span className="font-semibold">₱{REGIONAL_MINIMUM_WAGE.toLocaleString()}</span>{" "}
                para sa mga kasambahay. Mangyaring ayusin ito upang makatugon sa batas.
              </div>
            </div>
          )}

          <LegalContributionSplitCard wagePHP={parseInt(wage, 10) || 0} />
          <Field label="Contact number">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0917 555 1234"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-full px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || submitting}
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...
              </>
            ) : (
              "Generate invite code"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
