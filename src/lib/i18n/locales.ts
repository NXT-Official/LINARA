/**
 * The manager app's languages: English first (the app's own wording and the
 * reference every other language is checked against), then Filipino and the
 * Business Console's other three. Each label is in its own language, so
 * anyone can find theirs. `short` is the two-letter tag the closed menu
 * shows (ISO 639-1; Filipino's is TL, as in LINARA_MOBILE), so a long name
 * never stretches the top bar.
 */
export const LOCALES = [
  { code: "en", label: "English", short: "EN" },
  { code: "fil", label: "Filipino", short: "TL" },
  { code: "es", label: "Español", short: "ES" },
  { code: "zh-CN", label: "简体中文", short: "ZH" },
  { code: "ja", label: "日本語", short: "JA" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "en";

/** The cookie that keeps the choice: the language code only, nothing about the person. */
export const LOCALE_COOKIE = "linara_locale";

export function parseLocale(raw: string | null | undefined): Locale {
  return LOCALES.find((l) => l.code === raw)?.code ?? DEFAULT_LOCALE;
}

export function localeLabel(locale: Locale): string {
  return (LOCALES.find((l) => l.code === locale) ?? LOCALES[0]).label;
}

/** The tag Intl formatting uses for each language. */
export const INTL_LOCALE: Record<Locale, string> = {
  en: "en-PH",
  fil: "fil-PH",
  es: "es",
  "zh-CN": "zh-CN",
  ja: "ja-JP",
};
