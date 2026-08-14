import { Check, Coins, Sparkles, Wallet } from "lucide-react";
import { useState } from "react";

import type { Helper, Invite } from "@/features/people/people.types";

import type { LedgerEntry, LedgerResolution, ValeRequest } from "../ledger.types";
import { AfterHoursLedger } from "./after-hours-ledger";
import { MyTerms } from "./my-terms";
import { ValeRequestModal } from "./vale-request-modal";

export function PayRecord({
  vales,
  onRequestVale,
  ledger,
  ledgerDefault,
  onUpdateLedgerEntry,
  helper,
  myInvite,
}: {
  vales: ValeRequest[];
  onRequestVale: (amount: number, reason: string) => void;
  ledger: LedgerEntry[];
  ledgerDefault: LedgerResolution;
  onUpdateLedgerEntry: (
    id: string,
    patch: Partial<Pick<LedgerEntry, "adjustMinutes" | "resolution">>,
  ) => void;
  helper: Helper;
  myInvite: Invite | null;
}) {
  const [asking, setAsking] = useState(false);
  const approvedTotal = vales
    .filter((v) => v.status === "approved")
    .reduce((s, v) => s + v.amount, 0);
  const pending = vales.filter((v) => v.status === "pending");
  const declined = vales.filter((v) => v.status === "declined");
  const baselineVale = 1500;
  const totalVale = baselineVale + approvedTotal;
  const limit = 3000;
  const pct = Math.min(100, Math.round((totalVale / limit) * 100));

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-primary/25 bg-primary/5 p-4 shadow-soft">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">This record is yours.</div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              It stays with you if you leave this household — your hours, your rest owed, your
              history.
            </p>
          </div>
        </div>
      </section>

      <MyTerms helper={helper} invite={myInvite} />

      <AfterHoursLedger
        entries={ledger}
        ledgerDefault={ledgerDefault}
        onUpdateEntry={onUpdateLedgerEntry}
        audience="helper"
      />
      {approvedTotal > 0 && (
        <section className="rounded-3xl border border-primary/30 bg-primary/5 p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                Vale balance
              </div>
              <div className="mt-1 font-display text-3xl text-primary">
                ₱{approvedTotal.toLocaleString()}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Approved by Ma'am · added this cutoff
              </div>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Check className="h-5 w-5" />
            </div>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Vale (cash advance)
            </div>
            <div className="mt-1 font-display text-2xl text-foreground">
              ₱{totalVale.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / ₱{limit.toLocaleString()} limit
              </span>
            </div>
          </div>
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/20 text-accent-foreground">
            <Wallet className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Deducted equally over the next 3 cutoffs. You can view every entry on your record.
        </p>

        <button
          onClick={() => setAsking(true)}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep sm:w-auto"
        >
          <Coins className="h-4 w-4" /> Request cash advance (vale)
        </button>

        {(pending.length > 0 || declined.length > 0) && (
          <div className="mt-4 space-y-1.5">
            {pending.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-xl border border-dashed border-border px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-foreground">
                    ₱{v.amount.toLocaleString()}
                  </span>
                  <span className="ml-2 text-muted-foreground">"{v.reason}"</span>
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-pine-deep">
                  Waiting
                </span>
              </div>
            ))}
            {declined.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-xl border border-dashed border-border px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-foreground">
                    ₱{v.amount.toLocaleString()}
                  </span>
                  <span className="ml-2 text-muted-foreground">"{v.reason}"</span>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  Declined
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {asking && (
        <ValeRequestModal
          onClose={() => setAsking(false)}
          onSubmit={(amt, r) => {
            onRequestVale(amt, r);
            setAsking(false);
          }}
        />
      )}
    </div>
  );
}
