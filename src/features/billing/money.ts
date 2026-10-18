/**
 * Integer centavos to "₱1,234.50". Always two decimals: never use fmtPeso for
 * prices, it rounds. Negative amounts read "−₱80,303.00" (a true minus sign).
 */
export function fmtCentavos(c: number): string {
  const negative = c < 0;
  const abs = Math.abs(Math.round(c));
  const pesos = Math.floor(abs / 100);
  const centavos = String(abs % 100).padStart(2, "0");
  return `${negative ? "−" : ""}₱${pesos.toLocaleString("en-US")}.${centavos}`;
}

/** Centavos from a pesos string ("19.99" -> 1999), or null when it is not pesos with up to two decimals. */
export function pesosToCentavos(text: string): number | null {
  const [whole = "", cents, ...rest] = text.trim().split(".");
  if (rest.length > 0 || !/^[0-9]+$/.test(whole)) return null;
  if (cents !== undefined && !/^[0-9]{1,2}$/.test(cents)) return null;
  return Math.round(Number(text.trim()) * 100);
}
