import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  audio_seconds?: number;
}

/**
 * Logs one real provider call against the signed-in user (record_ai_usage).
 * Call it only after a REAL provider response, never in the mock branch. A
 * failed log never fails the AI call: errors are swallowed and warned about.
 *
 * Chat completions report prompt_tokens/completion_tokens; the Responses API
 * reports input_tokens/output_tokens.
 */
export async function recordAiUsage(
  req: Request,
  fn: string,
  model: string,
  usage: AiUsage | undefined,
): Promise<void> {
  if (!usage) return;
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return;

    const authed = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: user, error: userError } = await authed.auth.getUser(token);
    if (userError || !user?.user) return;

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await service.rpc("record_ai_usage", {
      p_user_id: user.user.id,
      p_household_id: null,
      p_fn: fn,
      p_model: model,
      p_input_tokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      p_output_tokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
      p_audio_seconds: usage.audio_seconds ?? 0,
    });
    if (error) console.warn(`[${fn}] record_ai_usage failed:`, error.message);
  } catch (error) {
    console.warn(`[${fn}] record_ai_usage threw:`, error instanceof Error ? error.message : error);
  }
}
