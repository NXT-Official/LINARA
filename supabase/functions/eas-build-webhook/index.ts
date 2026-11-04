// Public receiver for EAS build webhooks (eas webhook:create --event BUILD).
// verify_jwt MUST stay false: EAS calls with no Supabase session; the caller is
// authenticated by the expo-signature HMAC instead. See handler.ts.
//
// Secrets (supabase secrets set):
//   EAS_WEBHOOK_SECRET         same value as `eas webhook:create --secret`
//   EAS_LOG_APPS_SCRIPT_URL    the Apps Script web app /exec URL
//   EAS_LOG_APPS_SCRIPT_TOKEN  same value as Code.gs script property TOKEN
//   EAS_LOG_PROFILES           optional, comma-separated, default "preview"

import { handleEasWebhook } from "./handler.ts";

Deno.serve((req) =>
  handleEasWebhook(req, {
    secret: Deno.env.get("EAS_WEBHOOK_SECRET") ?? "",
    appsScriptUrl: Deno.env.get("EAS_LOG_APPS_SCRIPT_URL") ?? "",
    appsScriptToken: Deno.env.get("EAS_LOG_APPS_SCRIPT_TOKEN") ?? "",
    profiles: (Deno.env.get("EAS_LOG_PROFILES") ?? "preview")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
  }),
);
