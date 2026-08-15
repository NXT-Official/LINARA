import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

export interface HouseStandardSOP {
  title: string;
  description: string;
  station: "Yaya" | "Cook" | "Laundry" | "Driver" | "House";
  steps: string[];
  toolsRequired: string[];
  safetyProtocol: string;
}

/**
 * Server function to generate an SOP.
 * Proxies request to Supabase edge function or runs local mock fallback.
 */
export const generateSopFn = createServerFn({ method: "POST" })
  .validator(
    (data: { prompt: string; station?: "Yaya" | "Cook" | "Laundry" | "Driver" | "House" }) => data,
  )
  .handler(async ({ data }) => {
    const { prompt, station } = data;

    const useMock = process.env.USE_MOCK_AI === "true" || !process.env.SUPABASE_URL;

    if (useMock) {
      console.log(`[ServerAction:generateSopFn] Generating mock SOP for: "${prompt}"`);
      // Simulate minimal server-side delay for authentic UX loading
      await new Promise((resolve) => setTimeout(resolve, 600));

      const query = prompt.toLowerCase();
      if (
        query.includes("milk") ||
        query.includes("dede") ||
        query.includes("baby") ||
        query.includes("bote")
      ) {
        return {
          title: "Baby Bottle Preparation",
          description:
            "Warm, respectful, and hygienic preparation of baby formula to keep Sofia healthy and full.",
          station: "Yaya" as const,
          steps: [
            "Wash hands thoroughly and sterilize the bottle using steam sterilizer for 10 minutes.",
            "Boil clean water and let it cool down until it is lukewarm (maligamgam).",
            "Add exactly 4 scoops of milk formula for every 4 oz of lukewarm water.",
            "Screw the cap tightly and shake well until powder is completely dissolved.",
            "Tidy up the milk container back to the pantry and wipe the counter clean.",
          ],
          toolsRequired: [
            "Sterilized baby bottle",
            "Formula powder container",
            "Warm drinking water",
            "Clean microfiber cloth",
          ],
          safetyProtocol:
            "ALWAYS test the temperature of the milk by dropping a few drops onto your inner wrist before feeding Sofia. It must feel warm, never hot.",
        };
      }

      if (
        query.includes("plant") ||
        query.includes("halaman") ||
        query.includes("water") ||
        query.includes("dilig")
      ) {
        return {
          title: "Indoor Plants Watering",
          description:
            "Routine hydration and leaf cleaning of the living room plants to ensure high growth and zero root rot.",
          station: "House" as const,
          steps: [
            "Fill the watering can with clean, room-temperature water.",
            "Water the soil at the base of the plant gently. Avoid wetting the fiddle leaf fig center excessively.",
            "Use a damp cotton cloth to gently wipe dust off large leaves.",
            "Ensure no standing water remains in the pot plate to avoid breeding mosquitoes.",
          ],
          toolsRequired: ["Watering can", "Damp cotton cloth", "Sprayer bottle"],
          safetyProtocol:
            "Ensure the soil is dry 1 inch deep before watering to prevent root rot. Never leave stagnant water in plant saucers.",
        };
      }

      if (
        query.includes("laundry") ||
        query.includes("laba") ||
        query.includes("damit") ||
        query.includes("wash")
      ) {
        return {
          title: "Sorting and Washing Clothes",
          description:
            "Careful separation and washing of delicate whites and colored fabrics to preserve quality.",
          station: "Laundry" as const,
          steps: [
            "Separate white garments from colored ones to prevent discoloration or bleeding.",
            "Check all pockets for coins, receipts, or tissues before placing in the washing machine.",
            "Use exactly 1 cap of mild liquid detergent for a medium wash load.",
            "Hang clothes neatly using hangers or lay delicate fabrics flat on a drying rack.",
          ],
          toolsRequired: ["Washing machine", "Mild liquid detergent", "Hangers", "Laundry baskets"],
          safetyProtocol:
            "Check fabric care labels first. Never put pure wool or silk garments into the high-heat tumble dryer.",
        };
      }

      // Generic fallback matching schema
      return {
        title: `House Standard: ${prompt.trim().slice(0, 40)}${prompt.length > 40 ? "..." : ""}`,
        description: `A warm, structured standard compiled to establish clarity and repeating physical metrics for ${prompt.trim().toLowerCase()}.`,
        station: station || ("House" as const),
        steps: [
          `Thoroughly clean and prepare the target workspace before beginning.`,
          `Carry out the physical steps for ${prompt.trim().toLowerCase()} using clean, non-abrasive movements.`,
          `Wipe down and sanitize all equipment, returning them to their assigned storage slots.`,
        ],
        toolsRequired: ["Required sanitizing solution", "Microfiber cloth", "Clean storage bins"],
        safetyProtocol:
          "Check all workspace surfaces for wet areas or electrical hazards before beginning. Work with a warm and careful focus.",
      };
    }

    // Call live Supabase Edge Function
    const url = `${process.env.SUPABASE_URL}/functions/v1/generate-sop`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ prompt, station }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function returned error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return result as HouseStandardSOP;
  });

