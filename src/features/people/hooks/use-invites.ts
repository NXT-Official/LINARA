import { useCallback, useEffect, useState } from "react";

import {
  cancelInviteFn,
  inviteHelperFn,
  listHelperProfilesFn,
  updateHelperWageFn,
} from "../people.actions";
import { WEEKLY_REST_DAY_NAMES } from "../people.constants";
import type { Invite, Station } from "../people.types";

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
  invite_code: string | null;
  status: "PENDING_CLAIM" | "ACTIVE" | "INACTIVE";
  created_at: string;
}

function toInvite(row: HelperProfileRow): Invite {
  return {
    id: row.id,
    code: row.invite_code ?? "",
    name: row.name,
    station: row.station as Station,
    employment: row.employment ?? "live-in",
    shift: `${row.shift_start} - ${row.shift_end}`,
    restDay: WEEKLY_REST_DAY_NAMES[row.weekly_rest_day] ?? "Sunday",
    wagePHP: Number(row.monthly_rate),
    phone: row.phone ?? "",
    createdAt: new Date(row.created_at).getTime(),
    createdBy: "Manager",
    status: row.status === "ACTIVE" ? "active" : "pending",
    flags: [],
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
    const rows = (await listHelperProfilesFn({ data: { token } })) as HelperProfileRow[];
    setHelperProfiles(rows);
    setInvites(rows.map(toInvite));
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    refresh().catch((err) => {
      console.error("[useInvites] Failed to load helper roster:", err);
    });
  }, [ready, token, refresh]);

  const create = async (
    data: Omit<Invite, "id" | "code" | "createdAt" | "createdBy" | "status" | "flags"> & {
      paydayInterval: "semi_monthly" | "monthly";
    },
    byName: string,
  ): Promise<Invite> => {
    if (!token) throw new Error("Not authenticated");

    const [shiftStart, shiftEnd] = data.shift.split(" - ");
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
        token,
      },
    });

    const invite: Invite = {
      id: result.helperId,
      code: result.inviteCode,
      name: data.name,
      station: data.station,
      employment: data.employment,
      shift: data.shift,
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

  return {
    invites,
    helperProfiles,
    refresh,
    create,
    cancel,
    updateWage,
    resolveFlag: (inviteId: string, flagId: string) =>
      patch(inviteId, (i) => ({ ...i, flags: i.flags.filter((f) => f.id !== flagId) })),
  };
}
