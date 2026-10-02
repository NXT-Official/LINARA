import { useState } from "react";
import { toast } from "sonner";

import type { LeavePolicy } from "../leave.types";

/**
 * The household's service incentive leave rule (client feedback, 2026-10-02:
 * whether to follow the one-year rule should be the manager's call). The law
 * is the floor: it can start sooner and give more days, never fewer.
 */
export function LeaveRules({
  policy,
  canChange,
  onChange,
}: {
  policy: LeavePolicy;
  canChange: boolean;
  onChange: (next: LeavePolicy) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [daysDraft, setDaysDraft] = useState(String(policy.silDaysPerYear));

  const save = async (next: LeavePolicy) => {
    setSaving(true);
    try {
      await onChange(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the leave rules.");
      setDaysDraft(String(policy.silDaysPerYear));
    } finally {
      setSaving(false);
    }
  };

  const commitDays = () => {
    const n = Number(daysDraft);
    if (!Number.isInteger(n) || n < 5 || n > 30) {
      toast.error("Service incentive leave is 5 to 30 days a year. The law's minimum is 5.");
      setDaysDraft(String(policy.silDaysPerYear));
      return;
    }
    if (n !== policy.silDaysPerYear) void save({ ...policy, silDaysPerYear: n });
  };

  return (
    <div className="mb-4 rounded-2xl bg-secondary/40 p-3">
      <div className="text-xs font-semibold text-foreground">Leave rules</div>
      <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-xs text-foreground">
        <input
          type="checkbox"
          checked={policy.silWaitsFirstYear}
          disabled={!canChange || saving}
          onChange={(e) => void save({ ...policy, silWaitsFirstYear: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span>
          Service incentive leave starts after her first year
          <span className="block text-muted-foreground">
            {policy.silWaitsFirstYear
              ? "As RA 10361 has it. Untick to give it from her first day."
              : "Your household gives it from her first day, sooner than the law asks."}
          </span>
        </span>
      </label>
      <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground">
        <input
          type="number"
          min={5}
          max={30}
          step={1}
          inputMode="numeric"
          value={daysDraft}
          disabled={!canChange || saving}
          onChange={(e) => setDaysDraft(e.target.value)}
          onBlur={commitDays}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitDays();
          }}
          aria-label="Service incentive leave days a year"
          className="w-16 rounded-lg border border-input bg-background px-2 py-1 text-center text-xs tabular-nums outline-none focus:border-primary disabled:opacity-70"
        />
        <span>days a service year</span>
        <span className="text-muted-foreground">(5 is the law&apos;s minimum)</span>
      </label>
    </div>
  );
}
