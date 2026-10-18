import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

/**
 * Linara staff ("platform admins", supabase/add-platform-admins.sql). The
 * database decides who is one; this only asks. Until the SQL is applied the
 * function doesn't exist, and the answer is `available: false` so the web
 * says the admin tools aren't switched on instead of failing.
 */
const missingFunction = (error: { code?: string; message?: string } | null) =>
  error?.code === "PGRST202" ||
  error?.code === "42883" ||
  error?.code === "42P01" ||
  /does not exist|could not find/i.test(error?.message ?? "");

export const amIPlatformAdminFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<{ available: boolean; isPlatformAdmin: boolean }> => {
    const client = createAuthedClient(data.token);
    const { data: answer, error } = await client.rpc("am_i_platform_admin");
    if (missingFunction(error)) return { available: false, isPlatformAdmin: false };
    if (error) throw new Error(error.message || "Couldn't check admin access");
    return { available: true, isPlatformAdmin: answer === true };
  });
