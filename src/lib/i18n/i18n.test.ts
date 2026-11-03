import { describe, expect, it } from "vitest";

import { intlLocale, listText, textParts, translate } from "./instance";
import { DEFAULT_LOCALE, LOCALES, localeLabel, parseLocale } from "./locales";
import { RESOURCES } from "./resources";

/** "area.key" -> text, for every leaf of a nested catalog. */
function flatten(node: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const MESSAGES = Object.fromEntries(
  LOCALES.map((l) => [l.code, flatten(RESOURCES[l.code].translation)]),
) as Record<(typeof LOCALES)[number]["code"], Record<string, string>>;

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("locales", () => {
  it("English is the default, so nothing changes until a manager picks", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(parseLocale(null)).toBe("en");
    expect(parseLocale(undefined)).toBe("en");
    expect(parseLocale("")).toBe("en");
    expect(parseLocale("fr")).toBe("en");
  });

  it("keeps a stored choice", () => {
    for (const l of LOCALES) expect(parseLocale(l.code)).toBe(l.code);
  });

  it("lists all five languages, each named in its own language", () => {
    expect(LOCALES.map((l) => l.label)).toEqual([
      "English",
      "Filipino",
      "Español",
      "简体中文",
      "日本語",
    ]);
    expect(localeLabel("ja")).toBe("日本語");
    expect(intlLocale("fil")).toBe("fil-PH");
  });
});

describe("messages", () => {
  const keys = Object.keys(MESSAGES.en).sort();
  const PLURAL = /_(zero|one|two|few|many|other)$/;
  const base = (k: string) => k.replace(PLURAL, "");
  const pluralBases = [...new Set(keys.filter((k) => PLURAL.test(k)).map(base))].sort();
  const forms = (code: string, b: string) =>
    Object.keys(MESSAGES[code as keyof typeof MESSAGES]).filter((x) => base(x) === b);
  const withoutCount = (text: string) => placeholders(text).filter((p) => p !== "count");

  it("every language has every key, none empty", () => {
    for (const l of LOCALES) {
      expect([l.code, Object.keys(MESSAGES[l.code]).sort()]).toEqual([l.code, keys]);
      for (const [k, v] of Object.entries(MESSAGES[l.code])) {
        expect([l.code, k, v.trim() === ""]).toEqual([l.code, k, false]);
      }
    }
  });

  it("a key split into plural forms has both one and other in every language", () => {
    for (const l of LOCALES) {
      for (const b of pluralBases) {
        const f = forms(l.code, b);
        expect([l.code, b, f.map((x) => x.slice(b.length + 1)).sort()]).toEqual([
          l.code,
          b,
          ["one", "other"],
        ]);
      }
      expect(translate(l.code, "dashboard.periodsNoPayment", { count: 1 })).not.toBe(
        "dashboard.periodsNoPayment",
      );
      expect(translate(l.code, "dashboard.periodsNoPayment", { count: 2 })).not.toBe(
        "dashboard.periodsNoPayment",
      );
    }
  });

  it("every language keeps the same placeholders, so no value is dropped", () => {
    for (const l of LOCALES) {
      for (const k of keys) {
        expect([l.code, k, withoutCount(MESSAGES[l.code][k])]).toEqual([
          l.code,
          k,
          withoutCount(MESSAGES.en[k]),
        ]);
      }
    }
  });

  it("no language is just a copy of the English", () => {
    for (const l of LOCALES.filter((x) => x.code !== "en")) {
      const same = keys.filter((k) => MESSAGES[l.code][k] === MESSAGES.en[k]).length;
      expect([l.code, same / keys.length < 0.2]).toEqual([l.code, true]);
    }
  });
});

describe("translate and helpers", () => {
  it("translates by locale and fills placeholders, leaving a missing one showing", () => {
    expect(translate("en", "common.tryAgain")).toBe("Try again");
    expect(translate("en", "common.showMore", { count: 3, noun: "items" })).toBe(
      "Show 3 more items",
    );
    expect(translate("en", "common.language.current", {})).toBe("Language: {language}");
  });

  it("splits around placeholders in any order and formats lists", () => {
    expect(textParts("a {terms} b {privacy}.")).toEqual([
      "a ",
      { name: "terms" },
      " b ",
      { name: "privacy" },
      ".",
    ]);
    expect(textParts("{mine}のアカウント")).toEqual([{ name: "mine" }, "のアカウント"]);
    expect(textParts("plain")).toEqual(["plain"]);
    expect(listText("en", ["Ana", "Rosa"])).toContain("Ana");
  });
});
