import { useState } from "react";

import { Avatar } from "@/components/shared/avatar";
import { AfterHoursLedger } from "@/features/ledger/components/after-hours-ledger";
import { RestOffRequests } from "@/features/ledger/components/rest-off-requests";
import { MissedPeriodsCard } from "@/features/pay/components/missed-periods-card";
import { periodEstimate } from "@/features/pay/period-estimate";
import { PayslipHistory } from "@/features/pay/components/payslip-history";
import { PayrollSummary } from "@/features/pay/components/payroll-summary";
import { useHouseholdCutoff } from "@/features/pay/hooks/use-household-cutoff";
import { HelperPicker } from "@/features/teams/components/helper-picker";
import { useUnpaidLeaveDue } from "@/features/pay/hooks/use-unpaid-leave-due";

import { useAppStores } from "../app-store-context";
import { SpendAndPayday } from "../components/spend-and-payday";

/** Household spend, the next payday, the after-hours ledger, and payslip history. */
export function ManagerMoneyPage() {
  const {
    ledger,
    helper,
    helpers,
    activeHelpers,
    invites,
    payslips,
    payPeriods,
    vales,
    session,
    timeOff,
  } = useAppStores();
  // Every manager role pays, a remote admin included (KNOWN_GAPS O34).
  const canPay = session.adminType !== null;

  // Whose pay is being viewed -- defaults to helper (currentHelperId) until
  // explicitly switched. Local to this page: unlike the Quick Utos
  // recipient, nothing else (no write path, no realtime channel) depends on
  // this selection. See MULTI_HELPER_HANDLING.md.
  const [pickedPayHelperId, setPickedPayHelperId] = useState<string | null>(null);
  const selectedHelperId = pickedPayHelperId ?? helper?.id ?? null;
  const selectedHelper = helpers.find((h) => h.id === selectedHelperId) ?? helper ?? null;
  const helperLedgerEntries = ledger.entries.filter((e) => e.helperId === selectedHelper?.id);
  const periods = selectedHelper ? (payPeriods.byHelper[selectedHelper.id] ?? []) : [];
  const currentPeriod = periods.find((p) => p.isCurrent);
  const unsettledVales = vales.vales
    .filter(
      (v) => v.helperId === selectedHelper?.id && v.status === "approved" && !v.settledInPayslipId,
    )
    .reduce((sum, v) => sum + v.amount, 0);
  const payslipsVersion = payslips.payslips.map((p) => `${p.id}:${p.payoutStatus}`).join(",");
  // What this cutoff's payout will take for unpaid leave, from Postgres.
  const unpaidLeaveDue = useUnpaidLeaveDue(
    session.token,
    selectedHelper && currentPeriod
      ? [{ helperId: selectedHelper.id, cutoffEnd: currentPeriod.workedEnd }]
      : [],
    `${payslipsVersion}|${timeOff.leave.map((l) => `${l.id}:${l.status}`).join(",")}`,
  );

  // Keyed on the SELECTED helper's interval, not the household default -- see
  // useHouseholdCutoff's note and MULTI_HELPER_HANDLING.md.
  const cutoff = useHouseholdCutoff({
    token: session.token,
    ready: session.status === "authed",
    paydayInterval: selectedHelper?.paydayInterval,
  });

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Money</h1>
      <PayrollSummary
        selectedId={selectedHelper?.id ?? null}
        onSelect={(id) => {
          setPickedPayHelperId(id);
          document
            .getElementById("pay-details")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
      <div
        id="pay-details"
        className="flex scroll-mt-20 flex-wrap items-center justify-between gap-2"
      >
        {/* Every figure below this line is about ONE helper, and which one is
            a decision the manager has to be able to see they are making --
            these are wage, vale and payout numbers, and mistaking whose they
            are is the MULTI_HELPER_HANDLING.md failure mode. The old version
            was a muted "Viewing" label beside an unstyled select, quiet enough
            to miss entirely; the maintainer did miss it. Now it reads as a
            control, names the person, and carries the avatar. */}
        {activeHelpers.length > 1 && (
          <div className="ml-auto flex items-center gap-2 rounded-full border-2 border-primary/30 bg-primary/5 px-3 py-1.5">
            <span className="text-xs font-bold text-primary">Showing</span>
            <Avatar initials={selectedHelper?.initials ?? "??"} />
            <HelperPicker
              helpers={activeHelpers}
              value={selectedHelperId ?? ""}
              onChange={setPickedPayHelperId}
              ariaLabel="Whose money to show"
              align="right"
              className="cursor-pointer rounded-full border border-border bg-background px-3 py-1 text-sm font-bold text-foreground outline-none focus:border-primary"
            />
          </div>
        )}
      </div>
      <SpendAndPayday helper={selectedHelper} />
      <PayslipHistory
        helper={selectedHelper}
        payslips={payslips.payslips}
        cutoff={cutoff}
        estimate={
          selectedHelper && currentPeriod
            ? Math.max(
                0,
                periodEstimate(selectedHelper, currentPeriod) -
                  unsettledVales -
                  unpaidLeaveDue(selectedHelper.id, currentPeriod.workedEnd).deduction,
              )
            : undefined
        }
        onPayNow={payslips.payNow}
        onReconcile={payslips.reconcile}
        onRecordOffApp={canPay ? (id, payment) => payslips.recordOffApp(id, payment) : undefined}
        onWithdrawOffApp={canPay ? payslips.withdrawOffApp : undefined}
      />
      {selectedHelper && (
        <MissedPeriodsCard
          helper={selectedHelper}
          missed={payPeriods.missed(selectedHelper.id)}
          token={session.token}
          payslipsVersion={payslipsVersion}
          unsettledVales={unsettledVales}
          canPay={canPay}
          onPayNow={payslips.payNow}
          onRecordOffApp={payslips.recordOffApp}
        />
      )}
      <RestOffRequests
        helper={selectedHelper}
        token={session.token}
        ready={session.status === "authed"}
        onDecided={timeOff.reload}
      />
      <AfterHoursLedger
        entries={helperLedgerEntries}
        // Per-helper now, not household-wide (Session E / E2). The old props
        // read a useState in useLedger that applied to every helper at once
        // and reset on reload.
        ledgerDefault={selectedHelper?.effectiveResolution ?? "rest"}
        isExplicitDefault={selectedHelper?.defaultResolution != null}
        onSetDefault={async (resolution) => {
          if (!selectedHelper) return;
          await ledger.setHelperDefault(selectedHelper.id, resolution);
          // effective_resolution is a generated column, so the new value has to
          // come back from Postgres rather than be assumed here.
          await invites.refresh();
        }}
        onUpdateEntry={ledger.updateEntry}
        audience="manager"
        helperName={selectedHelper?.short ?? "your helper"}
      />
    </div>
  );
}