/**
 * Server function to persist a generated SOP into the House Standards
 * Library (`house_sops`). Closes KNOWN_GAPS.md gap #1's manager-facing
 * half -- generateSopFn already returns a structured HouseStandardSOP, but
 * nothing previously wrote it into the table (steps/tools_required/
 * safety_protocol added by supabase/add-house-sops-columns.sql). Follows
 * the same authed-insert pattern as inviteHelperFn in
 * src/features/people/people.actions.ts.
 */
export const insertHouseSopFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      title: string;
      description: string;
      steps: string[];
      toolsRequired: string[];
      safetyProtocol: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { token, title, description, steps, toolsRequired, safetyProtocol } = data;

    const authedClient = createAuthedClient(token);
    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized: Invalid token");
    }

    const { data: profile, error: profileError } = await authedClient
      .from("user_profiles")
      .select("household_id, user_type")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Unauthorized: Profile not found");
    }

    if (profile.user_type !== "primary_manager" && profile.user_type !== "co_manager") {
      throw new Error("Forbidden: Only managers can save House Standards");
    }

    const { data: sop, error: insertError } = await authedClient
      .from("house_sops")
      .insert({
        household_id: profile.household_id,
        title,
        description,
        steps,
        tools_required: toolsRequired,
        safety_protocol: safetyProtocol,
      })
      .select("id")
      .single();

    if (insertError || !sop) {
      throw new Error(insertError?.message || "Failed to save House Standard");
    }

    return { id: sop.id as string };
  });

// --------------------------------------------------------------------------
// Pass board (`tickets`) -- closes KNOWN_GAPS.md gap #4. See
// supabase/add-ticket-board-columns.sql for the columns these functions read
// and write beyond the original schema (block_reason, emergency, suggested,
// queued, queued_for_shift, recurrence, routine_id, appointment_id,
// appointment_title, lead_minutes, reschedule_notice).
// --------------------------------------------------------------------------

export interface TicketRow {
  id: string;
  title: string;
  notes: string | null;
  helper_id: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  photo_evidence_url: string | null;
  is_after_hours: boolean;
  emergency: boolean;
  suggested: boolean;
  queued: boolean;
  queued_for_shift: boolean;
  block_reason: string | null;
  recurrence: string[] | null;
  routine_id: string | null;
  appointment_id: string | null;
  appointment_title: string | null;
  lead_minutes: number | null;
  reschedule_notice: { oldTime: string; oldDate?: string; appointmentTitle: string } | null;
  scheduled_start: string;
  actual_start: string | null;
  actual_end: string | null;
  created_by: string | null;
  created_by_profile: { full_name: string } | null;
}

const HOUSEHOLD_EVIDENCE_BUCKET = "household-evidence";
// Matches LINARA_MOBILE's media-upload.ts SIGNED_URL_EXPIRY_SECONDS -- both
// sides agree on a 15-minute window for the private-bucket security model
// documented in architecture.md 5.1.
const SIGNED_URL_EXPIRY_SECONDS = 900;

/**
 * A Supabase Storage signed URL embeds its own storage path -- only the
 * trailing `?token=...` expires. Recovers that path from an already-expired
 * `household-evidence` signed URL so it can be re-signed fresh. Returns null
 * for anything that isn't a signed URL for this bucket (e.g. a leftover
 * pre-C12 PHOTO_POOL mock string), so callers know to leave it untouched.
 */
