import type { createAuthedClient } from "@/lib/supabase";

/**
 * Her wage for the period that starts on `fullCutoffStart`: the one it had,
 * not today's (add-wage-history.sql, KNOWN_GAPS O50), so a raise or a cut
 * never re-prices a period that already closed. Before that migration, or
 * with no period to name, her wage as it is now.
 */
export async function rateForCutoff(
  client: ReturnType<typeof createAuthedClient>,
  helperId: string,
  fullCutoffStart: string | undefined,
  current: number,
): Promise<number> {
  if (!fullCutoffStart) return current;
  const { data, error } = await client.rpc("helper_rate_on", {
    p_helper_id: helperId,
    p_day: fullCutoffStart,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return current;
    throw new Error(error.message);
  }
  return data == null ? current : Number(data);
}
