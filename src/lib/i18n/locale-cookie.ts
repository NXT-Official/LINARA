import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

import { LOCALE_COOKIE, parseLocale, type Locale } from "./locales";

/**
 * The manager's language, from the cookie. Read on the server too, so a page
 * arrives in the right language instead of flashing English first. The
 * Business Console does the same (LINARA_ADMIN src/lib/i18n/locale-cookie.ts).
 */
export const readLocale = createIsomorphicFn()
  .server((): Locale => {
    // Outside a request (tests, build-time tools) there is no cookie to read.
    try {
      return parseLocale(getCookie(LOCALE_COOKIE));
    } catch {
      return parseLocale(null);
    }
  })
  .client((): Locale => localeFromCookies(document.cookie));

/** The language in a `document.cookie` string. */
export function localeFromCookies(cookies: string): Locale {
  const entry = cookies.split("; ").find((c) => c.startsWith(`${LOCALE_COOKIE}=`));
  return parseLocale(entry?.slice(LOCALE_COOKIE.length + 1));
}

export function writeLocale(locale: Locale) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}
