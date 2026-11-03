import { AlertCircle, Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import type { Helper } from "@/features/people/people.types";
import { useT } from "@/lib/i18n/locale-context";

import { getPayoutAccountFn, type PayoutAccount } from "../payout-account.actions";
import type { PayoutChannelCode } from "../pay.types";

const WALLET: Record<PayoutChannelCode, string> = { PH_GCASH: "GCash", PH_PAYMAYA: "Maya" };

/**
 * Where to send a helper's pay: the GCash or Maya account they saved in
 * their app. The household pays them directly; Linara moves no money and
 * keeps no payslips. Separate from the pay & HR switch (lib/pay-hr.ts), which
 * is about Linara's own staff.
 */
export function HelperWalletCard({ helper, token }: { helper: Helper; token: string | null }) {
  const t = useT();
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;
    let live = true;
    setAccount(null);
    setFailed(false);
    getPayoutAccountFn({ data: { token, helperId: helper.id } })
      .then((a) => live && setAccount(a))
      .catch((err) => {
        console.error("[HelperWalletCard] Failed to load the payout account:", err);
        if (live) setFailed(true);
      });
    // A reply for the helper picked before must not land on this one.
    return () => {
      live = false;
    };
  }, [token, helper.id]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused: the number is on screen to type in.
    }
  };

  const wallet = account?.source === "helper" ? WALLET[account.method] : "GCash";

  return (
    <section
      aria-labelledby="helper-wallet-title"
      className="rounded-3xl bg-card p-5 shadow-soft sm:p-7"
    >
      <h2 id="helper-wallet-title" className="font-display text-lg font-semibold text-foreground">
        {t("pay.wallet.title", { name: helper.short })}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("pay.wallet.lead")}</p>

      {failed ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t("pay.wallet.loadFailed")}
        </p>
      ) : !account ? (
        <div className="mt-4 space-y-2" aria-busy="true" aria-label={t("pay.wallet.loading")}>
          <div className="h-4 w-24 animate-pulse rounded bg-secondary motion-reduce:animate-none" />
          <div className="h-6 w-44 animate-pulse rounded bg-secondary motion-reduce:animate-none" />
        </div>
      ) : account.source === "none" ? (
        <p className="mt-4 rounded-2xl bg-secondary/60 px-3 py-3 text-sm text-foreground">
          {t("pay.wallet.none", { name: helper.short })}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {account.source === "invite" && (
            <p className="flex items-start gap-2 rounded-2xl border border-terracotta/40 bg-terracotta-soft/50 px-3 py-2.5 text-xs text-accent-foreground">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {t("pay.numberFromInvite", { name: helper.short })}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-muted-foreground">
                {account.source === "helper"
                  ? t("pay.wallet.number", { wallet })
                  : t("pay.wallet.numberUnconfirmed")}
              </div>
              <div className="truncate text-xl font-semibold tabular-nums tracking-wide text-foreground">
                {account.accountNumber}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {t("pay.nameOnAccount")}{" "}
                <span className="font-semibold text-foreground">{account.accountName}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void copy(account.accountNumber)}
              aria-label={t("pay.wallet.copyNumber")}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors duration-150 ease-out hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0"
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
              {copied ? t("pay.copied") : t("pay.copy")}
            </button>
          </div>
          {account.source === "helper" && account.qrUrl && (
            <img
              src={account.qrUrl}
              alt={t("pay.walletQrAlt", { name: helper.short, wallet })}
              className="h-32 w-32 rounded-lg border border-border bg-white object-contain"
            />
          )}
        </div>
      )}
    </section>
  );
}
