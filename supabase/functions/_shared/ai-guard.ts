import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * The gate in front of every OpenAI-backed function (QA LM-A6, KNOWN_GAPS
 * O47). `verify_jwt` only checks that a token is validly signed, and the
 * public anon key is, so anyone with the site's JS could call these and run
 * up the OpenAI bill. This lets a call through only for a signed-in user
 * (401 otherwise) with calls left in their allowance (429 otherwise; see
 * supabase/add-ai-call-limits.sql). Null means go ahead.
 *
 * The web dashboard's server functions pass the manager's own token, and
 * LINARA_MOBILE's `supabase.functions.invoke` sends the signed-in user's.
 */
export async function guardAiCall(
  req: Request,
  fn: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const reply = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(401, "Sign in to use this.");

  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The anon key has no user in it, so it fails here.
  const { data: user, error: userError } = await client.auth.getUser(token);
  if (userError || !user?.user) return reply(401, "Sign in to use this.");

  const { data: allowed, error: limitError } = await client.rpc("take_ai_call", { p_fn: fn });
  if (limitError) {
    // Before add-ai-call-limits.sql is applied: signed-in calls still go
    // through, rather than AI breaking for everyone.
    if (/take_ai_call|does not exist|could not find/i.test(limitError.message ?? "")) {
      console.warn(`[${fn}] take_ai_call() missing; apply add-ai-call-limits.sql`);
      return null;
    }
    console.error(`[${fn}] take_ai_call() failed:`, limitError.message);
    return reply(503, "Couldn't check your AI allowance. Try again in a moment.");
  }
  if (allowed !== true) {
    return reply(429, "That's a lot of AI requests for now. Try again in an hour.");
  }
  return null;
}
