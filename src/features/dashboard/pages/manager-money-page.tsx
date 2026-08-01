import { AfterHoursLedger } from "@/features/ledger/components/after-hours-ledger";

import { useAppStores } from "../app-store-context";
import { SpendAndPayday } from "../components/spend-and-payday";

/** Household spend, the next payday, and the after-hours ledger. */
export function ManagerMoneyPage() {
  const { ledger, helper } = useAppStores();
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Money</h1>
      <SpendAndPayday />
      <AfterHoursLedger
        entries={ledger.entries}
        ledgerDefault={ledger.resolutionDefault}
        onSetDefault={ledger.setResolutionDefault}
        onUpdateEntry={ledger.updateEntry}
        audience="manager"
        helperName={helper.name}
      />
    </div>
  );
}
