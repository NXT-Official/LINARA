/**
 * Headers every page the server renders carries (QA LM-A8, 2026-10-07).
 *
 * - No framing by another site (`frame-ancestors 'none'`, and the older
 *   `X-Frame-Options` for browsers that predate it). Nothing frames the
 *   dashboard: the LINARA_MOBILE WebView loads it as the whole page.
 * - `nosniff`, so a response is only ever read as the type it says it is.
 * - The full URL goes to this site only; other sites get the origin.
 *
 * Not a full Content-Security-Policy yet: one has to list Supabase, Google
 * Fonts and the inline hydration scripts, and a wrong one breaks the app, so
 * it's its own change with its own test (KNOWN_GAPS O48).
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

/** The same response with the headers added (a header it already sets wins). */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
