/**
 * A "signed in on this browser" marker the server can read (QA LM-4).
 *
 * The manager's session lives in localStorage (use-session.ts, and the
 * LINARA_MOBILE WebView writes the same keys), which a request never carries.
 * So the server couldn't tell a signed-out visitor from a signed-in one: it
 * rendered /manager/* for both with a 200, and the browser only moved a
 * signed-out visitor to /login once the scripts had loaded, seconds later on
 * a slow phone. With this cookie the server sends a request without it
 * straight to /login.
 *
 * It holds no token and grants nothing: the session and the database's RLS
 * still decide what anyone can read. A stale one (cookie kept, session gone)
 * just falls through to the page's own check, as before.
 */
export const SIGNED_IN_COOKIE = "linara_signed_in";

// Renewed on every signed-in load, so it only lapses for someone away a month.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Sets the marker once a session is confirmed, and clears it when there isn't one. */
export function markSignedIn(on: boolean) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = on
    ? `${SIGNED_IN_COOKIE}=1; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`
    : `${SIGNED_IN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

/** Whether a request carries the marker. */
export function hasSignedInCookie(cookieHeader: string | null): boolean {
  return (cookieHeader ?? "").split(";").some((part) => part.trim() === `${SIGNED_IN_COOKIE}=1`);
}

/**
 * For a manager page requested without the marker: a 307 to /login, sent
 * before anything renders. Null for everything else.
 */
export function signedOutRedirect(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const { pathname } = new URL(request.url);
  if (pathname !== "/manager" && !pathname.startsWith("/manager/")) return null;
  if (hasSignedInCookie(request.headers.get("cookie"))) return null;
  return new Response(null, {
    status: 307,
    headers: { location: "/login", "cache-control": "no-store" },
  });
}
