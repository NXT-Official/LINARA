import { AlertCircle, Check, Copy, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";
import { useAppStores } from "@/features/dashboard/app-store-context";
import { householdNow, toISODate } from "@/lib/time";

import { previewPaymentFn } from "../pay.actions";
import type { ManualPayment, PayoutChannelCode, PayslipKind } from "../pay.types";
import { getPayoutAccountFn, type PayoutAccount } from "../payout-account.actions";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

const WALLET: Record<PayoutChannelCode, string> = { PH_GCASH: "GCash", PH_PAYMAYA: "Maya" };

/** To the centavo: this is the amount she's sent, so it can't be rounded. */
const exactPeso = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A GCash / Maya reference number: digits, often shown in groups. */
const cleanRef = (raw: string) => raw.replace(/\s+/g, "");

/**
 * Pay her straight to her GCash or Maya (KNOWN_GAPS O35): Linara shows where
 * and how much, the manager sends it from their own wallet, and "I've sent
 * it" records it as a payment made outside Linara, for her to confirm in her
 * app. Linara moves no money.
 */
export function PayDirectModal({
  helperId,
  helperName,
  periodLabel,
  target = {},
  onClose,
  onSubmit,
}: {
  helperId: string;
  helperName: string;
  /** "Aug 16 – Aug 31", or "13th-month pay 2026". */
  periodLabel: string;
  /** A missed period or 13th-month pay; omitted means the current (or final) one. */
  target?: { cutoffStart?: string; kind?: PayslipKind };
  onClose: () => void;
  /** Records it; resolves with what the payslip says she was paid. */
  onSubmit: (payment: ManualPayment) => Promise<{ netPay: number } | unknown>;
}) {
  const t = useT();
  const { session } = useAppStores();
  const token = session.token;
  const today = toISODate(householdNow());
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  // The payslip's own figure (previewPaymentFn), not the dashboard's estimate:
  // it's what she should receive.
  const [estimate, setEstimate] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Only chosen here when she hasn't saved hers (the invite's number).
  const [chosen, setChosen] = useState<PayoutChannelCode>("PH_GCASH");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [copied, setCopied] = useState<"number" | "amount" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      getPayoutAccountFn({ data: { token, helperId } }),
      previewPaymentFn({ data: { token, helperId, ...target } }),
    ])
      .then(([found, preview]) => {
        setAccount(found);
        setEstimate(preview.netPay);
      })
      .catch((err: Error) => setLoadError(err.message));
    // The token renews hourly; the figures don't need reloading for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helperId, target.cutoffStart, target.kind]);

  const method: PayoutChannelCode = account?.source === "helper" ? account.method : chosen;
  const wallet = WALLET[method];
  const amount = (estimate ?? 0).toFixed(2);

  const copy = async (what: "number" | "amount", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard refused: it's on screen to type in.
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const ref = cleanRef(reference);
    try {
      const result = await onSubmit({
        method,
        paidOn,
        note: ref ? `${wallet} ref ${ref}` : `Sent by ${wallet}`,
      });
      const recorded = (result as { netPay?: number } | null)?.netPay;
      // Something changed in between (a vale approved, say): say so.
      if (recorded !== undefined && estimate !== null && Math.abs(recorded - estimate) >= 0.01) {
        toast.warning(
          t("pay.recordedDifferent", { recorded: exactPeso(recorded), shown: exactPeso(estimate) }),
          { duration: 20_000 },
        );
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record the payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl text-foreground">
            {t("pay.payByWallet", { name: helperName, wallet })}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("pay.sendFromOwn", { period: periodLabel, wallet, name: helperName })}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label={t("pay.close")}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {(!account || estimate === null) && !loadError && (
        <div className="mt-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}
      {loadError && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {loadError}
        </p>
      )}

      {account?.source === "none" && (
        <p className="mt-4 rounded-2xl bg-secondary/60 px-3 py-3 text-sm text-foreground">
          {richText(t("pay.noWalletYet", { wallet, name: helperName }), {
            whereToSend: <span className="font-semibold">{t("pay.whereToSendMyPay")}</span>,
            paidOutside: <span className="font-semibold">{t("pay.paidOutsideLinara")}</span>,
          })}
        </p>
      )}

      {account && estimate !== null && account.source !== "none" && (
        <div className="mt-4 space-y-3">
          {account.source === "invite" && (
            <>
              <p className="flex items-start gap-2 rounded-2xl border border-terracotta/40 bg-terracotta-soft/50 px-3 py-2.5 text-xs text-accent-foreground">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t("pay.numberFromInvite", { name: helperName })}
              </p>
              <fieldset className="flex gap-2">
                <legend className="sr-only">{t("pay.helpersWallet", { name: helperName })}</legend>
                {(["PH_GCASH", "PH_PAYMAYA"] as const).map((m) => (
                  <label
                    key={m}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      chosen === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground hover:border-primary/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="wallet"
                      value={m}
                      checked={chosen === m}
                      onChange={() => setChosen(m)}
                      className="sr-only"
                    />
                    {WALLET[m]}
                  </label>
                ))}
              </fieldset>
            </>
          )}

          <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
            <CopyRow
              label={t("pay.amount")}
              value={exactPeso(estimate)}
              copied={copied === "amount"}
              onCopy={() => copy("amount", amount)}
              big
            />
            <CopyRow
              label={`${wallet} number`}
              value={account.accountNumber}
              copied={copied === "number"}
              onCopy={() => copy("number", account.accountNumber)}
            />
            <div className="mt-2 text-xs text-muted-foreground">
              {t("pay.nameOnAccount")}{" "}
              <span className="font-semibold text-foreground">{account.accountName}</span>
            </div>
          </div>

          {account.source === "helper" && account.qrUrl && (
            <div className="flex items-center gap-3 rounded-2xl bg-background/60 p-3">
              <img
                src={account.qrUrl}
                alt={t("pay.walletQrAlt", { name: helperName, wallet })}
                className="h-24 w-24 shrink-0 rounded-lg border border-border bg-white object-contain"
              />
              <p className="text-xs text-muted-foreground">
                {richText(t("pay.scanFromAnother", { wallet }), {
                  openIt: (
                    <a
                      href={account.qrUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-primary underline underline-offset-2"
                    >
                      {t("pay.openIt")}
                    </a>
                  ),
                })}
              </p>
            </div>
          )}

          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              {richText(t("pay.openAndSend", { wallet }), {
                amount: (
                  <span className="font-semibold text-foreground">{exactPeso(estimate)}</span>
                ),
              })}
            </li>
            <li>{t("pay.checkName", { wallet })}</li>
            <li>{t("pay.comeBackAndTapI")}</li>
          </ol>

          <Field label={`${wallet} reference number (optional)`}>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              inputMode="numeric"
              maxLength={40}
              placeholder={t("pay.eG1234567890123")}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label={t("pay.dateSent")}>
            <input
              type="date"
              value={paidOn}
              max={today}
              onChange={(e) => e.target.value && setPaidOn(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          {error && (
            <p className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          disabled={submitting}
          className="rounded-lg px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {t("pay.cancel")}
        </button>
        {account && estimate !== null && account.source !== "none" && (
          <button
            onClick={submit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("pay.recording")}
              </>
            ) : (
              t("pay.iveSentIt")
            )}
          </button>
        )}
      </div>
    </Modal>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
  big = false,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  big?: boolean;
}) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-muted-foreground">{label}</div>
        <div
          className={`truncate font-semibold tabular-nums text-foreground ${big ? "font-display text-2xl text-primary" : "text-base tracking-wide"}`}
        >
          {value}
        </div>
      </div>
      <button
        onClick={onCopy}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:border-primary"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? t("pay.copied") : t("pay.copy")}
      </button>
    </div>
  );
}
