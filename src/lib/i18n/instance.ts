import { createInstance, type ParseKeys, type TFunction } from "i18next";

import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "./locales";
import { RESOURCES, type Catalog } from "./resources";

declare module "i18next" {
  interface CustomTypeOptions {
    resources: { translation: Catalog };
    returnNull: false;
  }
}

/**
 * The app's one i18next instance. It never switches language globally: the
 * server renders many people's pages at once, so every caller asks for a
 * `t` fixed to one language (`tFor`). Placeholders keep the `{name}` form;
 * React escapes text itself, so i18next doesn't. A key missing in a
 * language falls back to English, never to the raw key.
 */
export const i18n = createInstance();

void i18n.init({
  resources: RESOURCES,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  initAsync: false,
  interpolation: { prefix: "{", suffix: "}", escapeValue: false },
  returnNull: false,
});

/** A key, checked against the English catalog. */
export type MessageKey = ParseKeys;

export type Vars = Record<string, string | number>;

export type Translate = TFunction;

/** `t` for one language: in components through useT(), on the server with the cookie's language. */
export function tFor(locale: Locale): TFunction {
  return i18n.getFixedT(locale);
}

/** One message in one language, outside React. */
export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  return tFor(locale)(key, vars ?? {});
}

/** The tag Intl date and number formatting should use for a language. */
export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale] ?? INTL_LOCALE[DEFAULT_LOCALE];
}

/**
 * A text split around its placeholders, for a sentence with a link or bold
 * word inside it: the word's place differs between languages, so the screen
 * can't glue fixed pieces together. "a {x} b" -> ["a ", { name: "x" }, " b"].
 */
export function textParts(text: string): (string | { name: string })[] {
  const parts: (string | { name: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ name: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** "A, B and C" in a language's own way of listing (Intl.ListFormat). */
export function listText(locale: Locale, items: string[]): string {
  return new Intl.ListFormat(intlLocale(locale), { type: "conjunction" }).format(items);
}
