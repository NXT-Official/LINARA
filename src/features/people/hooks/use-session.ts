import { useCallback, useEffect, useRef, useState } from "react";

import {
  finishBootstrapFn,
  getManagerProfileFn,
  managerLoginFn,
  managerSignUpFn,
  refreshManagerSessionFn,
} from "../people.actions";
import type { Admin, AdminType } from "../people.types";
import { setHouseholdTimeZone } from "@/lib/time";
import { isDueForRenewal, msUntilRenewal } from "../people.utils";

const TOKEN_KEY = "linara_manager_token";
const REFRESH_KEY = "linara_manager_refresh_token";
const USER_ID_KEY = "linara_manager_user_id";
const HOUSEHOLD_ID_KEY = "linara_manager_household_id";

// Offline, or Supabase down: try again after this long.
const RENEW_RETRY_MS = 60_000;

/**
 * Inside LINARA_MOBILE's WebView (app/manager.tsx) the app renews the session
 * itself and hands the page each new token, so the page leaves it alone there.
 */
function inMobileApp(): boolean {
  return navigator.userAgent.includes("LinaraApp");
}

type Renewal = { status: "ok"; token: string } | { status: "expired" } | { status: "failed" };

/**
 * Trades the stored refresh token for a new session and stores it
 * (KNOWN_GAPS.md C75). `held` is the access token this tab has: when another
 * tab has already stored a newer one, that's taken instead, since each
 * refresh token works once. "expired" means log in again; "failed" means try
 * again later.
 */
async function renewStoredSession(held: string): Promise<Renewal> {
  if (inMobileApp()) return { status: "failed" };
  const newerElsewhere = () => {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    return stored && stored !== held ? stored : null;
  };
  const already = newerElsewhere();
  if (already) return { status: "ok", token: already };

  const refreshToken = window.localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return { status: "expired" };
  try {
    const result = await refreshManagerSessionFn({ data: { refreshToken } });
    if (result.status === "expired") {
      // Another tab may have used this refresh token a moment ago.
      const raced = newerElsewhere();
      return raced ? { status: "ok", token: raced } : result;
    }
    window.localStorage.setItem(TOKEN_KEY, result.accessToken);
    window.localStorage.setItem(REFRESH_KEY, result.refreshToken);
    return { status: "ok", token: result.accessToken };
  } catch (err) {
    console.error("[useSession] Couldn't renew the manager session:", err);
    return { status: "failed" };
  }
}

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
  }) => Promise<"authed" | "confirmation_pending" | "needs_bootstrap" | "helper">;
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

    // A manager coming back after the token's hour is up holds an expired
    // one: renew it first. If the profile still won't load with a token that
    // looked fine (a wrong device clock, say), renew once and try again.
    const restore = async () => {
      let current = stored;
      let renewed = false;
      if (isDueForRenewal(stored)) {
        renewed = true;
        const renewal = await renewStoredSession(stored);
        if (renewal.status === "ok") current = renewal.token;
      }
      try {
        return { profile: await getManagerProfileFn({ data: { token: current } }), current };
      } catch (err) {
        if (renewed) throw err;
        const renewal = await renewStoredSession(stored);
        if (renewal.status !== "ok") throw err;
        const profile = await getManagerProfileFn({ data: { token: renewal.token } });
        return { profile, current: renewal.token };
      }
    };

    restore()
      .then(({ profile: result, current }) => {
        setToken(current);
        setUserId(result.userId);
        if (result.status === "needs_bootstrap") {
          setStatus("needs_bootstrap");
          return;
        }
        setHouseholdTimeZone(result.timeZone);
        setHouseholdId(result.householdId);
        setAdmin(buildAdmin(result.fullName, result.userType));
        setStatus("authed");
      })
      .catch((err) => {
        console.error("[useSession] Failed to rehydrate manager session:", err);
        clear();
        setToken(null);
        setStatus("anon");
      });
  }, []);

  const signUp: Session["signUp"] = useCallback(async (data) => {
    const result = await managerSignUpFn({
      data: {
        ...data,
        emailRedirectTo: `${window.location.origin}/email-confirmed?for=manager`,
      },
    });
    if (result.status === "confirmation_pending") {
      return "confirmation_pending";
    }
    persist(result.accessToken, result.refreshToken, result.userId, result.householdId);
    setHouseholdTimeZone(result.timeZone);
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
    if (result.status === "helper") {
      return "helper";
    }
    if (result.status === "needs_bootstrap") {
      persist(result.accessToken, result.refreshToken, result.userId);
      setToken(result.accessToken);
      setUserId(result.userId);
      setStatus("needs_bootstrap");
      return "needs_bootstrap";
    }
    persist(result.accessToken, result.refreshToken, result.userId, result.householdId);
    setHouseholdTimeZone(result.timeZone);
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
      setHouseholdTimeZone(result.timeZone);
      setHouseholdId(result.householdId);
      setAdmin(buildAdmin(result.fullName, result.userType));
      setStatus("authed");
    },
    [token],
  );

  const logOut = useCallback(() => {
    clear();
    setHouseholdTimeZone(null);
    setToken(null);
    setUserId(null);
    setHouseholdId(null);
    setAdmin(null);
    setStatus("anon");
  }, []);

  // Renew shortly before the token runs out. Timers stall while a laptop
  // sleeps or a tab sits in the background, so coming back to the tab checks
  // too.
  const renewingRef = useRef(false);
  useEffect(() => {
    if (!token || (status !== "authed" && status !== "needs_bootstrap") || inMobileApp()) return;
    const wait = msUntilRenewal(token);
    if (wait === null) return;
    const due = Date.now() + wait;
    let cancelled = false;
    let timer = 0;

    const renew = async () => {
      if (renewingRef.current) return;
      renewingRef.current = true;
      const renewal = await renewStoredSession(token).finally(() => {
        renewingRef.current = false;
      });
      if (cancelled) return;
      if (renewal.status === "ok") setToken(renewal.token);
      else if (renewal.status === "expired") logOut();
      else timer = window.setTimeout(() => void renew(), RENEW_RETRY_MS);
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() < due) return;
      window.clearTimeout(timer);
      void renew();
    };

    timer = window.setTimeout(() => void renew(), wait);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, status, logOut]);

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
