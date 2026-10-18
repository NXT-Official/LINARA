import { useCallback, useEffect, useMemo, useState } from "react";

import { fmtCentavos } from "@/features/billing/money";

import { GrantPlanModal } from "../components/grant-plan-modal";
import { MarkPaidModal } from "../components/mark-paid-modal";
import { usePlatformAdminSession } from "../hooks/use-platform-admin-session";
import { listHouseholdsOverviewFn, type HouseholdOverview } from "../households.actions";

type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "unavailable" }
  | { state: "ready"; households: HouseholdOverview[] };

const INPUT =
  "w-full rounded-2xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";
const PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50";
const SECONDARY =
  "inline-flex items-center justify-center rounded-xl border border-primary/30 bg-card px-3.5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/5";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due",
  pending: "Awaiting payment",
  canceled: "Canceled",
  expired: "Expired",
  free: "Free",
};

const dateFmt = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Manila",
});

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function StatusPill({ status }: { status: string | null }) {
  const key = status ?? "free";
  const good = key === "active" || key === "trialing" || key === "free";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${
        good ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
      }`}
    >
      {STATUS_LABEL[key] ?? key.replace(/_/g, " ")}
    </span>
  );
}

export function PlatformAdminHouseholdsPage() {
  const { token } = usePlatformAdminSession();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [query, setQuery] = useState("");
  const [granting, setGranting] = useState<HouseholdOverview | null>(null);
  const [paying, setPaying] = useState<HouseholdOverview | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoad({ state: "loading" });
    try {
      const reply = await listHouseholdsOverviewFn({ data: { token } });
      setLoad(
        reply.available
          ? { state: "ready", households: reply.households }
          : { state: "unavailable" },
      );
    } catch {
      setLoad({ state: "error" });
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shown = useMemo(() => {
    if (load.state !== "ready") return [];
    const q = query.trim().toLowerCase();
    return q ? load.households.filter((h) => h.name.toLowerCase().includes(q)) : load.households;
  }, [load, query]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-foreground">Households</h1>

      {load.state === "ready" && load.households.length > 0 && (
        <label className="block">
          <span className="sr-only">Search households</span>
          <input
            type="search"
            value={query}
            placeholder="Search by household name"
            onChange={(e) => setQuery(e.target.value)}
            className={INPUT}
          />
        </label>
      )}

      {load.state === "loading" && (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">
          Loading households
        </p>
      )}

      {load.state === "error" && (
        <section
          role="alert"
          className="rounded-3xl border border-border/40 bg-card p-6 text-center"
        >
          <p className="text-sm text-muted-foreground">The households didn't load.</p>
          <button className={`${PRIMARY} mt-4`} onClick={() => void refresh()}>
            Try again
          </button>
        </section>
      )}

      {load.state === "unavailable" && (
        <section className="rounded-3xl border border-border/40 bg-card p-6 text-center">
          <h2 className="font-display text-lg text-foreground">
            Admin tools aren't switched on yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            The subscription tables haven't been set up, so there are no plans to show.
          </p>
        </section>
      )}

      {load.state === "ready" && load.households.length === 0 && (
        <section className="rounded-3xl border border-border/40 bg-card p-6 text-center">
          <h2 className="font-display text-lg text-foreground">No households yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            A household appears here once someone finishes setup.
          </p>
        </section>
      )}

      {load.state === "ready" && load.households.length > 0 && shown.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No household matches &ldquo;{query.trim()}&rdquo;.
        </p>
      )}

      {shown.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-3xl border border-border/40 bg-card px-5 shadow-soft">
          {shown.map((h) => (
            <li key={h.householdId} className="flex flex-wrap items-center gap-3 py-3.5">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm font-semibold text-foreground">{h.name}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {plural(h.managers, "manager")} · {plural(h.helpers, "helper")}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                  <span>{h.entitlements.planName ?? "Free"}</span>
                  <StatusPill status={h.entitlements.effectiveStatus ?? h.entitlements.status} />
                  {h.entitlements.periodEnd && (
                    <span>until {dateFmt.format(new Date(h.entitlements.periodEnd))}</span>
                  )}
                </p>
                {h.pendingInvoice && (
                  <p className="mt-1 text-[13px] text-foreground">
                    Invoice {h.pendingInvoice.invoiceNumber} ·{" "}
                    {fmtCentavos(h.pendingInvoice.amountCentavos)} unpaid
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {h.pendingInvoice && (
                  <button className={PRIMARY} onClick={() => setPaying(h)}>
                    Mark paid
                  </button>
                )}
                <button className={SECONDARY} onClick={() => setGranting(h)}>
                  Grant plan
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {granting && token && (
        <GrantPlanModal
          household={granting}
          token={token}
          onClose={() => setGranting(null)}
          onGranted={() => {
            setGranting(null);
            void refresh();
          }}
        />
      )}
      {paying && token && (
        <MarkPaidModal
          household={paying}
          token={token}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
