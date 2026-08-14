import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";
import { computeStatutorySplit, cutoffsPerMonth } from "@/features/people/people.utils";
import type { PaydayInterval } from "@/features/people/people.types";

import type { PayoutChannelCode } from "./pay.types";
import { currentCutoffRange } from "./pay.utils";

export interface PayslipRow {
  id: string;
  helper_id: string;
  cutoff_start: string;
  cutoff_end: string;
  base_pay: number;
  statutory_employee_share: number;
  vale_deductions: number;
  net_pay: number;
  payout_channel_code: PayoutChannelCode;
  payout_status: "pending_send" | "processing" | "succeeded" | "failed";
  failure_reason: string | null;
  requested_at: string;
  confirmed_at: string | null;
}

/**
 * Lists every payslip in the caller's household. payslips_isolation
 * (supabase/add-payslips-table.sql) scopes this via a join through
 * helper_profiles, same pattern as listValesFn/listLedgerEntriesFn.
 */
export const listPayslipsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const { token } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error } = await authedClient
      .from("payslips")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (rows ?? []) as PayslipRow[];
  });

interface XenditPayoutResponse {
  id?: string;
  message?: string;
  errors?: Array<{ message?: string }>;
}

/**
 * Manager-only (enforced inside initiate_payslip itself, same posture as
 * every other manager-gated RPC in this app -- see
 * create_appointment_with_preps/updateHouseholdBudgetFn). Two-phase, not
 * fully atomic end to end: (1) initiate_payslip inserts the payslip row and
 * settles the helper's unsettled approved vales in one Postgres transaction
 * (true atomicity requirement -- can't happen non-atomically without risking
 * double-counted or dropped vales), then (2) this function calls Xendit and
 * writes the result back with a second, plain update. That second step
 * can't be inside the same DB transaction as step 1 since Postgres can't
 * make outbound HTTPS calls here -- so if the process crashes between (1)
 * and (2), a payslip could be stuck at "pending_send" forever. Low-stakes:
 * it just means a manager sees the payslip and can tell (from the stuck
 * status) that the payout was never actually sent, distinct from a genuine
 * Xendit failure (which sets failure_reason). No auto-retry -- out of scope.
 */
export const initiatePayoutFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string; channelCode: PayoutChannelCode }) => data)
  .handler(async ({ data }) => {
    const { token, helperId, channelCode } = data;
    const authedClient = createAuthedClient(token);

    const { data: helperRow, error: helperError } = await authedClient
      .from("helper_profiles")
      .select("name, phone, monthly_rate, payday_interval")
      .eq("id", helperId)
      .single();

    if (helperError || !helperRow) {
      throw new Error("Helper not found");
    }
    if (!helperRow.phone) {
      throw new Error("This helper has no phone number on file -- add one before paying out.");
    }

    const paydayInterval = helperRow.payday_interval as PaydayInterval;
    const monthlyRate = Number(helperRow.monthly_rate);
    const cutoffs = cutoffsPerMonth(paydayInterval);
    const basePay = monthlyRate / cutoffs;
    const statutoryShare = computeStatutorySplit(monthlyRate).totalEmployee / cutoffs;
    const { cutoffStart, cutoffEnd } = currentCutoffRange(new Date(), paydayInterval);
    const referenceId = crypto.randomUUID();

    const { data: rpcRows, error: rpcError } = await authedClient.rpc("initiate_payslip", {
      p_helper_id: helperId,
      p_cutoff_start: cutoffStart,
      p_cutoff_end: cutoffEnd,
      p_base_pay: basePay,
      p_statutory_employee_share: statutoryShare,
      p_channel_code: channelCode,
      p_reference_id: referenceId,
    });

    if (rpcError || !rpcRows?.[0]) {
      throw new Error(rpcError?.message || "Failed to create payslip");
    }

    const payslipId = rpcRows[0].payslip_id as string;
    const netPay = Number(rpcRows[0].net_pay);

    const xenditKey = process.env.XENDIT_SECRET_WRITE_KEY || "";
    const xenditUrl = process.env.XENDIT_API_URL || "https://api.xendit.co";

    try {
      if (!xenditKey) {
        throw new Error("XENDIT_SECRET_WRITE_KEY is not configured");
      }

      const response = await fetch(`${xenditUrl}/v2/payouts`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${xenditKey}:`).toString("base64")}`,
          "Content-Type": "application/json",
          "Idempotency-key": referenceId,
        },
        body: JSON.stringify({
          reference_id: referenceId,
          channel_code: channelCode,
          channel_properties: {
            account_holder_name: helperRow.name,
            account_number: helperRow.phone,
          },
          amount: Math.round(netPay * 100) / 100,
          currency: "PHP",
          description: `LINARA payout ${cutoffStart} to ${cutoffEnd}`,
        }),
      });

      const body: XenditPayoutResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          body.message || body.errors?.[0]?.message || `Xendit error ${response.status}`,
        );
      }

      const { error: updateError } = await authedClient
        .from("payslips")
        .update({ payout_status: "processing", payout_external_id: body.id ?? null })
        .eq("id", payslipId);

      if (updateError) {
        throw new Error(updateError.message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown Xendit error";

      await authedClient
        .from("payslips")
        .update({ payout_status: "failed", failure_reason: message })
        .eq("id", payslipId);

      // Unsettle so the vales this attempt claimed are eligible for the next
      // "Pay Now" click instead of being silently stuck against a failed payslip.
      await authedClient
        .from("vales")
        .update({ settled_in_payslip_id: null })
        .eq("settled_in_payslip_id", payslipId);

      throw new Error(message);
    }

    return { payslipId, netPay };
  });
