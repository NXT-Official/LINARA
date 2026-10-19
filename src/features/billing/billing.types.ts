/** What a household may use right now (billing_household_entitlements). A null seat count is unlimited. */
export type Entitlements = {
  source: "subscription" | "free" | "none";
  subscriptionId: string | null;
  planName: string | null;
  status: string | null;
  effectiveStatus: string | null;
  helperSeats: number | null;
  managerSeats: number | null;
  periodEnd: string | null;
  daysLeft: number | null;
};

/** One subscription of billing_my_billing (the staff note is never sent). */
export type Subscription = {
  id: string;
  planId: string;
  ownerUserId: string | null;
  status: string;
  /** A null seat count is unlimited. */
  helperSeats: number | null;
  managerSeats: number | null;
  homeSeats: number;
  amountCentavos: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  createdAt: string;
};

/** One invoice of billing_my_billing: the 13 columns a household may see. */
export type PlatformInvoice = {
  id: string;
  invoiceNumber: string;
  subscriptionId: string;
  externalId: string;
  paymentUrl: string | null;
  expiresAt: string | null;
  status: string;
  amountCentavos: number;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type SeatUsage = { helpers: number; managers: number };
export type BillingHome = { id: string; name: string; primary: boolean };

export type BillingSnapshot = {
  available: boolean;
  entitlements: Entitlements | null;
  subscriptions: Subscription[];
  invoices: PlatformInvoice[];
  usage: SeatUsage;
  homes: BillingHome[];
  /** Per public plan: does the database (billing_trial_eligible) offer this home a trial on it? */
  trialEligibleByPlan: Record<string, boolean>;
};

export type CheckoutResult =
  | { available: false }
  | { ok: true; invoiceUrl: string | null; trialing: boolean; invoiceId: string | null }
  | { ok: false; code: string };

export type SeatKind = "helper" | "manager";

/** True for the error an invite raises when the plan has no seat left ("SEAT_LIMIT:helper"). */
export const isSeatLimitError = (err: unknown): boolean =>
  err instanceof Error && err.message.startsWith("SEAT_LIMIT:");

/** The code at the front of an RPC message: "SEATS_OVER_PLAN:helper" -> "SEATS_OVER_PLAN". */
export const errorCodeOf = (message: string): string => message.split(":")[0]?.trim() ?? "";

/** What a person reads for each code the billing RPCs and checkout can return. */
export function billingErrorCopy(code: string): string {
  const base = errorCodeOf(code);
  switch (base) {
    case "NOT_PRIMARY":
      return "Only the household's primary manager can change the plan.";
    case "PLAN_NOT_ACTIVE":
      return "That plan isn't on sale any more. Pick another one.";
    case "SEATS_OVER_PLAN": {
      const kind = code.split(":")[1]?.trim();
      return kind
        ? `That plan doesn't cover that many ${kind}s. Lower the number or pick another plan.`
        : "That plan doesn't cover that many seats. Lower the number or pick another plan.";
    }
    case "ONE_TIME_PLAN":
      return "A one-time plan has nothing to renew.";
    case "NOT_FOUND":
      return "We couldn't find that plan or subscription.";
    case "BAD_SEATS":
      return "Those seat numbers don't work. Check them and try again.";
    case "BAD_PERIOD":
      return "That billing period isn't valid. Try again, or message us from Help.";
    case "BAD_URL":
    case "BAD_SESSION":
      return "We couldn't open the payment page. Nothing was charged. Try again in a minute.";
    case "PAYMENT_PROVIDER":
      return "We couldn't open the payment page. Nothing was charged. Try again in a minute.";
    default:
      return "Something went wrong. Try again, or message us from Help.";
  }
}

/** "October 12, 2026", in Manila time so a period end doesn't slip a day abroad. */
export const fmtLongDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  });

/** A payment page is only ever opened from an https address. */
export const isHttpsUrl = (url: string): boolean => url.startsWith("https://");

/** Kept numeric: the router parses ?paid=1 to 1 and writes it back as paid=1; a string "1" would be re-quoted and redirect. */
export const paidFlag = (value: unknown): 1 | 0 | undefined => {
  if (value === 1 || value === "1") return 1;
  if (value === 0 || value === "0") return 0;
  return undefined;
};

/** What a person joining with a manager code reads when the household has no manager seat left. */
export const joinErrorCopy = (message: string): string =>
  message.startsWith("SEAT_LIMIT:manager")
    ? "This household has used all its manager seats. Ask its primary manager to add one."
    : message;
