import { useCallback, useEffect, useState } from "react";

import {
  finishBootstrapFn,
  getManagerProfileFn,
  managerLoginFn,
  managerSignUpFn,
} from "../people.actions";
import type { Admin, AdminType } from "../people.types";

const TOKEN_KEY = "linara_manager_token";
const REFRESH_KEY = "linara_manager_refresh_token";
const USER_ID_KEY = "linara_manager_user_id";
const HOUSEHOLD_ID_KEY = "linara_manager_household_id";

export type SessionStatus = "loading" | "anon" | "needs_bootstrap" | "authed";

// user_profiles.user_type (DB vocabulary) -> AdminType (UI vocabulary).
// people.constants.ts's labels/permissions and every consumer of
// Admin.type are keyed on the UI side, so this mapping has to happen once,
// right here, wherever a real profile row becomes an Admin.
const USER_TYPE_TO_ADMIN_TYPE: Record<string, AdminType> = {
  primary_manager: "primary",
  co_manager: "co",
  remote_admin: "remote",
};

function buildAdmin(fullName: string, userType: string): Admin {
  const trimmed = fullName.trim() || "Manager";
  const short = trimmed.split(" ")[0] || trimmed;
  const initials =
    trimmed
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "M";
  return {
    id: "me",
    name: trimmed,
    short,
    initials,
    type: USER_TYPE_TO_ADMIN_TYPE[userType] ?? "primary",
    location: "On-site",
  };
}

export type Session = {
  status: SessionStatus;
  admins: Admin[];
  currentAdminId: string;
  /** No-op: Phase 1 has exactly one manager per session, nothing to switch to. */
  setCurrentAdminId: (id: string) => void;
  currentAdmin: Admin | null;
  adminType: AdminType | null;
  /** No-op: no updateUserType RPC exists yet; co-manager role changes are out of Phase 1 scope. */
  updateAdminType: (id: string, type: AdminType) => void;
  token: string | null;
  userId: string | null;
  householdId: string | null;
  signUp: (data: {
    fullName: string;
    householdName?: string;
    email: string;
    password: string;
  }) => Promise<"authed" | "confirmation_pending">;
  logIn: (data: {
    email: string;
    password: string;
  }) => Promise<"authed" | "confirmation_pending" | "needs_bootstrap">;
  finishBootstrap: (data: { fullName: string; householdName?: string }) => Promise<void>;
  logOut: () => void;
};

/** The signed-in manager. Tokens live in localStorage (not Supabase's own session
 * storage, which this app disables everywhere) so both server functions and this
 * client-side hook agree on where a session lives, matching the pattern already
 * shipped for helpers in claim-account-flow.tsx. */
export function useSession(): Session {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  const persist = (accessToken: string, refreshToken: string, uid: string, hhId?: string) => {
    window.localStorage.setItem(TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_KEY, refreshToken);
    window.localStorage.setItem(USER_ID_KEY, uid);
    if (hhId) window.localStorage.setItem(HOUSEHOLD_ID_KEY, hhId);
  };

  const clear = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(USER_ID_KEY);
    window.localStorage.removeItem(HOUSEHOLD_ID_KEY);
  };

  // Client-only: localStorage doesn't exist during SSR, so status starts
  // "loading" on both server and client render (no hydration mismatch) and
  // only resolves to "anon"/"authed"/"needs_bootstrap" after mount.
  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setStatus("anon");
      return;
    }
    setToken(stored);
    getManagerProfileFn({ data: { token: stored } })
      .then((result) => {
        setUserId(result.userId);
        if (result.status === "needs_bootstrap") {
          setStatus("needs_bootstrap");
          return;
        }
        setHouseholdId(result.householdId);
        setAdmin(buildAdmin(result.fullName, result.userType));
        setStatus("authed");
      })
      .catch(() => {
        clear();
        setToken(null);
        setStatus("anon");
      });
  }, []);

  const signUp: Session["signUp"] = useCallback(async (data) => {
    const result = await managerSignUpFn({ data });
    if (result.status === "confirmation_pending") {
      return "confirmation_pending";
    }
    persist(result.accessToken, result.refreshToken, result.userId, result.householdId);
    setToken(result.accessToken);
    setUserId(result.userId);
    setHouseholdId(result.householdId);
    setAdmin(buildAdmin(result.fullName, result.userType));
    setStatus("authed");
    return "authed";
  }, []);

  const logIn: Session["logIn"] = useCallback(async (data) => {
    const result = await managerLoginFn({ data });
    if (result.status === "confirmation_pending") {
      return "confirmation_pending";
    }
    if (result.status === "needs_bootstrap") {
      persist(result.accessToken, result.refreshToken, result.userId);
      setToken(result.accessToken);
      setUserId(result.userId);
      setStatus("needs_bootstrap");
      return "needs_bootstrap";
    }
    persist(result.accessToken, result.refreshToken, result.userId, result.householdId);
    setToken(result.accessToken);
    setUserId(result.userId);
    setHouseholdId(result.householdId);
    setAdmin(buildAdmin(result.fullName, result.userType));
    setStatus("authed");
    return "authed";
  }, []);

  const finishBootstrap: Session["finishBootstrap"] = useCallback(
    async (data) => {
      if (!token) throw new Error("Not authenticated");
      const result = await finishBootstrapFn({ data: { token, ...data } });
      window.localStorage.setItem(HOUSEHOLD_ID_KEY, result.householdId);
      setHouseholdId(result.householdId);
      setAdmin(buildAdmin(result.fullName, result.userType));
      setStatus("authed");
    },
    [token],
  );

  const logOut = useCallback(() => {
    clear();
    setToken(null);
    setUserId(null);
    setHouseholdId(null);
    setAdmin(null);
    setStatus("anon");
  }, []);

  const admins = admin ? [admin] : [];

  return {
    status,
    admins,
    currentAdminId: admin?.id ?? "",
    setCurrentAdminId: () => {},
    currentAdmin: admin,
    adminType: admin?.type ?? null,
    updateAdminType: () => {
      console.warn(
        "updateAdminType has no backend yet -- co-manager role changes are out of scope for Phase 1.",
      );
    },
    token,
    userId,
    householdId,
    signUp,
    logIn,
    finishBootstrap,
    logOut,
  };
}