function extractHouseholdEvidencePath(url: string): string | null {
  const match = url.match(/\/storage\/v1\/object\/sign\/household-evidence\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Closes KNOWN_GAPS.md gap #13: `tickets.photo_evidence_url` stores the
 * signed URL LINARA_MOBILE's uploadEvidenceImage() returned at upload time,
 * which expires 15 minutes later. Re-signs it fresh from its embedded
 * storage path on every read instead. A resign failure (or a URL that isn't
 * one of ours) falls back to the stored value rather than failing the whole
 * board fetch over one bad photo.
 */
async function resignPhotoEvidenceUrl(
  authedClient: ReturnType<typeof createAuthedClient>,
  url: string | null,
): Promise<string | null> {
  if (!url) return url;

  const path = extractHouseholdEvidencePath(url);
  if (!path) return url;

  const { data, error } = await authedClient.storage
    .from(HOUSEHOLD_EVIDENCE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data) {
    console.error("[listTicketsFn] Failed to re-sign evidence photo:", error?.message);
    return url;
  }

  return data.signedUrl;
}

/**
 * Lists the household's "live" board: every not-done ticket (any date --
 * appointment/routine-linked ones persist until done, and unlike the
 * local-only prototype an unfinished one-off no longer silently vanishes at
 * day-roll, since real data shouldn't be discarded), plus done tickets whose
 * scheduled_start falls on/after `sinceIso` (today's completed list, which
 * rolls off the board once the simulated day advances past it). See
 * KNOWN_GAPS.md gap #4's closure notes for why this replaces the old
 * client-side startNewDay() keep/drop filter.
 */
export const listTicketsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; sinceIso: string }) => data)
  .handler(async ({ data }) => {
    const { token, sinceIso } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error } = await authedClient
      .from("tickets")
      .select("*, created_by_profile:user_profiles(full_name)")
      .or(`status.neq.done,scheduled_start.gte.${sinceIso}`)
      .order("scheduled_start", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const resigned = await Promise.all(
      (rows ?? []).map(async (row) => ({
        ...row,
        photo_evidence_url: await resignPhotoEvidenceUrl(authedClient, row.photo_evidence_url),
      })),
    );

    return resigned as unknown as TicketRow[];
  });

/** Creates one ticket -- addTask, and each freshly spawned routine instance. */
export const insertTicketFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      title: string;
      notes?: string;
      helperId: string;
      scheduledStartIso: string;
      photoEvidenceUrl?: string;
      isAfterHours?: boolean;
      emergency?: boolean;
      suggested?: boolean;
      queued?: boolean;
      queuedForShift?: boolean;
      recurrence?: string[] | null;
      routineId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const {
      token,
      title,
      notes,
      helperId,
      scheduledStartIso,
      photoEvidenceUrl,
      isAfterHours,
      emergency,
      suggested,
      queued,
      queuedForShift,
      recurrence,
      routineId,
    } = data;

    const authedClient = createAuthedClient(token);
    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized: Invalid token");
    }

    const { data: profile, error: profileError } = await authedClient
      .from("user_profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Unauthorized: Profile not found");
    }

    const { data: row, error } = await authedClient
      .from("tickets")
      .insert({
        household_id: profile.household_id,
        title,
        notes: notes ?? null,
        helper_id: helperId,
        scheduled_start: scheduledStartIso,
        photo_evidence_url: photoEvidenceUrl ?? null,
        is_after_hours: !!isAfterHours,
        emergency: !!emergency,
        suggested: !!suggested,
        queued: !!queued,
        queued_for_shift: !!queuedForShift,
        recurrence: recurrence ?? null,
        routine_id: routineId ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !row) {
      throw new Error(error?.message || "Failed to create task");
    }

    return { id: row.id as string };
  });

export interface TicketPatch {
  status?: "todo" | "in_progress" | "done" | "blocked";
  photoEvidenceUrl?: string | null;
  blockReason?: string | null;
  queued?: boolean;
  suggested?: boolean;
  actualStart?: string | null;
}

/** Covers updateStatus/blockTask/rescheduleTask/approveSuggestion -- all of
 * them are just a patch onto one ticket row. */
export const updateTicketFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; ticketId: string; patch: TicketPatch }) => data)
  .handler(async ({ data }) => {
    const { token, ticketId, patch } = data;

    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.photoEvidenceUrl !== undefined) dbPatch.photo_evidence_url = patch.photoEvidenceUrl;
    if (patch.blockReason !== undefined) dbPatch.block_reason = patch.blockReason;
    if (patch.queued !== undefined) dbPatch.queued = patch.queued;
    if (patch.suggested !== undefined) dbPatch.suggested = patch.suggested;
    if (patch.actualStart !== undefined) dbPatch.actual_start = patch.actualStart;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient.from("tickets").update(dbPatch).eq("id", ticketId);

    if (error) {
      throw new Error(error.message);
    }

    return { ticketId };
  });

/** dismissSuggestion/withdraw -- a suggested task a manager or remote admin
 * discards outright, not just marked done. */
export const deleteTicketFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; ticketId: string }) => data)
  .handler(async ({ data }) => {
    const { token, ticketId } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient.from("tickets").delete().eq("id", ticketId);

    if (error) {
      throw new Error(error.message);
    }

    return { ticketId };
  });

/** Reopening the board graduates every queued ticket to today's To-do in one
 * shot. Relies on tickets_isolation (household-scoped RLS) rather than an
 * explicit household_id filter, same posture as openQueuedTicketsFn's sibling
 * bulk updates elsewhere in this app (e.g. clearUtosForHelperFn). */
