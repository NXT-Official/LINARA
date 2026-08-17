import { useState } from "react";

import { Avatar } from "@/components/shared/avatar";
import { AfterHoursLedger } from "@/features/ledger/components/after-hours-ledger";
import { RestOffRequests } from "@/features/ledger/components/rest-off-requests";
import { PayslipHistory } from "@/features/pay/components/payslip-history";
import { useHouseholdCutoff } from "@/features/pay/hooks/use-household-cutoff";

import { useAppStores } from "../app-store-context";
import { SpendAndPayday } from "../components/spend-and-payday";

/** Household spend, the next payday, the after-hours ledger, and payslip history. */
export function ManagerMoneyPage() {
  const { ledger, helper, helpers, activeHelpers, invites, payslips, session } = useAppStores();

  // Whose pay is being viewed -- defaults to helper (currentHelperId) until
  // explicitly switched. Local to this page: unlike the Quick Utos
  // recipient, nothing else (no write path, no realtime channel) depends on
  // this selection. See MULTI_HELPER_HANDLING.md.
  const [pickedPayHelperId, setPickedPayHelperId] = useState<string | null>(null);
  const selectedHelperId = pickedPayHelperId ?? helper?.id ?? null;
  const selectedHelper = helpers.find((h) => h.id === selectedHelperId) ?? helper ?? null;
  const helperLedgerEntries = ledger.entries.filter((e) => e.helperId === selectedHelper?.id);

  // Keyed on the SELECTED helper's interval, not the household default -- see
  // useHouseholdCutoff's note and MULTI_HELPER_HANDLING.md.
  const cutoff = useHouseholdCutoff({
    token: session.token,
    ready: session.status === "authed",
    paydayInterval: selectedHelper?.paydayInterval,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sr-only">Money</h1>
        {/* Every figure below this line is about ONE helper, and which one is
            a decision the manager has to be able to see they are making --
            these are wage, vale and payout numbers, and mistaking whose they
            are is the MULTI_HELPER_HANDLING.md failure mode. The old version
            was a muted "Viewing" label beside an unstyled select, quiet enough
            to miss entirely; the maintainer did miss it. Now it reads as a
            control, names the person, and carries the avatar. */}
        {activeHelpers.length > 1 && (
          <div className="ml-auto flex items-center gap-2 rounded-full border-2 border-primary/30 bg-primary/5 px-3 py-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
              Showing
            </span>
            <Avatar initials={selectedHelper?.initials ?? "??"} />
            <select
              value={selectedHelperId ?? ""}
              onChange={(e) => setPickedPayHelperId(e.target.value)}
              aria-label="Whose money to show"
              className="cursor-pointer rounded-full border border-border bg-background px-3 py-1 text-sm font-bold text-foreground outline-none focus:border-primary"
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
        cutoff={cutoff}
        onPayNow={payslips.payNow}
      />
      <RestOffRequests
        helper={selectedHelper}
        token={session.token}
        ready={session.status === "authed"}
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
