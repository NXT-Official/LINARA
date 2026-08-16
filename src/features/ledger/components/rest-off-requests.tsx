import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, Clock, X } from "lucide-react";
import { toast } from "sonner";

import { fmtHM12 } from "@/lib/time";
import type { Helper } from "@/features/people/people.types";

import {
  decideRestOffRequestFn,
  getRestOwedBalanceFn,
  listRestOffRequestsFn,
  type RestOffRequestRow,
} from "../rest-off.actions";
import { fmtHoursMinutes } from "../ledger.utils";

const STATUS_TONE: Record<RestOffRequestRow["status"], string> = {
  pending: "bg-accent/10 text-accent",
  approved: "bg-emerald/10 text-emerald",
  declined: "bg-destructive/10 text-destructive",
  cancelled: "bg-secondary text-muted-foreground",
};

/**
 * Manager-facing half of the rest-off flow: the helper asks for time off from
 * LINARA_MOBILE, this approves or declines it, and approval debits the
 * accrued balance (supabase/add-rest-off-requests.sql).
 *
 * Balance comes from `rest_owed_balance_minutes` rather than being summed in
 * the browser, so it is the same number the helper sees and the same one the
 * approval guard enforces -- the manager can never be looking at a balance the
 * database disagrees with.
 */
export function RestOffRequests({
  helper,
  token,
  ready,
}: {
  helper: Helper | null;
  token: string | null;
  ready: boolean;
}) {
  const [requests, setRequests] = useState<RestOffRequestRow[]>([]);
  const [balanceMin, setBalanceMin] = useState<number | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !helper) return;
    const [rows, balance] = await Promise.all([
      listRestOffRequestsFn({ data: { token } }),
      getRestOwedBalanceFn({ data: { token, helperId: helper.id } }),
    ]);
    setRequests(rows.filter((r) => r.helper_id === helper.id));
    setBalanceMin(balance.minutes);
  }, [token, helper]);

  useEffect(() => {
    if (!ready || !token || !helper) return;
    refresh().catch((err) => {
      console.error("[RestOffRequests] Failed to load:", err);
    });
  }, [ready, token, helper, refresh]);

  if (!helper) return null;

  const decide = async (id: string, decision: "approved" | "declined") => {
    if (!token) return;
    setDeciding(id);
    try {
      const res = await decideRestOffRequestFn({ data: { token, requestId: id, decision } });
      await refresh();
      toast.success(
        decision === "approved"
          ? `Approved. ${fmtHoursMinutes(res.balanceAfter)} rest owed na lang ang natitira.`
          : "Na-decline ang request.",
      );
    } catch (err) {
      // The guard can legitimately refuse here -- e.g. another manager approved
      // something else first and the balance no longer covers this.
      toast.error(err instanceof Error ? err.message : "Hindi na-update ang request.");
      await refresh().catch(() => {});
    } finally {
      setDeciding(null);
    }
  };

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground block">
            Rest off requests
          </span>
          <h3 className="font-display text-lg text-foreground">
            {balanceMin === null ? "…" : fmtHoursMinutes(balanceMin)} rest owed
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Time-off in lieu accrued from off-shift work — redeemed, not paid out.
          </p>
        </div>
        <CalendarDays className="h-5 w-5 shrink-0 text-accent" />
      </div>

      {pending.length === 0 && decided.length === 0 && (
        <p className="mt-4 border-t border-border/40 pt-3.5 text-xs text-muted-foreground">
          Walang rest-off request. {helper.short} can ask for time off from their own app.
        </p>
      )}

      {pending.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border/40 pt-3.5">
          {pending.map((r) => (
            <div key={r.id} className="rounded-xl border border-border/50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {r.rest_date} · {fmtHM12(r.start_time)}–{fmtHM12(r.end_time)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    <Clock className="mr-0.5 inline h-3 w-3" />
                    {fmtHoursMinutes(r.minutes)}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => decide(r.id, "approved")}
                    disabled={deciding !== null}
                    className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition hover:bg-pine-deep disabled:opacity-60"
                  >
                    <Check className="h-3 w-3" /> Approve
                  </button>
                  <button
                    onClick={() => decide(r.id, "declined")}
                    disabled={deciding !== null}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground transition hover:bg-secondary disabled:opacity-60"
                  >
                    <X className="h-3 w-3" /> Decline
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border/40 pt-3">
          {decided.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-[11px]"
            >
              <span className="text-muted-foreground">
                {r.rest_date} · {fmtHoursMinutes(r.minutes)}
                {r.decline_reason ? ` · ${r.decline_reason}` : ""}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[r.status]}`}
              >
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
