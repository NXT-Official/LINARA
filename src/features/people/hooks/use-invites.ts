import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { fmtHM12 } from "@/lib/time";

import {
  cancelInviteFn,
  endEmploymentFn,
  inviteHelperFn,
  listHelperProfilesFn,
  listInviteFlagsFn,
  resolveInviteFlagFn,
  updateHelperPantryRoleFn,
  updateHelperWageFn,
  type InviteFlagRow,
} from "../people.actions";
import { WEEKLY_REST_DAY_NAMES } from "../people.constants";
import type { Invite, InviteFlag, PantryRole, Station } from "../people.types";

export type InviteStore = ReturnType<typeof useInvites>;

export interface HelperProfileRow {
  id: string;
  name: string;
  station: string;
  employment: "live-in" | "live-out" | null;
  shift_start: string;
  shift_end: string;
  weekly_rest_day: number;
  daily_break_duration: number;
  break_start: string | null;
  break_end: string | null;
  monthly_rate: number;
  payday_interval: "semi_monthly" | "monthly";
  phone: string | null;
  /** Explicit per-helper rest/premium default; NULL means "follow employment".
   * `effective_resolution` is the generated column that resolves the two --
   * read that one. See supabase/add-helper-default-resolution.sql. */
  default_resolution: "rest_owed" | "premium_pay" | null;
  effective_resolution: "rest_owed" | "premium_pay" | null;
  invite_code: string | null;
  status: "PENDING_CLAIM" | "ACTIVE" | "INACTIVE";
  /** Real, per-helper "Available for N hours" opt-in, set from her own
   * device (LINARA_MOBILE) -- see MULTI_HELPER_HANDLING.md. NULL means no
   * active override. */
  manual_status: "available" | "off" | null;
  manual_available_until: string | null;
  /** Her last working day once the employment has ended (add-employment-end.sql). */
  ended_on?: string | null;
  /** add-pay-periods.sql: her first day, and notice she gave from her app. */
  started_on?: string | null;
  /** add-leave.sql: the unpaid-leave divisor, 365 by default. */
  pay_days_per_year?: number;
  notice_last_day?: string | null;
  notice_note?: string | null;
  /** add-pantry-roles.sql: in charge of the pantry, or buys from the list. */
  pantry_role?: PantryRole;
  created_at: string;
}

function toFlag(row: InviteFlagRow): InviteFlag {
  return {
    id: row.id,
    field: row.field,
    note: row.note ?? undefined,
    at: new Date(row.created_at).getTime(),
  };
}

function toInvite(row: HelperProfileRow, flags: InviteFlag[] = []): Invite {
  return {
    id: row.id,
    code: row.invite_code ?? "",
    name: row.name,
    station: row.station as Station,
    employment: row.employment ?? "live-in",
    shiftStart: row.shift_start,
    shiftEnd: row.shift_end,
    shift: `${fmtHM12(row.shift_start)} – ${fmtHM12(row.shift_end)}`,
    restDay: WEEKLY_REST_DAY_NAMES[row.weekly_rest_day] ?? "Sunday",
    wagePHP: Number(row.monthly_rate),
    phone: row.phone ?? "",
    createdAt: new Date(row.created_at).getTime(),
    createdBy: "Manager",
    status: row.status === "ACTIVE" ? "active" : row.status === "INACTIVE" ? "ended" : "pending",
    endedOn: row.ended_on ?? undefined,
    startedOn: row.started_on ?? row.created_at.slice(0, 10),
    noticeLastDay: row.notice_last_day ?? undefined,
    noticeNote: row.notice_note ?? undefined,
    pantryRole: row.pantry_role,
    flags,
  };
}

/**
 * The invite -> claim lifecycle. Real data once a manager is signed in
 * (`token` set): fetches PENDING_CLAIM/ACTIVE helper_profiles rows for the
 * manager's own household (RLS-scoped, see helper_profiles_isolation in
 * ARCHITECTURE.md). Starts and stays empty for a helper session (no
 * manager token) -- helper-shell.tsx/claim-account-flow.tsx only ever
 * patch this list locally as a display fallback, same as before this
 * hook talked to Supabase.
 */
