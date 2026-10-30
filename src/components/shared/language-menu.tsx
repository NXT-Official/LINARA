import { Languages } from "lucide-react";

import { useLocale, useT } from "@/lib/i18n/locale-context";
import { LOCALES, parseLocale } from "@/lib/i18n/locales";

/**
 * Picks the app's language, as the Business Console's menu does. A native
 * select, so phones show their own picker and screen readers know it; each
 * language is written in itself so anyone can find theirs. The choice is
 * kept in a cookie and the page re-renders in place (lib/i18n).
 */
export function LanguageMenu({ className = "" }: { className?: string }) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  return (
    <label
      className={`relative inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-muted-foreground transition-colors duration-150 ease-out focus-within:ring-2 focus-within:ring-ring hover:bg-secondary/60 hover:text-foreground ${className}`}
    >
      <Languages className="h-4 w-4 shrink-0" aria-hidden />
      <span className="sr-only">{t("common.language.label")}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(parseLocale(e.target.value))}
        className="cursor-pointer appearance-none bg-transparent pr-1 outline-none"
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
