import { useState } from "react";

import { INITIAL_ADMINS } from "../people.constants";
import type { Admin, AdminType } from "../people.types";

export type Session = {
  admins: Admin[];
  /** Which admin the demo is looking through. The helper persona is a route, not a value. */
  currentAdminId: string;
  setCurrentAdminId: (id: string) => void;
  currentAdmin: Admin | null;
  adminType: AdminType | null;
  updateAdminType: (id: string, type: AdminType) => void;
};

/** The household's admins plus which one the demo is currently showing. */
export function useSession(): Session {
  const [admins, setAdmins] = useState<Admin[]>(INITIAL_ADMINS);
  const [currentAdminId, setCurrentAdminId] = useState("ben");

  const currentAdmin = admins.find((a) => a.id === currentAdminId) ?? null;

  return {
    admins,
    currentAdminId,
    setCurrentAdminId,
    currentAdmin,
    adminType: currentAdmin ? currentAdmin.type : null,
    updateAdminType: (id, type) =>
      setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, type } : a))),
  };
}
