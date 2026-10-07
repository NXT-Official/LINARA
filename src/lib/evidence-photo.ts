import type { createAuthedClient } from "@/lib/supabase";
import { householdTimeZone } from "@/lib/time";

/**
 * Task and receipt photos in the private household-evidence bucket
 * (ARCHITECTURE.md 5.1). LINARA_MOBILE uploads each one with a 480px
 * thumbnail beside it (services/media-upload.ts), and the nightly
 * purge-expired-evidence job deletes both after these many days
 * (supabase/add-evidence-photo-retention.sql). Decided 2026-10-03, not yet
 * approved by the client: KNOWN_GAPS.md O28.
 */
export const TASK_PHOTO_DAYS = 30;
export const RECEIPT_PHOTO_DAYS = 60;

export const HOUSEHOLD_EVIDENCE_BUCKET = "household-evidence";
// Matches LINARA_MOBILE's media-upload.ts SIGNED_URL_EXPIRY_SECONDS -- both
// sides agree on a 15-minute window for the private-bucket security model
// documented in architecture.md 5.1.
export const SIGNED_URL_EXPIRY_SECONDS = 900;

/** "<dir>/<name>.jpg" -> "<dir>/<name>.thumb.jpg", the same rule as the phone. */
export function evidenceThumbPath(path: string): string {
  return path.replace(/\.jpe?g$/i, "") + ".thumb.jpg";
}

/**
 * A Supabase Storage signed URL embeds its own storage path -- only the
 * trailing `?token=...` expires. Recovers that path from an already-expired
 * `household-evidence` signed URL so it can be re-signed fresh. Returns null
 * for anything that isn't a signed URL for this bucket (e.g. a leftover
 * pre-C12 PHOTO_POOL mock string), so callers know to leave it untouched.
 */
export function extractHouseholdEvidencePath(url: string): string | null {
  const match = url.match(/\/storage\/v1\/object\/sign\/household-evidence\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export type SignedEvidence = { url: string; thumbUrl: string | null };

/**
 * Signs each photo and its thumbnail in one call. A photo that can't be signed
 * (deleted, or not ours) is left out of the map, so it shows as no photo
 * rather than a broken image. A photo from before thumbnails existed has
 * thumbUrl null; callers show the full one instead.
 */
export async function signEvidencePhotos(
  client: ReturnType<typeof createAuthedClient>,
  paths: string[],
): Promise<Map<string, SignedEvidence>> {
  const unique = [...new Set(paths)];
  const signed = new Map<string, SignedEvidence>();
  if (unique.length === 0) return signed;

  const { data, error } = await client.storage
    .from(HOUSEHOLD_EVIDENCE_BUCKET)
    .createSignedUrls([...unique, ...unique.map(evidenceThumbPath)], SIGNED_URL_EXPIRY_SECONDS);
  if (error) {
    console.error("[signEvidencePhotos] Failed to sign evidence photos:", error.message);
    return signed;
  }

  const byPath = new Map<string, string>();
  for (const s of data ?? []) {
    if (s.path && s.signedUrl) byPath.set(s.path, s.signedUrl);
  }
  for (const path of unique) {
    const url = byPath.get(path);
    if (url) signed.set(path, { url, thumbUrl: byPath.get(evidenceThumbPath(path)) ?? null });
  }
  return signed;
}

/**
 * The same signed URL, served as a download named `filename`. Supabase
 * Storage reads the `download` query parameter on signed URLs (it's what
 * createSignedUrl's `download` option appends), so this needs no second
 * signing. In LINARA_MOBILE's WebView the link leaves the dashboard, so the
 * phone's browser opens it and saves the file.
 */
export function savePhotoUrl(signedUrl: string, filename: string): string {
  return `${signedUrl}${signedUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(filename)}`;
}

/** "linara-task-2026-10-03.jpg" for a photo taken at `when`, dated in the household's zone. */
export function photoFilename(kind: "task" | "receipt", when: number | string | undefined): string {
  const date = when === undefined ? new Date() : new Date(when);
  const day = Number.isNaN(date.getTime())
    ? ""
    : `-${date.toLocaleDateString("en-CA", { timeZone: householdTimeZone() })}`;
  return `linara-${kind}${day}.jpg`;
}
