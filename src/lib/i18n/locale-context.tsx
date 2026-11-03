/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { intlLocale, listText, tFor, type Translate } from "./instance";
import { writeLocale } from "./locale-cookie";
import { DEFAULT_LOCALE, type Locale } from "./locales";

type LocaleState = { locale: Locale; setLocale: (next: Locale) => void };

// Outside a provider (a test rendering one component) everything is English.
const LocaleContext = createContext<LocaleState>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

/**
 * Holds the manager's language. It starts from the cookie the server read
 * (routes/__root.tsx), so the first paint is already in that language; a
 * change shows at once and is kept in the cookie.
 */
export function LocaleProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState(initial);
  const setLocale = useCallback((next: Locale) => {
    writeLocale(next);
    document.documentElement.lang = next;
    setLocaleState(next);
  }, []);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleState {
  return useContext(LocaleContext);
}

/** `t` in the manager's language; the screen re-renders when it changes. */
export function useT(): Translate {
  const { locale } = useContext(LocaleContext);
  return useMemo(() => tFor(locale), [locale]);
}

/** The Intl tag for dates and numbers in the manager's language. */
export function useIntlLocale(): string {
  return intlLocale(useContext(LocaleContext).locale);
}

/** Joins items as the manager's language lists them: "A and B", "A y B", "A和B". */
export function useListText(): (items: string[]) => string {
  const { locale } = useContext(LocaleContext);
  return useCallback((items: string[]) => listText(locale, items), [locale]);
}
