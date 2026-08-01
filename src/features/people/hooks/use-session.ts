import { useState } from "react";

import { INITIAL_ADMINS } from "../people.constants";
import type { Admin, AdminType, ViewAs } from "../people.types";

export type Session = {
  admins: Admin[];
  /** Whose eyes we are looking through — the prototype's persona switcher. */
  viewAs: ViewAs;
  setViewAs: (v: ViewAs) => void;
  currentAdmin: Admin | null;
  adminType: AdminType | null;
  role: "manager" | "helper";
  updateAdminType: (id: string, type: AdminType) => void;
};

/** The household's admins plus which persona the demo is currently showing. */
export function useSession(): Session {
  const [admins, setAdmins] = useState<Admin[]>(INITIAL_ADMINS);
  const [viewAs, setViewAs] = useState<ViewAs>("ben");

  const currentAdmin = admins.find((a) => a.id === viewAs) ?? null;

  return {
    admins,
    viewAs,
    setViewAs,
    currentAdmin,
    adminType: currentAdmin ? currentAdmin.type : null,
    role: viewAs === "rosa" ? "helper" : "manager",
    updateAdminType: (id, type) =>
      setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, type } : a))),
  };
}
