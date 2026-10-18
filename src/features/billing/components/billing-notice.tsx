import { Link } from "@tanstack/react-router";

import { useAppStores } from "@/features/dashboard/app-store-context";

import { fmtLongDate, type Entitlements, type SeatUsage } from "../billing.types";
import { useBilling } from "../hooks/use-billing";

const over = (seats: number | null, used: number) => seats !== null && used > seats;

/**
 * What the Pass should say about the plan, or null: a notice appears only when
 * it has a consequence for the household. Losing a plan costs seats only, so
 * a lapsed plan with room left on the free tier is not worth a word.
 */
export function noticeFor(
  entitlements: Entitlements | null,
  usage: SeatUsage,
): { text: string } | null {
  if (!entitlements) return null;
  const status = entitlements.effectiveStatus ?? entitlements.status;

  if (status === "past_due") {
    const when = entitlements.periodEnd ? `on ${fmtLongDate(entitlements.periodEnd)}` : "recently";
    return {
      text: `Your plan's period ended ${when}. You have 7 days to renew before seats go back to the free tier.`,
    };
  }

  if (status === "expired") {
    const tooMany =
      entitlements.source === "none" ||
      over(entitlements.helperSeats, usage.helpers) ||
      over(entitlements.managerSeats, usage.managers);
    return tooMany
      ? { text: "Your plan has lapsed. You can't add helpers or managers until you renew." }
      : null;
  }

  if (status === "trialing" && entitlements.daysLeft !== null && entitlements.daysLeft <= 3) {
    const n = entitlements.daysLeft;
    return {
      text:
        n <= 0 ? "Your trial ends today." : `Your trial ends in ${n} ${n === 1 ? "day" : "days"}.`,
    };
  }

  return null;
}

/** One slim line above the Pass, only when `noticeFor` has something to say. */
export function BillingNotice() {
  const { session } = useAppStores();
  const { data } = useBilling({
    token: session.token,
    householdId: session.householdId,
    ready: session.status === "authed",
  });
  const notice = data ? noticeFor(data.entitlements, data.usage) : null;
  if (!notice) return null;

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-accent/40 bg-terracotta-soft/40 px-4 py-3 text-sm text-foreground"
    >
      <p>{notice.text}</p>
      <Link to="/manager/plan" className="shrink-0 font-semibold text-primary hover:underline">
        See your plan
      </Link>
    </div>
  );
}
