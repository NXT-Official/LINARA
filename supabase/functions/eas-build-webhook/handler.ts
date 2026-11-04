// EAS build webhook relay: EAS -> this function -> Apps Script -> Google Doc.
//
// EAS signs each delivery with `expo-signature: sha1=<hex HMAC-SHA1 of the raw
// body>` (docs.expo.dev/eas/webhooks). Apps Script web apps cannot read request
// headers, so the signature is checked here, and only the fields the build log
// needs are forwarded, with a shared token in the body that Code.gs checks.
//
// Pure Web APIs only (Request, Response, crypto.subtle, fetch), so the same
// file runs on Deno (index.ts) and under vitest in Node.
//
// EAS retries any status outside 200-399. So: a bad or replayed request gets a
// 4xx and is never written; a build we choose not to log (other profiles) gets
// 200; a failure to reach or write the Doc gets 502 so EAS tries again, and
// Code.gs drops a build id it has already written.

export interface RelayConfig {
  /** The secret given to `eas webhook:create --secret`. */
  secret: string;
  /** The Apps Script web app's /exec URL. */
  appsScriptUrl: string;
  /** Shared with Code.gs (script property TOKEN). */
  appsScriptToken: string;
  /** Build profiles to log, e.g. ["preview"]. */
  profiles: string[];
  /** How long to wait for Apps Script, in ms. */
  timeoutMs?: number;
}

export interface BuildEntry {
  id: string;
  platform: string;
  status: string;
  profile: string;
  appVersion: string;
  appBuildVersion: string;
  gitCommitHash: string;
  gitCommitMessage: string;
  detailsUrl: string;
  buildUrl: string;
  errorMessage: string;
  completedAt: string;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

// EAS build payloads are a few KB; anything this large is not one.
const MAX_BODY_BYTES = 256 * 1024;
const MAX_TEXT = 500;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signBody(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return "sha1=" + toHex(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
}

async function verifySignature(
  secret: string,
  body: string,
  header: string | null,
): Promise<boolean> {
  if (!header) return false;
  const received = header.trim().toLowerCase();
  // The docs' prose says a bare hex digest, their example sends "sha1=<hex>".
  const normalized = received.startsWith("sha1=") ? received : "sha1=" + received;
  return timingSafeEqual(normalized, await signBody(secret, body));
}

function text(v: unknown): string {
  return typeof v === "string" ? v.slice(0, MAX_TEXT) : "";
}

// Links go into a shared Doc, so only Expo's own https links are kept.
function expoUrl(v: unknown): string {
  if (typeof v !== "string") return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return "";
    if (u.hostname !== "expo.dev" && !u.hostname.endsWith(".expo.dev")) return "";
    return u.toString();
  } catch {
    return "";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function toEntry(payload: Record<string, unknown>): BuildEntry | null {
  const id = payload.id;
  if (typeof id !== "string" || !/^[0-9a-f-]{8,64}$/i.test(id)) return null;
  const metadata = isRecord(payload.metadata) ? payload.metadata : {};
  const artifacts = isRecord(payload.artifacts) ? payload.artifacts : {};
  const error = isRecord(payload.error) ? payload.error : {};
  const status = text(payload.status);
  return {
    id,
    platform: text(payload.platform),
    status,
    profile: text(metadata.buildProfile),
    appVersion: text(metadata.appVersion),
    appBuildVersion: text(metadata.appBuildVersion),
    gitCommitHash: text(metadata.gitCommitHash),
    gitCommitMessage: text(metadata.gitCommitMessage),
    detailsUrl: expoUrl(payload.buildDetailsPageUrl),
    // Only a finished build has something to install.
    buildUrl: status === "finished" ? expoUrl(artifacts.buildUrl) : "",
    errorMessage: text(error.message),
    completedAt: text(payload.completedAt),
  };
}

export async function handleEasWebhook(
  req: Request,
  config: RelayConfig,
  fetchFn: FetchFn = fetch,
): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  if (!config.secret || !config.appsScriptUrl || !config.appsScriptToken) {
    console.error(
      "[eas-build-webhook] Missing EAS_WEBHOOK_SECRET, EAS_LOG_APPS_SCRIPT_URL or EAS_LOG_APPS_SCRIPT_TOKEN",
    );
    return json(500, { error: "Not configured" });
  }

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json(413, { error: "Payload too large" });
  const body = await req.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return json(413, { error: "Payload too large" });
  }

  if (!(await verifySignature(config.secret, body, req.headers.get("expo-signature")))) {
    console.error("[eas-build-webhook] Rejected: missing or mismatched expo-signature");
    return json(401, { error: "Unauthorized" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return json(400, { error: "Body is not JSON" });
  }
  if (!isRecord(payload)) return json(400, { error: "Body is not a build" });

  const entry = toEntry(payload);
  if (!entry) return json(400, { error: "Body is not a build" });

  if (!config.profiles.includes(entry.profile)) {
    return json(200, { received: true, ignored: "profile", profile: entry.profile });
  }

  let res: Response;
  try {
    res = await fetchFn(config.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: config.appsScriptToken, build: entry }),
      // Apps Script answers /exec with a 302 to script.googleusercontent.com.
      redirect: "follow",
      signal: AbortSignal.timeout(config.timeoutMs ?? 20000),
    });
  } catch (err) {
    console.error(`[eas-build-webhook] Apps Script unreachable for build ${entry.id}: ${err}`);
    return json(502, { error: "Build log unreachable" });
  }

  // Apps Script returns 200 with an HTML page for its own errors (script not
  // deployed for "Anyone", quota), so only {"ok":true} counts as written.
  let result: unknown = null;
  try {
    result = await res.json();
  } catch {
    result = null;
  }
  if (!res.ok || !isRecord(result) || result.ok !== true) {
    const reason = isRecord(result) ? text(result.error) : `HTTP ${res.status}, non-JSON reply`;
    console.error(`[eas-build-webhook] Apps Script did not write build ${entry.id}: ${reason}`);
    return json(502, { error: "Build log rejected the entry" });
  }

  return json(200, { received: true, logged: entry.id, duplicate: result.duplicate === true });
}
