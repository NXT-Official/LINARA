import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient, supabaseClient } from "@/lib/supabase";

import type {
  ActiveSelection,
  AddonLine,
  CatalogAddon,
  CatalogPlan,
  Cycle,
  LimitKey,
  MySubscription,
  Usage,
} from "./plan.types";

/**
 * Billing (supabase/add-billing.sql). Reads and the changes that cost nothing
 * are SECURITY DEFINER functions under the manager's own token; a payment
 * goes through the billing-checkout Edge Function, which works the amount
 * out in the database and opens a Xendit page. Their error messages are
 * written to be shown as they are.
 */

export type BillingPayment = {
  id: string;
  kind: "plan" | "addons";
  /** Xendit's invoice id. */
  reference: string;
  planId: string;
  cycle: Cycle;
  /** Centavos. */
  amount: number;
  /** Xendit's channel once paid ("GCASH", "CREDIT_CARD"), else null. */
  method: string | null;
  /** cancelled: replaced by a newer payment before it was paid. */
  status: "pending" | "paid" | "failed" | "expired" | "review" | "cancelled";
  at: string;
  paidAt: string | null;
  failureReason: string | null;
  /** The Xendit page, while it can still be paid. */
  invoiceUrl: string | null;
};

export type BillingCatalog = {
  plans: CatalogPlan[];
  addons: CatalogAddon[];
  switches: { staff_pay_hr: boolean };
};

export type MyBilling = {
  subscription: MySubscription;
  limits: Record<LimitKey, number | null>;
  /** Across every household the manager owns; null for a co-manager. */
  usage: Usage | null;
  selection: ActiveSelection | null;
  payments: BillingPayment[];
  catalog: BillingCatalog;
  /** Xendit test mode: nothing real is charged. */
  testMode: boolean;
  /** The signed-in account pays for this plan (false: a co-manager or remote admin). */
  owner: boolean;
};

/** The functions aren't in this database yet (add-billing.sql not applied). */
const isMissing = (error: { code?: string; message?: string } | null) =>
  !!error &&
  (error.code === "PGRST202" ||
    /could not find the function|does not exist/i.test(error.message ?? ""));

const testMode = () => process.env.XENDIT_LIVE !== "true";

/** The manager's plan, usage and payments; `missing` before billing is set up here. */
export const getMyBillingFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(
    async ({ data }): Promise<{ missing: true } | { missing: false; billing: MyBilling }> => {
      const client = createAuthedClient(data.token);
      const { data: row, error } = await client.rpc("my_billing");
      if (isMissing(error)) return { missing: true };
      if (error && /primary manager/i.test(error.message)) {
        // A co-manager or remote admin: the household's plan is its owner's (R2).
        const [{ data: household, error: householdError }, { data: catalog, error: catalogError }] =
          await Promise.all([client.rpc("my_household_plan"), client.rpc("billing_catalog")]);
        if (householdError || catalogError) {
          throw new Error((householdError ?? catalogError)?.message);
        }
        const h = household as { subscription: MySubscription; limits: MyBilling["limits"] };
        return {
          missing: false,
          billing: {
            subscription: h.subscription,
            limits: h.limits,
            usage: null,
            selection: null,
            payments: [],
            catalog: catalog as BillingCatalog,
            testMode: testMode(),
            owner: false,
          },
        };
      }
      if (error) throw new Error(error.message);
      return {
        missing: false,
        billing: {
          ...(row as Omit<MyBilling, "testMode" | "owner">),
          testMode: testMode(),
          owner: true,
        },
      };
    },
  );

/** What's on sale, signed out (the landing page); null before billing is set up. */
export const getCatalogFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BillingCatalog | null> => {
    const { data, error } = await supabaseClient.rpc("billing_catalog");
    if (isMissing(error)) return null;
    if (error) throw new Error(error.message);
    return data as BillingCatalog;
  },
);

type Done = { ok: true } | { ok: false; message: string };

export const changeToFreeFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<Done> => {
    const { error } = await createAuthedClient(data.token).rpc("billing_change_to_free");
    return error ? { ok: false, message: error.message } : { ok: true };
  });

export const cancelPlanFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<Done> => {
    const { error } = await createAuthedClient(data.token).rpc("billing_cancel_plan");
    return error ? { ok: false, message: error.message } : { ok: true };
  });

export const resumePlanFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<Done> => {
    const { error } = await createAuthedClient(data.token).rpc("billing_resume_plan");
    return error ? { ok: false, message: error.message } : { ok: true };
  });

export const removeAddonsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; addons: AddonLine[] }) => data)
  .handler(async ({ data }): Promise<Done> => {
    const { error } = await createAuthedClient(data.token).rpc("billing_remove_addons", {
      p_addons: data.addons,
    });
    return error ? { ok: false, message: error.message } : { ok: true };
  });

export const saveSelectionFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; selection: ActiveSelection }) => data)
  .handler(async ({ data }): Promise<Done> => {
    const { error } = await createAuthedClient(data.token).rpc("billing_save_selection", {
      p_households: data.selection.households,
      p_kasambahay: data.selection.kasambahay,
    });
    return error ? { ok: false, message: error.message } : { ok: true };
  });

export type CheckoutInput = {
  token: string;
  kind: "plan" | "addons";
  planId: string | null;
  cycle: Cycle | null;
  addons: AddonLine[];
  /** This page's origin, so Xendit sends the manager back here. */
  returnUrl: string;
};

/** Opens a Xendit payment page for a plan or add-ons; the amount is worked out in the database. */
export const startCheckoutFn = createServerFn({ method: "POST" })
  .validator((data: CheckoutInput) => data)
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; invoiceUrl: string; paymentId: string } | { ok: false; message: string }
    > => {
      const { token, ...body } = data;
      let res: Response;
      try {
        res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/billing-checkout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: process.env.SUPABASE_ANON_KEY ?? "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch {
        return {
          ok: false,
          message: "Couldn't reach payments. Check your connection and try again.",
        };
      }
      const json = (await res.json().catch(() => null)) as {
        invoiceUrl?: string;
        paymentId?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.invoiceUrl || !json.paymentId) {
        return { ok: false, message: json?.error ?? "Couldn't start the payment. Try again." };
      }
      return { ok: true, invoiceUrl: json.invoiceUrl, paymentId: json.paymentId };
    },
  );
