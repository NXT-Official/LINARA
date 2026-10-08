import { useCallback, useEffect, useRef, useState } from "react";

import {
  claimManagerInviteFn,
  createHouseholdFn,
  leaveHouseholdFn,
  listMyHouseholdsFn,
  managerRosterFn,
  removeManagerFn,
  setManagerRoleFn,
  switchHouseholdFn,
  type ActiveHousehold,
} from "../household.actions";
import {
  finishBootstrapFn,
  getManagerProfileFn,
  refreshManagerSessionFn,
  resolveManagerLoginFn,
  setUpNewManagerFn,
} from "../people.actions";
import { signInWithSupabase, signUpWithSupabase } from "../people.auth";
import type {
  Admin,
  AdminType,
  HouseholdSummary,
  ManagerMember,
  ManagerRole,
} from "../people.types";
import { markSignedIn } from "@/lib/signed-in-cookie";
import { setHouseholdTimeZone } from "@/lib/time";
import { managerRoleType } from "../people.constants";
import { initialsOf, isDueForRenewal, msUntilRenewal, shortNameOf } from "../people.utils";

const TOKEN_KEY = "linara_manager_token";
const REFRESH_KEY = "linara_manager_refresh_token";
const USER_ID_KEY = "linara_manager_user_id";
const HOUSEHOLD_ID_KEY = "linara_manager_household_id";

// Offline, or Supabase down: try again after this long.
const RENEW_RETRY_MS = 60_000;
// How often an open, visible dashboard checks it's still in the household
// the account is in (a switch on another device moves the whole account).
const HOUSEHOLD_CHECK_MS = 120_000;

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

function buildAdmin(id: string, fullName: string, userType: string): Admin {
  const trimmed = fullName.trim() || "Manager";
  const short = shortNameOf(trimmed);
  const initials = initialsOf(trimmed);
  // people.constants.ts's labels and every consumer of Admin.type are keyed
  // on the UI side, so the database role is mapped once, here.
  const type = managerRoleType[userType as ManagerRole] ?? "primary";
  return {
    id,
    name: trimmed,
    short,
    initials,
    type,
    location: type === "remote" ? "Remote" : "On-site",
  };
}

/**
 * After a switch, a new household or a claimed code: the account is in a
 * different household now, so the whole dashboard loads again for it.
 */
function enterHousehold(result: ActiveHousehold) {
  if (result.householdId) window.localStorage.setItem(HOUSEHOLD_ID_KEY, result.householdId);
  else window.localStorage.removeItem(HOUSEHOLD_ID_KEY);
  window.location.assign("/manager/pass");
}

