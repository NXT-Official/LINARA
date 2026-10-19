import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/shared/modal";
import { useAppStores } from "@/features/dashboard/app-store-context";

import { cancelFn, renewFn, startCheckoutFn } from "../billing.actions";
import {
  billingErrorCopy,
  fmtLongDate,
  isHttpsUrl,
  type BillingSnapshot,
  type CheckoutResult,
  type PlatformInvoice,
  type Subscription,
} from "../billing.types";
import { PlanPicker, type CheckoutChoice } from "../components/plan-picker";
import { useBilling } from "../hooks/use-billing";
import { fmtCentavos } from "../money";
import { listPublicPlansFn } from "../plan.actions";
import type { Plan } from "../plan.types";

const PAID_COPY = "Paid, thank you.";
const NOT_PAID_COPY = "Payment didn't go through. Try again when you're ready.";
const UNAVAILABLE_COPY = "Payments aren't switched on yet — message us from Help.";

const PENDING_KEY = "linara_billing_pending_invoice";

/** The invoice the household left for Xendit with, so coming back can tell WHICH payment to wait for. */
function rememberPendingInvoice(id: string) {
  try {
    window.sessionStorage.setItem(PENDING_KEY, id);
  } catch {
    // No storage: the page falls back to the newest invoice.
  }
}
function readPendingInvoice(): string | null {
  try {
    return window.sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}
function clearPendingInvoice() {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

const SECTION = "rounded-3xl bg-card p-5 shadow-soft ring-1 ring-border/20 sm:p-6";
const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep disabled:opacity-50";
const QUIET_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary disabled:opacity-50";

const PILL: Record<string, { label: string; tone: string }> = {
  active: { label: "Active", tone: "bg-status-done-soft text-status-done-ink" },
  paid: { label: "Paid", tone: "bg-status-done-soft text-status-done-ink" },
  trialing: { label: "Trial", tone: "bg-secondary text-pine-deep" },
  pending: { label: "Waiting for payment", tone: "bg-secondary text-pine-deep" },
  past_due: { label: "Past due", tone: "bg-status-late-soft text-status-late-ink" },
  expired: { label: "Expired", tone: "bg-status-late-soft text-status-late-ink" },
  failed: { label: "Failed", tone: "bg-status-late-soft text-status-late-ink" },
  canceled: { label: "Canceled", tone: "bg-secondary text-muted-foreground" },
  revoked: { label: "Revoked", tone: "bg-secondary text-muted-foreground" },
};

function Pill({ status }: { status: string }) {
  const pill = PILL[status] ?? { label: status, tone: "bg-secondary text-muted-foreground" };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${pill.tone}`}
    >
      {pill.label}
    </span>
  );
}

const seatText = (used: number, seats: number | null, hasPlan: boolean) => {
  if (!hasPlan) return String(used);
  return seats === null ? `${used}, no limit` : `${used} of ${seats}`;
};

const stillPayable = (invoice: PlatformInvoice) =>
  invoice.status === "pending" &&
  !!invoice.paymentUrl &&
  isHttpsUrl(invoice.paymentUrl) &&
  (!invoice.expiresAt || new Date(invoice.expiresAt).getTime() > Date.now());

/** One rule for every Pay link: payable, and its subscription isn't canceled (paying would reactivate it). */
const payable = (invoice: PlatformInvoice, subscriptions: Subscription[]) =>
  stillPayable(invoice) &&
  !subscriptions.some(
    (s) => s.id === invoice.subscriptionId && (s.status === "canceled" || s.revoked),
  );

function PlanSection({
  data,
  isPrimary,
  busy,
  onRenew,
  onCancel,
}: {
  data: BillingSnapshot;
  isPrimary: boolean;
  busy: boolean;
  onRenew: (subscriptionId: string) => void;
  onCancel: (subscriptionId: string) => void;
}) {
  const ent = data.entitlements;
  const source = ent?.source ?? "none";
  const status = ent?.effectiveStatus ?? ent?.status ?? null;
  const hasPlan = source !== "none";
  const subscription = data.subscriptions.find((s) => s.id === ent?.subscriptionId) ?? null;
  const pending = data.invoices.find(
    (i) =>
      payable(i, data.subscriptions) && (!subscription || i.subscriptionId === subscription.id),
  );
  // A lapsed plan has no entitlement (source is free or none) but still has its row to renew.
  const hasSub = !!ent?.subscriptionId;
  const ended = status === "expired" || status === "past_due";
  const revoked = subscription?.revoked === true;
  const canRenew =
    isPrimary && subscription !== null && !revoked && subscription.interval !== "one_time";
  const canCancel =
    isPrimary &&
    subscription !== null &&
    !revoked &&
    subscription.status !== "canceled" &&
    status !== "expired" &&
    status !== "canceled";
  const [confirming, setConfirming] = useState(false);

  const name = hasSub ? (ent?.planName ?? "Your plan") : hasPlan ? "Free" : "No plan";
  const endLabel = status === "trialing" ? "Trial ends" : ended ? "Plan period" : "Period ends";

  return (
    <section className={SECTION} aria-labelledby="your-plan">
      <h2 id="your-plan" className="font-display text-xl text-foreground">
        Your plan
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <p className="text-lg font-semibold text-foreground">{name}</p>
        {hasSub && status && <Pill status={revoked ? "revoked" : status} />}
      </div>

      <ul className="mt-3 divide-y divide-border/60 border-y border-border/60">
        <li className="flex justify-between gap-3 py-2.5 text-sm">
          <span className="text-foreground">Helpers</span>
          <span className="text-foreground">
            {seatText(data.usage.helpers, ent?.helperSeats ?? null, hasPlan)}
          </span>
        </li>
        <li className="flex justify-between gap-3 py-2.5 text-sm">
          <span className="text-foreground">Managers</span>
          <span className="text-foreground">
            {seatText(data.usage.managers, ent?.managerSeats ?? null, hasPlan)}
          </span>
        </li>
        {hasSub && ent?.periodEnd && (
          <li className="flex justify-between gap-3 py-2.5 text-sm">
            <span className="text-foreground">{endLabel}</span>
            <span className="text-foreground">
              {ended ? `Ended ${fmtLongDate(ent.periodEnd)}` : fmtLongDate(ent.periodEnd)}
              {!ended && ent.daysLeft !== null && ent.daysLeft >= 0
                ? ` · ${ent.daysLeft} ${ent.daysLeft === 1 ? "day" : "days"} left`
                : ""}
            </span>
          </li>
        )}
      </ul>

      {!isPrimary && (
        <p className="mt-3 text-sm text-muted-foreground">
          Only the household&rsquo;s primary manager can change the plan.
        </p>
      )}

      {revoked && (
        <p className="mt-3 text-sm text-muted-foreground">
          This plan was ended by Linara support.{" "}
          <Link to="/manager/help" className="font-semibold text-primary hover:underline">
            Message us from Help
          </Link>{" "}
          if that&rsquo;s unexpected.
        </p>
      )}

      {!revoked && (pending || canRenew || canCancel) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {pending?.paymentUrl && isPrimary && (
            <a
              href={pending.paymentUrl}
              onClick={() => rememberPendingInvoice(pending.id)}
              className={PRIMARY_BUTTON}
            >
              Pay now
            </a>
          )}
          {canRenew && !pending && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRenew(subscription.id)}
              className={PRIMARY_BUTTON}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Renew
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(true)}
              className={QUIET_BUTTON}
            >
              Cancel plan
            </button>
          )}
        </div>
      )}

      {confirming && subscription && (
        <Modal onClose={() => setConfirming(false)}>
          <h3 className="font-display text-xl text-foreground">Cancel this plan?</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {subscription.amountCentavos === 0
              ? "Your plan ends now; nothing renews after that."
              : subscription.currentPeriodEnd
                ? `Your plan stays active until ${fmtLongDate(subscription.currentPeriodEnd)}; nothing renews after that.`
                : "Your plan stays active; nothing renews after that."}{" "}
            Then seats go back to the free tier. Everyone you have keeps working; you just
            can&rsquo;t add more until you pick a plan again.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              Keep my plan
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onCancel(subscription.id);
              }}
              className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel plan
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function InvoicesSection({
  invoices,
  subscriptions,
}: {
  invoices: PlatformInvoice[];
  subscriptions: Subscription[];
}) {
  return (
    <section className={SECTION} aria-labelledby="invoices">
      <h2 id="invoices" className="font-display text-xl text-foreground">
        Invoices
      </h2>
      {invoices.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing billed yet. Your invoices will show up here.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/60 border-y border-border/60">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{inv.invoiceNumber}</p>
                {inv.periodStart && inv.periodEnd && (
                  <p className="text-sm text-muted-foreground">
                    {fmtLongDate(inv.periodStart)} to {fmtLongDate(inv.periodEnd)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-foreground">{fmtCentavos(inv.amountCentavos)}</span>
                <Pill status={inv.status} />
                {payable(inv, subscriptions) && inv.paymentUrl && (
                  <a
                    href={inv.paymentUrl}
                    onClick={() => rememberPendingInvoice(inv.id)}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    Pay
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** /manager/plan: what the household has, what it can buy, and what it has been billed. */
export function ManagerPlanPage({ paid }: { paid?: 1 | 0 }) {
  const { session } = useAppStores();
  const householdId = session.householdId;
  const { status, data, refresh } = useBilling({
    token: session.token,
    householdId,
    ready: session.status === "authed",
  });
  const [plans, setPlans] = useState<{ status: "loading" | "ready" | "error"; list: Plan[] }>({
    status: "loading",
    list: [],
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listPublicPlansFn({ data: {} })
      .then((r) => !cancelled && setPlans({ status: "ready", list: r.available ? r.plans : [] }))
      .catch(() => !cancelled && setPlans({ status: "error", list: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  // Coming back from Xendit's page. The redirect proves nothing: "paid" is
  // only said once this household's newest invoice really is paid.
  const toasted = useRef(false);
  const [pendingId] = useState(() => (paid !== undefined ? readPendingInvoice() : null));
  const watched = pendingId ? data?.invoices.find((i) => i.id === pendingId) : data?.invoices[0];
  const latestPaid = watched?.status === "paid";
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (toasted.current) return;
    if (paid === 0) {
      toasted.current = true;
      clearPendingInvoice();
      toast.error(NOT_PAID_COPY);
    } else if (paid === 1 && latestPaid) {
      toasted.current = true;
      clearPendingInvoice();
      toast.success(PAID_COPY);
    }
  }, [paid, latestPaid]);

  // The webhook, not the redirect, moves the plan: look again whenever the tab
  // comes back, and for a minute after a payment until the newest invoice is paid.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (paid !== 1 || latestPaid) return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      if (Date.now() - startedAt >= 60_000) {
        clearInterval(id);
        setTimedOut(true);
        return;
      }
      void refresh();
    }, 5_000);
    return () => clearInterval(id);
  }, [paid, latestPaid, refresh]);

  const handle = useCallback(
    async (action: () => Promise<CheckoutResult>) => {
      setBusy(true);
      try {
        const result = await action();
        if ("available" in result) {
          toast.error(UNAVAILABLE_COPY);
        } else if (!result.ok) {
          toast.error(billingErrorCopy(result.code));
        } else if (result.trialing) {
          toast.success("Your trial has started.");
          await refresh();
        } else if (result.invoiceUrl && isHttpsUrl(result.invoiceUrl)) {
          if (result.invoiceId) rememberPendingInvoice(result.invoiceId);
          window.location.assign(result.invoiceUrl);
        } else {
          toast.error(billingErrorCopy("PAYMENT_PROVIDER"));
        }
      } catch {
        toast.error("Couldn't reach Linara. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const token = session.token;
  const isPrimary = session.adminType === "primary";

  const checkout = useMemo(
    () => (choice: CheckoutChoice) => {
      if (!token) return;
      void handle(() => startCheckoutFn({ data: { token, ...choice } }));
    },
    [token, handle],
  );

  const renew = (subscriptionId: string) => {
    if (!token || !householdId) return;
    void handle(() => renewFn({ data: { token, subscriptionId, householdId, email: "" } }));
  };

  const cancel = async (subscriptionId: string) => {
    if (!token) return;
    setBusy(true);
    try {
      const result = await cancelFn({ data: { token, subscriptionId } });
      if (result.ok) {
        toast.success("Your plan is canceled.");
        await refresh();
      } else {
        toast.error(billingErrorCopy(result.code));
      }
    } catch {
      toast.error("Couldn't reach Linara. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (status === "unavailable") {
    body = (
      <section className={SECTION}>
        <p className="text-sm text-foreground">{UNAVAILABLE_COPY}</p>
        <Link to="/manager/help" className={`${QUIET_BUTTON} mt-4`}>
          Open Help
        </Link>
      </section>
    );
  } else if (status === "loading" || !data) {
    body =
      status === "error" ? (
        <section className={SECTION}>
          <p role="alert" className="text-sm font-semibold text-destructive">
            {"Couldn't load your plan."}
          </p>
          <button type="button" onClick={() => void refresh()} className={`${QUIET_BUTTON} mt-3`}>
            Try again
          </button>
        </section>
      ) : (
        <section className={SECTION} role="status">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading your plan
          </p>
        </section>
      );
  } else {
    body = (
      <>
        {paid === 1 && !latestPaid && (
          <p
            role="status"
            className="rounded-2xl bg-secondary/60 px-4 py-3 text-sm text-foreground"
          >
            {timedOut
              ? "Xendit hasn't confirmed yet. This page updates on its own; you can also come back later."
              : "Checking your payment with Xendit…"}
          </p>
        )}
        <PlanSection
          data={data}
          isPrimary={isPrimary}
          busy={busy}
          onRenew={renew}
          onCancel={cancel}
        />

        <section className={SECTION} aria-labelledby="choose-a-plan">
          <h2 id="choose-a-plan" className="font-display text-xl text-foreground">
            Choose a plan
          </h2>
          {!isPrimary ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Only the household&rsquo;s primary manager can change the plan.
            </p>
          ) : plans.status === "loading" ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading plans
            </p>
          ) : plans.status === "error" ? (
            <p role="alert" className="mt-2 text-sm font-semibold text-destructive">
              Couldn&rsquo;t load the plans. Refresh the page to try again.
            </p>
          ) : plans.list.length === 0 || !householdId ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No plans are on sale right now. Message us from Help and we will work one out.
            </p>
          ) : (
            <div className="mt-3">
              <PlanPicker
                plans={plans.list}
                usage={data.usage}
                homes={data.homes}
                trialEligibleByPlan={data.trialEligibleByPlan}
                currentHouseholdId={householdId}
                busy={busy}
                onSubmit={checkout}
              />
            </div>
          )}
        </section>

        <InvoicesSection invoices={data.invoices} subscriptions={data.subscriptions} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">
        Plan &amp; billing
      </h1>
      {body}
    </div>
  );
}
