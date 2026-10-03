import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Closes KNOWN_GAPS.md O28: deletes task photos after 30 days and receipt
// photos after 60 (supabase/add-evidence-photo-retention.sql). Called nightly
// by the purge-expired-evidence pg_cron job, never by a client, so like
// xendit-payout-webhook it serves no CORS and has verify_jwt = false
// (config.toml). It authenticates the caller with the x-purge-secret header
// against EVIDENCE_PURGE_SECRET, which the job reads from Vault.
//
// release_expired_evidence() picks the expired files and clears the rows that
// point at them; this then removes the files through the Storage API (SQL
// can't). A failed removal leaves the files for the next night's run.

const BUCKET = "household-evidence";
// Paths per release_expired_evidence() call, and per Storage remove request.
const BATCH = 1000;
const REMOVE_CHUNK = 100;
// Bounds one run; anything beyond waits for the next night.
const MAX_BATCHES = 20;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expected = Deno.env.get("EVIDENCE_PURGE_SECRET");
  if (!expected || req.headers.get("x-purge-secret") !== expected) {
    console.error("[purge-expired-evidence] Rejected: missing or mismatched x-purge-secret");
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let released = 0;
  let removed = 0;
  const failed: string[] = [];

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const { data, error } = await supabase.rpc("release_expired_evidence", {
        p_limit: BATCH,
      });
      if (error) throw new Error(error.message);
      const paths = (data ?? []) as string[];
      released += paths.length;

      for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
        const chunk = paths.slice(i, i + REMOVE_CHUNK);
        const { data: gone, error: removeError } = await supabase.storage
          .from(BUCKET)
          .remove(chunk);
        if (removeError) {
          console.error("[purge-expired-evidence] remove failed:", removeError.message);
          failed.push(...chunk);
        } else {
          removed += gone?.length ?? 0;
        }
      }

      // A short batch was the last one. A failed chunk would come straight
      // back from the next call, so stop rather than loop on it.
      if (paths.length < BATCH || failed.length > 0) break;
    }
  } catch (err) {
    console.error("[purge-expired-evidence] failed:", (err as Error).message);
    return json({ error: (err as Error).message, released, removed }, 500);
  }

  console.log(
    `[purge-expired-evidence] released ${released}, removed ${removed}, failed ${failed.length}`,
  );
  return json({ released, removed, failed: failed.length }, failed.length > 0 ? 500 : 200);
});
