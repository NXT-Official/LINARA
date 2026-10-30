import { Languages } from "lucide-react";

import { useLocale, useT } from "@/lib/i18n/locale-context";
import { LOCALES, parseLocale } from "@/lib/i18n/locales";

/**
 * Picks the app's language, as the Business Console's menu does. A native
 * select, so phones show their own picker and screen readers know it; each
 * language is written in itself so anyone can find theirs. The choice is
 * kept in a cookie and the page re-renders in place (lib/i18n).
 *
 * Closed, it shows the language's two-letter tag at a fixed width; the
 * select is laid invisibly over it, so the chosen name ("Filipino",
 * "简体中文") never widens the bar, and the open list keeps full names.
 */
export function LanguageMenu({ className = "" }: { className?: string }) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];
  return (
    <label
      className={`relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-muted-foreground transition-colors duration-150 ease-out focus-within:ring-2 focus-within:ring-ring hover:bg-secondary/60 hover:text-foreground active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0 ${className}`}
    >
      <Languages className="h-4 w-4 shrink-0" aria-hidden />
      <span data-testid="language-tag" aria-hidden className="w-[2ch] text-center tabular-nums">
        {current.short}
      </span>
      <select
        value={locale}
        aria-label={`${t("common.language.label")}: ${current.label}`}
        onChange={(e) => setLocale(parseLocale(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