export const openQueuedTicketsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const { token } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient
      .from("tickets")
      .update({ queued: false })
      .eq("queued", true);

    if (error) {
      throw new Error(error.message);
    }
  });

// Appointment prep-ticket writes used to live here (KNOWN_GAPS.md gap #4's
// partial resolution of gap #7). As of Closed Gap C14, appointment creation/
// reschedule/removal is atomic across `appointments` + its prep `tickets`,
// via SECURITY DEFINER RPCs -- see
// src/features/appointments/appointment.actions.ts, which now owns that
// whole flow even though it writes to `tickets` too.

// --------------------------------------------------------------------------
// Board open/closed-for-the-night flag (`households.board_closed`) --
// closes KNOWN_GAPS.md gap #11. See supabase/add-household-board-closed.sql.
// Also reads `households.board_date` (KNOWN_GAPS.md C31, see
// supabase/add-household-board-date.sql) -- the calendar day the board was
// last rolled to, used to detect a board nobody advanced past a real day
// boundary.
// --------------------------------------------------------------------------

/** Reads the caller's household's current board-closed state and board date. */
export const getBoardClosedFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const { token } = data;

    const authedClient = createAuthedClient(token);
    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized: Invalid token");
    }

    const { data: profile, error: profileError } = await authedClient
      .from("user_profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Unauthorized: Profile not found");
    }

    const { data: household, error } = await authedClient
      .from("households")
      .select("board_closed, board_date")
      .eq("id", profile.household_id)
      .single();

    if (error || !household) {
      throw new Error(error?.message || "Failed to load board status");
    }

    return {
      boardClosed: household.board_closed as boolean,
      boardDate: household.board_date as string,
    };
  });

/** Sets the household's board-closed state. Manager-only -- same role check
 * pattern as updateHouseholdBudgetFn, since `households`' UPDATE policy is
 * household-scoped only (see the migration's comment). */
export const setBoardClosedFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; closed: boolean }) => data)
  .handler(async ({ data }) => {
    const { token, closed } = data;

    const authedClient = createAuthedClient(token);
    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized: Invalid token");
    }

    const { data: profile, error: profileError } = await authedClient
      .from("user_profiles")
      .select("household_id, user_type")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Unauthorized: Profile not found");
    }

    if (profile.user_type !== "primary_manager" && profile.user_type !== "co_manager") {
      throw new Error("Forbidden: Only managers can open or close the board");
    }

    const { error } = await authedClient
      .from("households")
      .update({ board_closed: closed })
      .eq("id", profile.household_id);

    if (error) {
      throw new Error(error.message);
    }

    return { closed };
  });

/** Persists the household's "board date" -- the calendar day startNewDay()
 * last rolled the board to (KNOWN_GAPS.md C31). Compared against the real
 * device date on load to auto-recover a board nobody rolled over for real.
 * Same manager-only gating as setBoardClosedFn, since only primary/co
 * managers can normally trigger a day rollover by hand. */
export const setBoardDateFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; date: string }) => data)
  .handler(async ({ data }) => {
    const { token, date } = data;

    const authedClient = createAuthedClient(token);
    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized: Invalid token");
    }

    const { data: profile, error: profileError } = await authedClient
      .from("user_profiles")
      .select("household_id, user_type")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Unauthorized: Profile not found");
    }

    if (profile.user_type !== "primary_manager" && profile.user_type !== "co_manager") {
      throw new Error("Forbidden: Only managers can advance the board's day");
    }

    const { error } = await authedClient
      .from("households")
      .update({ board_date: date })
      .eq("id", profile.household_id);

    if (error) {
      throw new Error(error.message);
    }

    return { date };
  });

/**
 * Closes KNOWN_GAPS.md Open Gap O2: reads Postgres's own clock
 * (infra-managed, NTP-synced, not user-controllable) via the
 * `public.server_now()` RPC added by supabase/add-server-now-function.sql.
 * Not polled continuously -- app-store-provider.tsx calls this once, right
 * before its auto-rollover effect actually fires a destructive rollover, to
 * confirm a wrong device clock (or misconfigured timezone) isn't the only
 * thing that thinks the day has moved on.
 */
export const getServerNowFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const { token } = data;

    const authedClient = createAuthedClient(token);
    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized: Invalid token");
    }

    const { data: serverNow, error } = await authedClient.rpc("server_now");

    if (error || !serverNow) {
      throw new Error(error?.message || "Failed to read the server clock");
    }

    return { serverNowIso: serverNow as string };
  });
