import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

import type { PayoutChannelCode } from "./pay.types";

/**
 * Where to send her pay when the household pays her directly
 * (supabase/add-direct-gcash-pay.sql, KNOWN_GAPS O35). Linara moves no money:
 * this only tells the manager where to send it.
 *
 * - "helper": what she saved in her app (helper_payout_accounts). Hers alone
 *   to change.
 * - "invite": she hasn't saved one, so the number the manager typed when
 *   inviting her. The Pay screen says it's unconfirmed.
 * - "none": nothing on file.
 */
export type PayoutAccount =
  | {
      source: "helper";
      method: PayoutChannelCode;
      accountName: string;
      accountNumber: string;
      /** Signed for 15 minutes, like every other photo. */
      qrUrl: string | null;
      updatedAt: string;
    }
  | { source: "invite"; accountName: string; accountNumber: string }
  | { source: "none" };

const QR_BUCKET = "household-evidence";
const SIGNED_URL_SECONDS = 900;

export const getPayoutAccountFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string }) => data)
  .handler(async ({ data }): Promise<PayoutAccount> => {
    const client = createAuthedClient(data.token);
    const { data: helper, error } = await client
      .from("helper_profiles")
      .select("user_id, name, phone")
      .eq("id", data.helperId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!helper) throw new Error("Helper not found");

    if (helper.user_id) {
      const { data: saved, error: savedError } = await client
        .from("helper_payout_accounts")
        .select("method, account_name, account_number, qr_path, updated_at")
        .eq("user_id", helper.user_id)
        .maybeSingle();
      // 42P01 / PGRST205: the table isn't there yet (SQL not applied).
      if (savedError && savedError.code !== "42P01" && savedError.code !== "PGRST205") {
        throw new Error(savedError.message);
      }
      if (saved) {
        let qrUrl: string | null = null;
        if (saved.qr_path) {
          const { data: signed } = await client.storage
            .from(QR_BUCKET)
            .createSignedUrl(saved.qr_path as string, SIGNED_URL_SECONDS);
          qrUrl = signed?.signedUrl ?? null;
        }
        return {
          source: "helper",
          method: saved.method as PayoutChannelCode,
          accountName: saved.account_name as string,
          accountNumber: saved.account_number as string,
          qrUrl,
          updatedAt: saved.updated_at as string,
        };
      }
    }

    if (helper.phone) {
      return {
        source: "invite",
        accountName: helper.name as string,
        accountNumber: helper.phone as string,
      };
    }
    return { source: "none" };
  });
