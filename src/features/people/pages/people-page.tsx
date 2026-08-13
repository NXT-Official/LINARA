import { useAppStores } from "@/features/dashboard/app-store-context";

import { PeopleSection } from "../components/people-section";

/** The household roster: admins, helpers, and pending invites. */
export function PeoplePage() {
  const { session, invites } = useAppStores();
  const { admins, currentAdmin, adminType } = session;
  const canInvite = adminType === "primary" || adminType === "co";
  const authorName = currentAdmin?.name ?? "Manager";

  return (
    <>
      <h1 className="sr-only">People</h1>
      <PeopleSection
        admins={admins}
        currentAdmin={currentAdmin}
        invites={invites.invites}
        canInvite={canInvite}
        onInvite={(data) => invites.create(data, authorName)}
        onCancelInvite={invites.cancel}
        onUpdateWage={invites.updateWage}
      />
    </>
  );
}
