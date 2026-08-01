import { useState } from "react";

import type { Invite } from "../people.types";

export type InviteStore = ReturnType<typeof useInvites>;

/**
 * The invite → claim lifecycle.
 *
 * An invite records the household's version of the arrangement and issues a code.
 * The helper claims it into her own account and may flag any detail she disputes;
 * flags surface in the manager's "Needs you" until resolved.
 */
export function useInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);

  const create = (
    data: Omit<Invite, "id" | "code" | "createdAt" | "createdBy" | "status" | "flags">,
    byName: string,
  ): Invite => {
    const invite: Invite = {
      ...data,
      id: `inv${Date.now()}`,
      code: `LINARA-${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: Date.now(),
      createdBy: byName,
      status: "pending",
      flags: [],
    };
    setInvites((prev) => [invite, ...prev]);
    return invite;
  };

  const patch = (id: string, fn: (invite: Invite) => Invite) =>
    setInvites((prev) => prev.map((i) => (i.id === id ? fn(i) : i)));

  return {
    invites,
    create,
    cancel: (id: string) => setInvites((prev) => prev.filter((i) => i.id !== id)),
    findByCode: (code: string) =>
      invites.find(
        (i) => i.code.toLowerCase() === code.trim().toLowerCase() && i.status === "pending",
      ) ?? null,
    claim: (id: string, claimedName: string) =>
      patch(id, (i) => ({ ...i, status: "active", claimedName, claimedAt: Date.now() })),
    flag: (id: string, field: string, note?: string) =>
      patch(id, (i) => ({
        ...i,
        flags: [...i.flags, { id: `f${Date.now()}`, field, note, at: Date.now() }],
      })),
    resolveFlag: (inviteId: string, flagId: string) =>
      patch(inviteId, (i) => ({ ...i, flags: i.flags.filter((f) => f.id !== flagId) })),
  };
}
