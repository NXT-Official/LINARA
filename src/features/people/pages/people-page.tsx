import { toast } from "sonner";

import { useAppStores } from "@/features/dashboard/app-store-context";
import { LeaveSection } from "@/features/leave/components/leave-section";
import { setPayDaysPerYearFn } from "@/features/leave/leave.actions";
import { toHouseholdClock, toISODate } from "@/lib/time";

import { AccountSection } from "../components/account-section";
import { PastStaffSection } from "../components/past-staff-section";
import { PeopleSection } from "../components/people-section";

/** The household roster: admins, helpers and their leave, pending invites, past staff, and your own account. */
export function PeoplePage() {
  const {
    session,
    invites,
    helpers,
    activeHelpers,
    payslips,
    payPeriods,
    vales,
    board,
    timeOff,
    clock,
  } = useAppStores();
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
        onSetPantryRole={invites.setPantryRole}
        helpers={helpers}
        activeHelpers={activeHelpers}
        token={session.token}
        onEndEmployment={async (id, lastDay, reassignTo) => {
          await invites.endEmployment(id, lastDay, reassignTo);
          // Her open tasks moved or went, and pending vales were declined.
          await Promise.all([
            board.refresh(),
            vales.refresh(),
            payslips.refresh(),
            payPeriods.refresh(),
          ]);
        }}
      />
      <div className="mt-6">
        <LeaveSection
          helpers={activeHelpers}
          leave={timeOff.leave}
          token={session.token}
          todayIso={toISODate(toHouseholdClock(clock.nowTs))}
          canManage={canInvite}
          payDaysFor={(id) =>
            invites.helperProfiles.find((p) => p.id === id)?.pay_days_per_year ?? 365
          }
          onSetPayDays={(helperId, payDaysPerYear) => {
            if (!session.token) return;
            setPayDaysPerYearFn({ data: { token: session.token, helperId, payDaysPerYear } })
              .then(() => invites.refresh())
              .catch((err) => {
                console.error("[PeoplePage] Failed to save pay days:", err);
                toast.error("Couldn't save that setting.");
              });
          }}
          onRecord={timeOff.recordLeave}
          onCancel={(id) => void timeOff.cancelLeave(id)}
        />
      </div>
      <div className="mt-6">
        <PastStaffSection
          pastStaff={past}
          helpers={helpers}
          payslips={payslips.payslips}
          payPeriods={payPeriods}
          vales={vales.vales}
          token={session.token}
          canPay={canInvite}
          onPayNow={payslips.payNow}
          onReconcile={payslips.reconcile}
          onRecordOffApp={payslips.recordOffApp}
          onWithdrawOffApp={payslips.withdrawOffApp}
        />
      </div>
      <div className="mt-6">
        <AccountSection
          token={session.token}
          activeHelperCount={activeHelpers.length}
          confirmName={session.currentAdmin?.name ?? ""}
        />
      </div>
    </>
  );
}
