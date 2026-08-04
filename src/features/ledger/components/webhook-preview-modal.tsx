import { X, Copy, Check, Smartphone, ShieldCheck } from "lucide-react";
import { useState } from "react";

interface WebhookPreviewModalProps {
  onClose: () => void;
  provider: "gcash" | "maya";
  recipientMobile: string;
  grossPayAmount: number;
  valeDeductions: number;
  netDisbursement: number;
}

export function WebhookPreviewModal({
  onClose,
  provider,
  recipientMobile,
  grossPayAmount,
  valeDeductions,
  netDisbursement,
}: WebhookPreviewModalProps) {
  const [copied, setCopying] = useState(false);
  const [selectedProvider, setProvider] = useState<"gcash" | "maya">(provider);

  // Payload structure following fintech webhook specifications
  const payload = {
    event: "disbursement.requested",
    provider: selectedProvider,
    timestamp: new Date().toISOString(),
    data: {
      recipient_mobile: recipientMobile || "+63917XXXXXXX",
      gross_pay_amount: parseFloat(grossPayAmount.toFixed(2)),
      vale_deductions: parseFloat(valeDeductions.toFixed(2)),
      net_disbursement: parseFloat(netDisbursement.toFixed(2)),
      currency: "PHP",
    },
  };

  const payloadString = JSON.stringify(payload, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(payloadString);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-xl text-foreground flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Fintech Disbursement Webhook
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Inspeksyunin ang raw webhook payload na ipapadala sa disbursement gateway para sa payout na ito.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Partner Provider Switcher */}
        <div className="mt-4 grid grid-cols-2 gap-2 bg-secondary p-1.5 rounded-2xl">
          <button
            type="button"
            onClick={() => setProvider("gcash")}
            className={`rounded-xl py-2.5 text-xs font-semibold transition ${
              selectedProvider === "gcash"
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            GCash Network
          </button>
          <button
            type="button"
            onClick={() => setProvider("maya")}
            className={`rounded-xl py-2.5 text-xs font-semibold transition ${
              selectedProvider === "maya"
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Maya Network
          </button>
        </div>

        {/* Dynamic calculations list */}
        <div className="mt-4 p-4 rounded-2xl bg-secondary/50 border border-border/40 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Gross Pay</span>
            <span className="font-bold text-foreground font-mono">₱{grossPayAmount.toLocaleString()}</span>
          </div>
          <div className="border-x border-border/60">
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Deductions</span>
            <span className="font-bold text-destructive font-mono">−₱{valeDeductions.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Net Payout</span>
            <span className="font-bold text-emerald font-mono">₱{netDisbursement.toLocaleString()}</span>
          </div>
        </div>

        {/* Raw Code block preview */}
        <div className="mt-4 relative">
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800 rounded-t-2xl">
            <span className="text-[10px] font-mono font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="h-3 w-3 text-accent" />
              webhook_payload.json
            </span>
            <button
              onClick={handleCopy}
              className="text-zinc-400 hover:text-zinc-100 transition rounded-md p-1 hover:bg-zinc-800 flex items-center gap-1 text-[11px]"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy payload
                </>
              )}
            </button>
          </div>
          <pre className="bg-zinc-950 text-zinc-100 p-4 rounded-b-2xl font-mono text-[11px] overflow-x-auto max-h-56 leading-relaxed">
            {payloadString}
          </pre>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full bg-secondary hover:bg-secondary/80 px-5 py-2.5 text-xs font-semibold text-foreground transition"
          >
            Sige, okay na
          </button>
        </div>
      </div>
    </div>
  );
}
