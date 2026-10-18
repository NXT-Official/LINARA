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
