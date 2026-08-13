import { useAppStores } from "@/features/dashboard/app-store-context";

import { PayRecord } from "../components/pay-record";

/** The helper's own pay record: vales, the after-hours ledger, and her terms. */
export function PayRecordPage() {
  const { helper, ledger, vales, invites } = useAppStores();

  if (!helper) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
        No active helper account yet — claim an invite to see your pay record.
      </div>
    );
  }

  return (
    <PayRecord
      vales={vales.vales.filter((v) => v.helperId === helper.id)}
      onRequestVale={(amount, reason) => vales.request(helper.id, amount, reason)}
      ledger={ledger.entries}
      ledgerDefault={ledger.resolutionDefault}
      onUpdateLedgerEntry={ledger.updateEntry}
      helper={helper}
      myInvite={invites.invites.find((i) => i.status === "active") ?? null}
    />
  );
}
