import { existsSync, readFileSync } from "node:fs";

import { AUTH_FILE } from "../../playwright.config";

/**
 * The deep checks (npm run qa:deep) write real rows to the shared database's
 * test household. Everything they make is named with this prefix and deleted
 * again through Supabase's REST API as the signed-in test manager (RLS lets a
 * manager delete their own household's tickets, pantry and grocery items).
 * Cleanup runs before the checks too, for anything a crashed run left.
 */
export const DEEP_PREFIX = "QA deep test";

/** A name nobody else would use, e.g. "QA deep test task lq3x9 (delete me)". */
export function deepName(what: string): string {
  return `${DEEP_PREFIX} ${what} ${Date.now().toString(36)} (delete me)`;
}

export function session() {
  const state = JSON.parse(readFileSync(AUTH_FILE, "utf8")) as {
    origins: { localStorage: { name: string; value: string }[] }[];
  };
  const items = state.origins.flatMap((o) => o.localStorage);
  const get = (name: string) => items.find((i) => i.name === name)?.value ?? "";
  return { token: get("linara_manager_token"), householdId: get("linara_manager_household_id") };
}

const TABLES = {
  // Grocery lines before pantry items: they point at them.
  pantry: [
    ["grocery_items", "name"],
    ["pantry_items", "name"],
  ],
  tasks: [["tickets", "title"]],
} as const;

/**
 * Deletes the rows in one area whose name starts with DEEP_PREFIX; returns
 * how many. Per area, because the spec files run in parallel: a sweep of
 * everything would delete another file's rows mid-test.
 */
export async function sweepDeepRows(area: keyof typeof TABLES): Promise<number> {
  if (!process.env.SUPABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY aren't set (.env).");
  const { token, householdId } = session();
  if (!token || !householdId) throw new Error(`No manager session in ${AUTH_FILE}.`);

  const like = encodeURIComponent(`${DEEP_PREFIX}*`);
  let removed = 0;
  for (const [table, column] of TABLES[area]) {
    const res = await fetch(
      `${url}/rest/v1/${table}?household_id=eq.${householdId}&${column}=like.${like}`,
      {
        method: "DELETE",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          Prefer: "return=representation",
        },
      },
    );
    if (!res.ok) throw new Error(`Cleaning up ${table}: ${res.status} ${await res.text()}`);
    removed += ((await res.json()) as unknown[]).length;
  }
  return removed;
}

function env() {
  if (!process.env.SUPABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY aren't set (.env).");
  const { token } = session();
  if (!token) throw new Error(`No manager session in ${AUTH_FILE}.`);
  // The JWT's subject is the signed-in manager's user id.
  const userId = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub;
  return { url, anonKey, token, userId: userId as string };
}

/**
 * Deletes the receipts the test manager added since `sinceIso` -- rows and
 * their photo and thumbnail in Storage -- and returns the deleted rows'
 * storage paths. Receipts have no name to tag, so they're found by who and
 * when; only the receipt spec adds any as the manager.
 */
export async function removeReceiptsSince(sinceIso: string): Promise<string[]> {
  const { url, anonKey, token, userId } = env();
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}` };
  const res = await fetch(
    `${url}/rest/v1/grocery_receipts?uploaded_by=eq.${userId}&created_at=gte.${encodeURIComponent(sinceIso)}`,
    { method: "DELETE", headers: { ...headers, Prefer: "return=representation" } },
  );
  if (!res.ok) throw new Error(`Cleaning up grocery_receipts: ${res.status} ${await res.text()}`);
  const paths = ((await res.json()) as { storage_path: string }[]).map((r) => r.storage_path);
  if (paths.length > 0) {
    const prefixes = paths.flatMap((p) => [p, p.replace(/\.jpe?g$/i, "") + ".thumb.jpg"]);
    const del = await fetch(`${url}/storage/v1/object/household-evidence`, {
      method: "DELETE",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes }),
    });
    if (!del.ok) throw new Error(`Cleaning up receipt photos: ${del.status} ${await del.text()}`);
  }
  return paths;
}

/** The names of the files in `dir` of household-evidence, e.g. "<household>/receipts". */
export async function listEvidence(dir: string): Promise<string[]> {
  const { url, anonKey, token } = env();
  const res = await fetch(`${url}/storage/v1/object/list/household-evidence`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix: dir, limit: 1000 }),
  });
  if (!res.ok) throw new Error(`Listing ${dir}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { name: string }[]).map((f) => f.name);
}
