import { AfterHoursLedger } from "@/features/ledger/components/after-hours-ledger";
import { PayslipHistory } from "@/features/pay/components/payslip-history";

import { useAppStores } from "../app-store-context";
import { SpendAndPayday } from "../components/spend-and-payday";

/** Household spend, the next payday, the after-hours ledger, and payslip history. */
export function ManagerMoneyPage() {
  const { ledger, helper, payslips } = useAppStores();
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Money</h1>
      <SpendAndPayday />
      <PayslipHistory helper={helper} payslips={payslips.payslips} onPayNow={payslips.payNow} />
      <AfterHoursLedger
        entries={ledger.entries}
        ledgerDefault={ledger.resolutionDefault}
        onSetDefault={ledger.setResolutionDefault}
        onUpdateEntry={ledger.updateEntry}
        audience="manager"
        helperName={helper?.name ?? "your helper"}
      />
    </div>
  );
}
