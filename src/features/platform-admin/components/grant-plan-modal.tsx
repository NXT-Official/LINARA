import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";
import { listAllPlansFn } from "@/features/billing/plan.actions";
import type { Plan } from "@/features/billing/plan.types";

import { describeAdminError, grantPlanFn, type HouseholdOverview } from "../households.actions";

const INPUT =
  "w-full rounded-2xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";
const PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50";
const SECONDARY =
  "inline-flex items-center justify-center rounded-xl border border-primary/30 bg-card px-3.5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/5";

type Plans = { state: "loading" } | { state: "error" } | { state: "ready"; plans: Plan[] };

const digits = (v: string) => v.replace(/\D/g, "");

/** A plan's seat allowance as field text; no limit is a blank field. */
const seatText = (n: number | null) => (n === null ? "" : String(n));

const seatValue = (text: string) => (text === "" ? null : Number(text));

/** The date a person picked, as the last moment of that day in Manila. */
const endOfDayManila = (date: string) => new Date(`${date}T23:59:59+08:00`).toISOString();

export function GrantPlanModal({
  household,
  token,
  onClose,
  onGranted,
}: {
  household: HouseholdOverview;
  token: string;
  onClose: () => void;
  onGranted: () => void;
}) {
  const [plans, setPlans] = useState<Plans>({ state: "loading" });
  const [planId, setPlanId] = useState("");
  const [helperSeats, setHelperSeats] = useState("");
  const [managerSeats, setManagerSeats] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(plan: Plan | undefined) {
    if (!plan) return;
    setPlanId(plan.id);
    setHelperSeats(seatText(plan.includedHelpers));
    setManagerSeats(seatText(plan.includedManagers));
  }

  useEffect(() => {
    let alive = true;
    listAllPlansFn({ data: { token } })
      .then((reply) => {
        if (!alive) return;
        const offered = reply.plans.filter((p) => p.status !== "draft");
        setPlans({ state: "ready", plans: offered });
        const first = offered.find((p) => p.status === "active") ?? offered[0];
        if (first) {
          setPlanId(first.id);
          setHelperSeats(seatText(first.includedHelpers));
          setManagerSeats(seatText(first.includedManagers));
        }
      })
      .catch(() => {
        if (alive) setPlans({ state: "error" });
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const helpers = seatValue(helperSeats);
  const managers = seatValue(managerSeats);
  const planError = tried && !planId ? "Pick a plan" : null;
  const managerError =
    tried && managers !== null && managers < 1 ? "At least one manager seat, or leave blank" : null;

  async function save() {
    setTried(true);
    setError(null);
    if (!planId || (managers !== null && managers < 1)) return;
    setSaving(true);
    try {
      const reply = await grantPlanFn({
        data: {
          token,
          householdId: household.householdId,
          planId,
          helperSeats: helpers,
          managerSeats: managers,
          periodEnd: periodEnd ? endOfDayManila(periodEnd) : null,
          note: note.trim(),
        },
      });
      if (!reply.available) {
        setError("Admin tools aren't switched on yet.");
        return;
      }
      toast.success(`Plan granted to ${household.name}`);
      onGranted();
    } catch (e) {
      setError(describeAdminError(e instanceof Error ? e.message : "Couldn't grant the plan"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl text-foreground">Grant plan to {household.name}</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {plans.state === "loading" && (
        <p role="status" className="py-6 text-center text-sm text-muted-foreground">
          Loading plans
        </p>
      )}
      {plans.state === "error" && (
        <p role="alert" className="py-6 text-center text-sm text-destructive">
          The plans didn't load. Close this and try again.
        </p>
      )}
      {plans.state === "ready" && (
        <div className="mt-4 space-y-3">
          <Field label="Plan" error={planError}>
            <select
              value={planId}
              onChange={(e) => choose(plans.plans.find((p) => p.id === e.target.value))}
              className={INPUT}
            >
              {plans.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.status === "archived" ? `${p.name} (archived)` : p.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Helper seats">
              <input
                inputMode="numeric"
                value={helperSeats}
                placeholder="Unlimited"
                onChange={(e) => setHelperSeats(digits(e.target.value))}
                className={INPUT}
              />
            </Field>
            <Field label="Manager seats" error={managerError}>
              <input
                inputMode="numeric"
                value={managerSeats}
                placeholder="Unlimited"
                aria-invalid={managerError ? true : undefined}
                onChange={(e) => setManagerSeats(digits(e.target.value))}
                className={INPUT}
              />
            </Field>
          </div>
          <p className="text-[13px] text-muted-foreground">Leave blank for unlimited.</p>
          <Field label="Period end">
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className={INPUT}
            />
          </Field>
          <p className="text-[13px] text-muted-foreground">
            Ends 11:59 pm Manila time. Leave blank for no end date (lifetime).
          </p>
          <Field label="Note">
            <textarea
              value={note}
              maxLength={500}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              className={INPUT}
            />
          </Field>
          {error && (
            <p role="alert" className="text-[13px] font-semibold text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button className={SECONDARY} onClick={onClose}>
          Cancel
        </button>
        <button
          className={PRIMARY}
          disabled={saving || plans.state !== "ready"}
          onClick={() => void save()}
        >
          {saving ? "Granting" : "Grant"}
        </button>
      </div>
    </Modal>
  );
}
