import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import {
  clearStoredManagerSession,
  readStoredManagerToken,
  readStoredManagerUserId,
  renewStoredSession,
} from "@/features/people/hooks/use-session";
import { isDueForRenewal } from "@/features/people/people.utils";

import { amIPlatformAdminFn } from "../platform-admin.actions";

export type PlatformAdminStatus =
  "loading" | "anon" | "not_admin" | "admin" | "unavailable" | "error";

export type PlatformAdminSession = {
  status: PlatformAdminStatus;
  token: string | null;
  userId: string | null;
  logOut: () => void;
  /** Asks again after an `error`. */
  retry: () => void;
};

type Answer = { available: boolean; isPlatformAdmin: boolean };

// One question per token for the life of the page: the shell, the gate and the
// TopBar all ask, and the answer doesn't change inside a session.
const answers = new Map<string, Promise<Answer>>();

function askOnce(token: string): Promise<Answer> {
  const cached = answers.get(token);
  if (cached) return cached;
  const pending = amIPlatformAdminFn({ data: { token } });
  answers.set(token, pending);
  pending.catch(() => answers.delete(token));
  return pending;
}

/**
 * The signed-in manager's token, renewed first when it is about to lapse.
 * Null when there is no session or it can't be renewed.
 */
async function usableToken(): Promise<string | null> {
  const stored = readStoredManagerToken();
  if (!stored) return null;
  if (!isDueForRenewal(stored)) return stored;
  const renewal = await renewStoredSession(stored);
  if (renewal.status === "ok") return renewal.token;
  if (renewal.status === "expired") {
    clearStoredManagerSession();
    return null;
  }
  return stored;
}

/**
 * Who is at /admin. It reads the manager's stored token itself because /admin
 * sits outside `_app`, so the feature stores (and `useSession`) aren't there.
 */
export function usePlatformAdminSession(): PlatformAdminSession {
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<PlatformAdminSession, "logOut" | "retry">>({
    status: "loading",
    token: null,
    userId: null,
  });

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const token = await usableToken();
      if (cancelled) return;
      if (!token) {
        setState({ status: "anon", token: null, userId: null });
        return;
      }
      const userId = readStoredManagerUserId();
      try {
        const answer = await askOnce(token);
        if (cancelled) return;
        const status = !answer.available
          ? "unavailable"
          : answer.isPlatformAdmin
            ? "admin"
            : "not_admin";
        setState({ status, token, userId });
      } catch (err) {
        console.error("[usePlatformAdminSession] Couldn't check admin access:", err);
        if (!cancelled) setState({ status: "error", token, userId });
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading", token: null, userId: null });
    setAttempt((n) => n + 1);
  }, []);

  const logOut = useCallback(() => {
    clearStoredManagerSession();
    void navigate({ to: "/login", replace: true });
  }, [navigate]);

  return { ...state, logOut, retry };
}

/** Whether to show the "Admin" link in the TopBar. False until the answer is in. */
export function usePlatformAdminFlag(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    usableToken()
      .then((token) => (token ? askOnce(token) : null))
      .then((answer) => {
        if (!cancelled) setIsAdmin(answer !== null && answer.available && answer.isPlatformAdmin);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return isAdmin;
}
