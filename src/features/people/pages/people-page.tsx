import { useAppStores } from "@/features/dashboard/app-store-context";

import { PastStaffSection } from "../components/past-staff-section";
import { PeopleSection } from "../components/people-section";

/** The household roster: admins, helpers, pending invites, and past staff. */
export function PeoplePage() {
  const { session, invites, helpers, activeHelpers, payslips, vales, board } = useAppStores();
  const { admins, currentAdmin, adminType } = session;
  const canInvite = adminType === "primary" || adminType === "co";
  const authorName = currentAdmin?.name ?? "Manager";

  const current = invites.invites.filter((i) => i.status !== "ended");
  const past = invites.invites.filter((i) => i.status === "ended");

  return (
    <>
      <h1 className="sr-only">People</h1>
      <PeopleSection
        admins={admins}
        currentAdmin={currentAdmin}
        invites={current}
        canInvite={canInvite}
        onInvite={(data) => invites.create(data, authorName)}
        onCancelInvite={invites.cancel}
        onUpdateWage={invites.updateWage}
        helpers={helpers}
        activeHelpers={activeHelpers}
        token={session.token}
        onEndEmployment={async (id, lastDay, reassignTo) => {
          await invites.endEmployment(id, lastDay, reassignTo);
          // Her open tasks moved or went, and pending vales were declined.
          await Promise.all([board.refresh(), vales.refresh(), payslips.refresh()]);
        }}
      />
      <div className="mt-6">
        <PastStaffSection
          pastStaff={past}
          helpers={helpers}
          payslips={payslips.payslips}
          vales={vales.vales}
          token={session.token}
          onPayNow={payslips.payNow}
          onReconcile={payslips.reconcile}
        />
      </div>
    </>
  );
}
