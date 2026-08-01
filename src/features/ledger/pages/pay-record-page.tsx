import { useAppStores } from "@/features/dashboard/app-store-context";

import { PayRecord } from "../components/pay-record";

/** The helper's own pay record: vales, the after-hours ledger, and her terms. */
export function PayRecordPage() {
  const { helper, ledger, vales, invites } = useAppStores();
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