export type Session = {
  status: SessionStatus;
  /** Everyone who manages the household you're in; just you until it loads. */
  admins: Admin[];
  currentAdmin: Admin | null;
  adminType: AdminType | null;
  token: string | null;
  userId: string | null;
  householdId: string | null;
  /**
   * supabase/add-household-managers.sql is applied: households, the roster
   * and manager invites are real. False before then, and the dashboard
   * stays one manager, one household.
   */
  multiManager: boolean;
  /** Every household this account manages, the current one marked. */
  households: HouseholdSummary[];
  /** The household you're in, by name (null until the list loads). */
  householdName: string | null;
  managers: ManagerMember[];
  refreshManagers: () => Promise<void>;
  /** These reload the dashboard into the household they leave the account in. */
  switchHousehold: (householdId: string) => Promise<void>;
  createHousehold: (name: string) => Promise<void>;
  joinHousehold: (code: string, fullName?: string) => Promise<void>;
  leaveHousehold: () => Promise<void>;
  setManagerRole: (userId: string, role: ManagerRole) => Promise<void>;
  removeManager: (userId: string) => Promise<void>;
  signUp: (data: {
    fullName: string;
    householdName?: string;
    email: string;
    password: string;
    /** Join that household with a manager code instead of starting one. */
    inviteCode?: string;
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
  const [multiManager, setMultiManager] = useState(false);
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [managers, setManagers] = useState<ManagerMember[]>([]);
  // The newest token, without re-running effects at every renewal.
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  const persist = (
    accessToken: string,
    refreshToken: string,
    uid: string,
    hhId?: string | null,
  ) => {
    window.localStorage.setItem(TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_KEY, refreshToken);
    window.localStorage.setItem(USER_ID_KEY, uid);
    if (hhId) window.localStorage.setItem(HOUSEHOLD_ID_KEY, hhId);
  };

  const clear = () => {
    markSignedIn(false);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(USER_ID_KEY);
    window.localStorage.removeItem(HOUSEHOLD_ID_KEY);
  };

  // The marker the server reads to send a signed-out visitor of /manager/*
  // straight to /login (lib/signed-in-cookie.ts). Set on every signed-in load,
  // so a session the LINARA_MOBILE WebView wrote gets one too.
  useEffect(() => {
    if (status === "authed") markSignedIn(true);
    else if (status !== "loading") markSignedIn(false);
  }, [status]);

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
        setAdmin(buildAdmin(result.userId, result.fullName, result.userType));
        setStatus("authed");
      })
      .catch((err) => {
        console.error("[useSession] Failed to rehydrate manager session:", err);
        clear();
        setToken(null);
        setStatus("anon");
      });
  }, []);

  // The account itself is made in the browser, straight with Supabase Auth
  // (people.auth.ts, QA LM-A7); the server sets up the household after.
  const signUp: Session["signUp"] = useCallback(async (data) => {
    const auth = await signUpWithSupabase(
      data.email,
      data.password,
      `${window.location.origin}/email-confirmed?for=manager`,
    );
    if (auth.status === "confirmation_pending") {
      return "confirmation_pending";
    }
    const result = await setUpNewManagerFn({
      data: {
        accessToken: auth.accessToken,
        fullName: data.fullName,
        householdName: data.householdName,
        inviteCode: data.inviteCode,
      },
    });
    persist(auth.accessToken, auth.refreshToken, result.userId, result.householdId);
    setHouseholdTimeZone(result.timeZone);
    setToken(auth.accessToken);
    setUserId(result.userId);
    setHouseholdId(result.householdId);
    setAdmin(buildAdmin(result.userId, result.fullName, result.userType));
    setStatus("authed");
    return "authed";
  }, []);

  // Signed in from the browser, straight with Supabase Auth (people.auth.ts,
  // QA LM-A7); the server only says who the account is.
  const logIn: Session["logIn"] = useCallback(async (data) => {
    const auth = await signInWithSupabase(data.email, data.password);
    if (auth.status === "confirmation_pending") {
      return "confirmation_pending";
    }
    const result = await resolveManagerLoginFn({ data: { accessToken: auth.accessToken } });
    if (result.status === "helper") {
      return "helper";
    }
    if (result.status === "needs_bootstrap") {
      persist(auth.accessToken, auth.refreshToken, result.userId);
      setToken(auth.accessToken);
      setUserId(result.userId);
      setStatus("needs_bootstrap");
      return "needs_bootstrap";
    }
    persist(auth.accessToken, auth.refreshToken, result.userId, result.householdId);
    setHouseholdTimeZone(result.timeZone);
    setToken(auth.accessToken);
    setUserId(result.userId);
    setHouseholdId(result.householdId);
    setAdmin(buildAdmin(result.userId, result.fullName, result.userType));
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
      setAdmin(buildAdmin(result.userId, result.fullName, result.userType));
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

  // Your households and this household's managers, once signed in to one.
  const refreshManagers = useCallback(async () => {
    const current = tokenRef.current;
    if (!current) return;
    const [mine, roster] = await Promise.all([
      listMyHouseholdsFn({ data: { token: current } }),
      managerRosterFn({ data: { token: current } }),
    ]);
    setMultiManager(mine.available && roster.available);
    setHouseholds(mine.households);
    setManagers(roster.managers);
  }, []);

  useEffect(() => {
    if (status !== "authed" || !householdId) return;
    refreshManagers().catch((err) => {
      console.error("[useSession] Couldn't load households and managers:", err);
    });
  }, [status, householdId, refreshManagers]);

  // A switch made in another tab, or on another device (one active
  // household per account), moves this dashboard too.
  useEffect(() => {
    if (status !== "authed" || !householdId) return;
    let lastCheck = Date.now();
    const check = async () => {
      const current = tokenRef.current;
      if (!current || document.visibilityState !== "visible") return;
      lastCheck = Date.now();
      try {
        const profile = await getManagerProfileFn({ data: { token: current } });
        const now = profile.status === "authed" ? profile.householdId : null;
        if (now !== householdId) enterHousehold({ householdId: now, userType: "", timeZone: null });
      } catch {
        // Offline or a stale token: the renewal effect handles that.
      }
    };
    const onVisible = () => {
      if (Date.now() - lastCheck > 30_000) void check();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === HOUSEHOLD_ID_KEY && e.newValue && e.newValue !== householdId) {
        window.location.reload();
      }
    };
    const timer = window.setInterval(() => void check(), HOUSEHOLD_CHECK_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, [status, householdId]);

  const withToken = <A extends unknown[], R>(fn: (token: string, ...args: A) => Promise<R>) => {
    return async (...args: A) => {
      const current = tokenRef.current;
      if (!current) throw new Error("Not signed in");
      return fn(current, ...args);
    };
  };

  const switchHousehold = withToken(async (t, id: string) => {
    enterHousehold(await switchHouseholdFn({ data: { token: t, householdId: id } }));
  });
  const createHousehold = withToken(async (t, name: string) => {
    enterHousehold(await createHouseholdFn({ data: { token: t, name } }));
  });
  const joinHousehold = withToken(async (t, code: string, fullName?: string) => {
    enterHousehold(await claimManagerInviteFn({ data: { token: t, code, fullName } }));
  });
  const leaveHousehold = withToken(async (t) => {
    enterHousehold(await leaveHouseholdFn({ data: { token: t } }));
  });
  const setManagerRole = withToken(async (t, id: string, role: ManagerRole) => {
    await setManagerRoleFn({ data: { token: t, userId: id, role } });
    // Handing over primary changes your own role: load as the new you.
    if (role === "primary_manager") window.location.reload();
    else await refreshManagers();
  });
  const removeManager = withToken(async (t, id: string) => {
    await removeManagerFn({ data: { token: t, userId: id } });
    await refreshManagers();
  });

  const admins =
    multiManager && managers.length > 0
      ? managers.map((m) => buildAdmin(m.userId, m.fullName, m.role))
      : admin
        ? [admin]
        : [];

  return {
    status,
    admins,
    currentAdmin: admin,
    adminType: admin?.type ?? null,
    token,
    userId,
    householdId,
    multiManager,
    households,
    householdName: households.find((h) => h.isCurrent)?.name ?? null,
    managers,
    refreshManagers,
    switchHousehold,
    createHousehold,
    joinHousehold,
    leaveHousehold,
    setManagerRole,
    removeManager,
    signUp,
    logIn,
    finishBootstrap,
    logOut,
  };
}