export function useInvites({ token, ready }: { token: string | null; ready: boolean }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  // Raw rows alongside the display-mapped `invites` above, so other stores
  // (Shifts) can derive from this same fetch instead of re-querying
  // helper_profiles themselves.
  const [helperProfiles, setHelperProfiles] = useState<HelperProfileRow[]>([]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [rows, flagRows] = await Promise.all([
      listHelperProfilesFn({ data: { token } }) as Promise<HelperProfileRow[]>,
      listInviteFlagsFn({ data: { token } }),
    ]);
    const flagsByHelper = new Map<string, InviteFlag[]>();
    for (const f of flagRows) {
      flagsByHelper.set(f.invite_id, [...(flagsByHelper.get(f.invite_id) ?? []), toFlag(f)]);
    }
    setHelperProfiles(rows);
    setInvites(rows.map((r) => toInvite(r, flagsByHelper.get(r.id))));
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    refresh().catch((err) => {
      console.error("[useInvites] Failed to load helper roster:", err);
    });
  }, [ready, token, refresh]);

  const create = async (
    // `shift` is display-only and derived below -- callers pass the raw
    // shiftStart/shiftEnd instead, so nothing has to parse a localized string
    // back into data.
    data: Omit<Invite, "id" | "code" | "createdAt" | "createdBy" | "status" | "flags" | "shift"> & {
      paydayInterval: "semi_monthly" | "monthly";
    },
    byName: string,
  ): Promise<Invite> => {
    if (!token) throw new Error("Not authenticated");

    const { shiftStart, shiftEnd } = data;
    const weeklyRestDay = WEEKLY_REST_DAY_NAMES.indexOf(
      data.restDay as (typeof WEEKLY_REST_DAY_NAMES)[number],
    );

    const result = await inviteHelperFn({
      data: {
        name: data.name,
        station: data.station,
        monthlyRate: data.wagePHP,
        paydayInterval: data.paydayInterval,
        shiftStart,
        shiftEnd,
        weeklyRestDay: weeklyRestDay >= 0 ? weeklyRestDay : 0,
        employment: data.employment,
        phone: data.phone,
        startedOn: data.startedOn,
        token,
      },
    });

    const invite: Invite = {
      id: result.helperId,
      code: result.inviteCode,
      name: data.name,
      station: data.station,
      employment: data.employment,
      shiftStart,
      shiftEnd,
      shift: `${fmtHM12(shiftStart)} – ${fmtHM12(shiftEnd)}`,
      restDay: data.restDay,
      wagePHP: data.wagePHP,
      phone: data.phone,
      createdAt: Date.now(),
      createdBy: byName,
      status: "pending",
      flags: [],
    };
    setInvites((prev) => [invite, ...prev]);
    return invite;
  };

  const cancel = async (id: string) => {
    if (!token) return;
    setInvites((prev) => prev.filter((i) => i.id !== id));
    try {
      await cancelInviteFn({ data: { token, helperId: id } });
    } catch (err) {
      console.error("[useInvites] Failed to cancel invite:", err);
      // Roll back the optimistic removal -- refetch to recover the true state.
      refresh().catch(() => {});
    }
  };

  /** Her last day, and where her open tasks go (another active helper, or
   * null to remove them). Write-then-refresh: the roster, payroll and
   * schedules all derive from this list. */
  const endEmployment = async (id: string, lastDay: string, reassignTo: string | null) => {
    if (!token) throw new Error("Not authenticated");
    const result = await endEmploymentFn({ data: { token, helperId: id, lastDay, reassignTo } });
    await refresh();
    return result;
  };

  const patch = (id: string, fn: (invite: Invite) => Invite) =>
    setInvites((prev) => prev.map((i) => (i.id === id ? fn(i) : i)));

  /** A raise, or fixing a typo'd wage -- monthly_rate was previously
   * write-once (only inviteHelperFn set it). Write-then-refresh, same
   * pattern as useGroceryList's setBudget, since the new wage feeds several
   * other real reads (Pay Dial, contribution split, minimum-wage banner). */
  const updateWage = async (id: string, monthlyRate: number) => {
    if (!token) return;
    await updateHelperWageFn({ data: { token, helperId: id, monthlyRate } });
    await refresh();
  };

  /** Shows the new choice at once; puts the old one back if it didn't save. */
  const setPantryRole = async (id: string, pantryRole: PantryRole) => {
    if (!token) return;
    const before = invites.find((i) => i.id === id)?.pantryRole;
    patch(id, (i) => ({ ...i, pantryRole }));
    try {
      await updateHelperPantryRoleFn({ data: { token, helperId: id, pantryRole } });
    } catch (err) {
      patch(id, (i) => ({ ...i, pantryRole: before }));
      throw err;
    }
  };

  return {
    invites,
    helperProfiles,
    refresh,
    create,
    cancel,
    endEmployment,
    updateWage,
    setPantryRole,
    resolveFlag: (inviteId: string, flagId: string) => {
      if (!token) return;
      // Hide it at once; put it back if the delete didn't go through.
      const before = invites.find((i) => i.id === inviteId)?.flags ?? [];
      patch(inviteId, (i) => ({ ...i, flags: i.flags.filter((f) => f.id !== flagId) }));
      resolveInviteFlagFn({ data: { token, flagId } }).catch((err) => {
        console.error("[useInvites] Failed to resolve flag:", err);
        patch(inviteId, (i) => ({ ...i, flags: before }));
        toast.error("Hindi na-resolve ang flag.");
      });
    },
  };
}
