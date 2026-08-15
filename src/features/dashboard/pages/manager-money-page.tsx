import { useState } from "react";

import { AfterHoursLedger } from "@/features/ledger/components/after-hours-ledger";
import { PayslipHistory } from "@/features/pay/components/payslip-history";

import { useAppStores } from "../app-store-context";
import { SpendAndPayday } from "../components/spend-and-payday";

/** Household spend, the next payday, the after-hours ledger, and payslip history. */
export function ManagerMoneyPage() {
  const { ledger, helper, helpers, activeHelpers, payslips } = useAppStores();

  // Whose pay is being viewed -- defaults to helper (currentHelperId) until
  // explicitly switched. Local to this page: unlike the Quick Utos
  // recipient, nothing else (no write path, no realtime channel) depends on
  // this selection. See MULTI_HELPER_HANDLING.md.
  const [pickedPayHelperId, setPickedPayHelperId] = useState<string | null>(null);
  const selectedHelperId = pickedPayHelperId ?? helper?.id ?? null;
  const selectedHelper = helpers.find((h) => h.id === selectedHelperId) ?? helper ?? null;
  const helperLedgerEntries = ledger.entries.filter((e) => e.helperId === selectedHelper?.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">Money</h1>
        {activeHelpers.length > 1 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Viewing
            </span>
            <select
              value={selectedHelperId ?? ""}
              onChange={(e) => setPickedPayHelperId(e.target.value)}
              className="rounded-full border border-border bg-background px-3 py-1 text-sm font-semibold text-foreground outline-none focus:border-primary"
            >
              {activeHelpers.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} · {h.station}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <SpendAndPayday helper={selectedHelper} />
      <PayslipHistory
        helper={selectedHelper}
        payslips={payslips.payslips}
        onPayNow={payslips.payNow}
      />
      <AfterHoursLedger
        entries={helperLedgerEntries}
        ledgerDefault={ledger.resolutionDefault}
        onSetDefault={ledger.setResolutionDefault}
        onUpdateEntry={ledger.updateEntry}
        audience="manager"
        helperName={selectedHelper?.name ?? "your helper"}
      />
    </div>
  );
}
