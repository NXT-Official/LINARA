import { AlertCircle, CalendarClock, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/shared/avatar";
import { WEEKLY_REST_DAY_NAMES } from "@/features/people/people.constants";
import type { Invite } from "@/features/people/people.types";
import { initialsOf } from "@/features/people/people.utils";
import { StaffScopeBar } from "@/features/teams/components/staff-scope-bar";
import { useStaffScope } from "@/features/teams/hooks/use-staff-scope";
import { useTeamView } from "@/features/teams/hooks/use-team-view";
import { groupByTeam } from "@/features/teams/teams.utils";

import type { ScheduleStore } from "../hooks/use-schedules";
import type { HelperSchedule } from "../shift.types";
import { summarizeSchedule, uncoveredRestDay } from "../shift.utils";

/** One shift window + one rest day per helper, matching helper_profiles. */
export function ShiftsSection({
  schedules,
  helpers,
  readOnly = false,
}: {
  schedules: ScheduleStore;
  helpers: Invite[];
  readOnly?: boolean;
}) {
  const { byHelper, update } = schedules;
  const [editingId, setEditingId] = useState<string | null>(null);
  const { teams } = useTeamView();
  const staff = useStaffScope();

  // Coverage: a day everyone in a team rests is a day that team has no one.
  // Per team when there are teams (a kitchen with nobody on Sunday matters
  // even if the drivers work), else the household as one.
  const warnings = useMemo(() => {
    const groups =
      teams.teams.length > 0
        ? groupByTeam(helpers, teams.teams).filter((g) => g.team)
        : [{ key: "all", title: "", items: helpers }];
    return groups.flatMap((g) => {
      const scheduled = g.items.filter((h) => byHelper[h.id]);
      const day = uncoveredRestDay(scheduled.map((h) => byHelper[h.id]!.weeklyRestDay));
      return day === null
        ? []
        : [{ key: g.key, team: g.title, day, names: scheduled.map((h) => h.name) }];
    });
  }, [helpers, byHelper, teams.teams]);

  const shown = staff.apply(helpers);
  const groups = staff.group(shown);

  const row = (h: Invite) => {
    const sched = byHelper[h.id];
    if (!sched) return null;
    const isEditing = editingId === h.id;
    return (
      <div key={h.id} className="py-3.5 first:pt-0 last:pb-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar initials={initialsOf(h.name)} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{h.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {h.station} · {summarizeSchedule(sched)} · Rest:{" "}
                {WEEKLY_REST_DAY_NAMES[sched.weeklyRestDay]}
              </div>
            </div>
          </div>
          {!readOnly && (
            <button
              onClick={() => setEditingId(isEditing ? null : h.id)}
              className="shrink-0 rounded-lg border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:border-primary"
            >
              {isEditing ? "Close" : "Edit"}
            </button>
          )}
        </div>
        {isEditing && (
          <ScheduleEditor
            schedule={sched}
            onSave={async (patch) => {
              await update(h.id, patch);
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        )}
      </div>
    );
  };

  return (
    <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-foreground">Shifts</h2>
          <p className="text-xs text-muted-foreground">
            One shift window and rest day per helper. Tap a row to edit.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-pine-deep">
          <CalendarClock className="h-3 w-3" /> {helpers.length} helpers
        </span>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {warnings.map(({ key, team, day, names }) => (
            <div
              key={key}
              className="flex items-start gap-2 rounded-2xl border border-terracotta/40 bg-terracotta-soft/50 px-3 py-2 text-xs text-accent-foreground"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-semibold">
                  No one {team ? `in ${team} ` : ""}covers {WEEKLY_REST_DAY_NAMES[day]}
                </span>{" "}
                —{" "}
                {names.length === 2
                  ? `${names.join(" & ")} both rest that day.`
                  : `all ${names.length} rest that day.`}
              </span>
            </div>
          ))}
        </div>
      )}

      {staff.show && (
        <div className="mb-4">
          <StaffScopeBar api={staff} shown={shown.length} total={helpers.length} />
        </div>
      )}
      {groups ? (
        groups.map((g) => (
          <div key={g.key} className="mb-4 last:mb-0">
            <h3 className="mb-2 flex items-baseline gap-2 border-b border-border/60 pb-1.5 text-sm font-semibold text-foreground">
              {g.title}
              <span className="text-xs text-muted-foreground tabular-nums">{g.items.length}</span>
            </h3>
            <div className="divide-y divide-border/70">{g.items.map(row)}</div>
          </div>
        ))
      ) : (
        <div className="divide-y divide-border/70">{shown.map(row)}</div>
      )}
      {helpers.length === 0 && (
        <p className="text-xs text-muted-foreground">No active helpers yet.</p>
      )}
    </section>
  );
}

function ScheduleEditor({
  schedule,
  onSave,
  onCancel,
}: {
  schedule: HelperSchedule;
  onSave: (
    patch: Partial<
      Pick<HelperSchedule, "shiftStart" | "shiftEnd" | "weeklyRestDay" | "breakStart" | "breakEnd">
    >,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [shiftStart, setShiftStart] = useState(schedule.shiftStart);
  const [shiftEnd, setShiftEnd] = useState(schedule.shiftEnd);
  const [weeklyRestDay, setWeeklyRestDay] = useState(schedule.weeklyRestDay);
  const [breakStart, setBreakStart] = useState(schedule.breakStart ?? "");
  const [breakEnd, setBreakEnd] = useState(schedule.breakEnd ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        shiftStart,
        shiftEnd,
        weeklyRestDay,
        breakStart: breakStart || undefined,
        breakEnd: breakEnd || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-2.5 rounded-xl border border-border/60 bg-card p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-muted-foreground">Shift start</span>
          <input
            type="time"
            value={shiftStart}
            onChange={(e) => setShiftStart(e.target.value)}
            disabled={saving}
            className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-muted-foreground">Shift end</span>
          <input
            type="time"
            value={shiftEnd}
            onChange={(e) => setShiftEnd(e.target.value)}
            disabled={saving}
            className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </label>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold text-muted-foreground">Rest day</span>
        <select
          value={weeklyRestDay}
          onChange={(e) => setWeeklyRestDay(Number(e.target.value))}
          disabled={saving}
          className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60"
        >
          {WEEKLY_REST_DAY_NAMES.map((name, idx) => (
            <option key={name} value={idx}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-muted-foreground">
            Break start (optional)
          </span>
          <input
            type="time"
            value={breakStart}
            onChange={(e) => setBreakStart(e.target.value)}
            disabled={saving}
            className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-muted-foreground">
            Break end (optional)
          </span>
          <input
            type="time"
            value={breakEnd}
            onChange={(e) => setBreakEnd(e.target.value)}
            disabled={saving}
            className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </label>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Saving...
            </>
          ) : (
            "Save"
          )}
        </button>
      </div>
    </div>
  );
}
