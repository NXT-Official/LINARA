import { createServerFn } from "@tanstack/react-start";

import { placeColumns } from "@/features/sharing/sharing.utils";
import type { PlaceRef } from "@/features/sharing/sharing.types";
import { createAuthedClient } from "@/lib/supabase";
import { extractHouseholdEvidencePath, signEvidencePhotos } from "@/lib/evidence-photo";
import { pushToHelper } from "@/features/notifications/push";

import { TASK_SEARCH_LIMIT } from "./planner.utils";
import { occurrenceId } from "./routine.utils";
import type { Status } from "./task.types";

export interface HouseStandardSOP {
  title: string;
  description: string;
  station: string;
  steps: string[];
  toolsRequired: string[];
  safetyProtocol: string;
}

/**
 * Server function to generate an SOP.
 * Proxies request to Supabase edge function or runs local mock fallback.
 */
export const generateSopFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; prompt: string; station?: string }) => data)
  .handler(async ({ data }) => {
    const { token, prompt, station } = data;
    if (!token) throw new Error("Sign in to use this.");

    const useMock = process.env.USE_MOCK_AI === "true" || !process.env.SUPABASE_URL;

    if (useMock) {
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
        // The manager's own token: the function turns away the anon key (LM-A6).
        Authorization: `Bearer ${token}`,
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
  helper_id: string | null;
  status: Status;
  photo_evidence_url: string | null;
  /** Its 480px thumbnail, signed alongside it on read; null for older photos. */
  photo_thumb_url?: string | null;
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
  /**
   * oldStartIso since O14; older rows carry a server-formatted oldTime
   * instead. An appointment move sets appointmentTitle; a manager moving the
   * task by hand (O20) sets movedBy instead. Read by ../LINARA_MOBILE too.
   */
  reschedule_notice: {
    oldStartIso?: string;
    oldTime?: string;
    oldDate?: string;
    appointmentTitle?: string;
    movedBy?: string;
  } | null;
  scheduled_start: string;
  actual_start: string | null;
  actual_end: string | null;
  created_by: string | null;
  created_by_profile: { full_name: string } | null;
  /** From add-cancelled-tasks.sql; absent before it is applied. */
  cancelled_at?: string | null;
  cancelled_by_name?: string | null;
  /** How long, in minutes (add-task-length-and-leave-unassign.sql); absent before it. */
  duration_minutes?: number | null;
  /** A trip's ends (add-shared-staff-and-places.sql); absent before it is applied. */
  from_household_id?: string | null;
  from_place_id?: string | null;
  to_household_id?: string | null;
  to_place_id?: string | null;
  /** The day a repeating task is for (add-repeating-tasks.sql); absent before it. */
  occurrence_date?: string | null;
}

/**
 * Closes KNOWN_GAPS.md gap #13: `tickets.photo_evidence_url` stores the
 * signed URL LINARA_MOBILE's uploadEvidenceImage() returned at upload time,
 * which expires 15 minutes later. Re-signs it, and its thumbnail, fresh from
 * its embedded storage path on every read instead, in one batch call. A photo
 * that can't be signed (deleted after 30 days, or not one of ours) comes back
 * as no photo rather than a broken image.
 */
async function withSignedPhotos<T extends { photo_evidence_url: string | null }>(
  authedClient: ReturnType<typeof createAuthedClient>,
  rows: T[],
): Promise<(T & { photo_thumb_url: string | null })[]> {
  const paths = rows.map((row) =>
    row.photo_evidence_url ? extractHouseholdEvidencePath(row.photo_evidence_url) : null,
  );
  const signed = await signEvidencePhotos(
    authedClient,
    paths.filter((p): p is string => p !== null),
  );
  return rows.map((row, i) => {
    const photo = paths[i] ? signed.get(paths[i]) : undefined;
    return {
      ...row,
      photo_evidence_url: photo?.url ?? null,
      photo_thumb_url: photo?.thumbUrl ?? null,
    };
  });
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
      // Cancelled tasks are for the planner's record, not the board.
      .neq("status", "cancelled")
      .order("scheduled_start", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (await withSignedPhotos(authedClient, rows ?? [])) as unknown as TicketRow[];
  });

/**
 * Every ticket scheduled in [fromIso, toIso), whatever its status -- the
 * planner's week or month. Unlike listTicketsFn this includes finished tasks
 * from earlier days, so a past day still shows what happened on it.
 *
 * Evidence photos are re-signed in one batch call (a month can hold many).
 * They used to be blanked here, so a task finished with a photo showed none
 * on Schedule or in its Edit dialog (client feedback, 2026-10-02).
 */
export const listTicketsBetweenFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; fromIso: string; toIso: string }) => data)
  .handler(async ({ data }) => {
    const { token, fromIso, toIso } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error } = await authedClient
      .from("tickets")
      .select("*, created_by_profile:user_profiles(full_name)")
      .gte("scheduled_start", fromIso)
      .lt("scheduled_start", toIso)
      .order("scheduled_start", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (await withSignedPhotos(authedClient, rows ?? [])) as unknown as TicketRow[];
  });

/**
 * Tasks on any date whose title or note contains `query`, newest first, for
 * the Schedule's search (KNOWN_GAPS.md O32: finding an old task). `helper` is
 * "all", "unassigned" or a helper id; `helperIds`, when given, narrows "all"
 * to those people (one team); `statuses` narrows to those (empty: any).
 * Cancelled ones are included, as the planner shows them.
 */
export const searchTicketsFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      query: string;
      helper: string;
      helperIds?: string[];
      statuses: Status[];
    }) => data,
  )
  .handler(async ({ data }) => {
    // PostgREST's or() is comma- and paren-delimited, and * and % are
    // wildcards: searching for any of those means nothing here, so drop them.
    const words = data.query
      .replace(/[,()"\\%_*.:]/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    if (words.length < 2) return [] as TicketRow[];

    const authedClient = createAuthedClient(data.token);
    let request = authedClient
      .from("tickets")
      .select("*, created_by_profile:user_profiles(full_name)")
      .or(`title.ilike.*${words}*,notes.ilike.*${words}*`)
      .order("scheduled_start", { ascending: false })
      .limit(TASK_SEARCH_LIMIT);
    if (data.helper === "unassigned") request = request.is("helper_id", null);
    else if (data.helper !== "all") request = request.eq("helper_id", data.helper);
    else if (data.helperIds) request = request.in("helper_id", data.helperIds);
    if (data.statuses.length > 0) request = request.in("status", data.statuses);

    const { data: rows, error } = await request;
    if (error) {
      throw new Error(error.message);
    }

    return (await withSignedPhotos(authedClient, rows ?? [])) as unknown as TicketRow[];
  });

/**
 * A helper's unfinished tasks scheduled in [fromIso, toIso): what a leave over
 * those days would leave without anyone (LEAVE_PLAN.md step 4).
 */
export const countOpenTasksBetweenFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string; fromIso: string; toIso: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { count, error } = await client
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("helper_id", data.helperId)
      .not("status", "in", "(done,cancelled)")
      .gte("scheduled_start", data.fromIso)
      .lt("scheduled_start", data.toIso);
    if (error) throw new Error(error.message);
    return count ?? 0;
  });

/**
 * Moves those same tasks to Unassigned, so they're on the managers' board to
 * hand to someone else instead of on the phone of someone who's away. Their
 * time stays as it was. Returns how many moved.
 */
export const unassignOpenTasksBetweenFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string; fromIso: string; toIso: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { data: rows, error } = await client
      .from("tickets")
      // A notice about her schedule means nothing once the task isn't hers.
      .update({ helper_id: null, reschedule_notice: null })
      .eq("helper_id", data.helperId)
      .not("status", "in", "(done,cancelled)")
      .gte("scheduled_start", data.fromIso)
      .lt("scheduled_start", data.toIso)
      .select("id");
    if (error) throw new Error(error.message);
    return rows?.length ?? 0;
  });

/**
 * Leave clears her open tasks on those days in every house she works in, not
 * just this one (add-task-length-and-leave-unassign.sql): the other houses'
 * tasks get a comment saying why. Null before that SQL is applied (the
 * caller then falls back to unassignOpenTasksBetweenFn, this house only).
 */
export const unassignForLeaveFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; helperId: string; startDate: string; endDate: string }) => data,
  )
  .handler(
    async ({
      data,
    }): Promise<{ here: number; elsewhere: { name: string; moved: number }[] } | null> => {
      const client = createAuthedClient(data.token);
      const [{ data: rows, error }, { data: me }] = await Promise.all([
        client.rpc("unassign_tasks_for_leave", {
          p_helper_id: data.helperId,
          p_from: data.startDate,
          p_to: data.endDate,
        }),
        client.rpc("current_household_id"),
      ]);
      if (error?.code === "PGRST202" || /could not find the function/i.test(error?.message ?? "")) {
        return null;
      }
      if (error) throw new Error(error.message);
      const list = (rows ?? []) as {
        household_id: string;
        household_name: string;
        moved: number;
      }[];
      return {
        here: list.filter((r) => r.household_id === me).reduce((s, r) => s + r.moved, 0),
        elsewhere: list
          .filter((r) => r.household_id !== me)
          .map((r) => ({ name: r.household_name, moved: r.moved })),
      };
    },
  );

/** Creates one ticket -- addTask, and a new routine's first task. */
export const insertTicketFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      title: string;
      notes?: string;
      /** null = Unassigned. */
      helperId: string | null;
      scheduledStartIso: string;
      photoEvidenceUrl?: string;
      isAfterHours?: boolean;
      emergency?: boolean;
      suggested?: boolean;
      queued?: boolean;
      queuedForShift?: boolean;
      recurrence?: string[] | null;
      routineId?: string;
      /** A trip's ends; only sent when set, so a plain task still saves before the migration. */
      from?: PlaceRef | null;
      to?: PlaceRef | null;
      /** Only sent when set, for the same reason. */
      durationMinutes?: number | null;
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
      .select("household_id, full_name")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Unauthorized: Profile not found");
    }

    // A repeating task is the first of its series, which is named by its id
    // (KNOWN_GAPS.md O43). add-repeating-tasks.sql's trigger does the same.
    const repeats = !!recurrence && recurrence.length > 0;
    const id = repeats && !routineId ? crypto.randomUUID() : undefined;

    const { data: row, error } = await authedClient
      .from("tickets")
      .insert({
        ...(id ? { id } : {}),
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
        routine_id: routineId ?? id ?? null,
        ...tripColumns(data.from, data.to),
        ...(data.durationMinutes ? { duration_minutes: data.durationMinutes } : {}),
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !row) {
      throw new Error(error?.message || "Failed to create task");
    }

    // Overridden or emergency task for a helper who is off: the manager chose to
    // reach her. A queued, waiting or suggested task stays silent.
    if (helperId && isAfterHours && !queuedForShift && !queued && !suggested) {
      const from = profile.full_name ? ` mula kay ${profile.full_name}` : "";
      await pushToHelper(authedClient, helperId, {
        title: emergency ? `Emergency task${from}` : `Bagong task${from}`,
        body: title,
        url: "/today",
        urgent: true,
      });
    }

    return { id: row.id as string };
  });

// --------------------------------------------------------------------------
// Repeating tasks (KNOWN_GAPS.md O43, supabase/add-repeating-tasks.sql): a
// series of tickets named by routine_id, the id of its first task. See
// routine.utils.ts for how a series is read.
// --------------------------------------------------------------------------

/** The function or column isn't there yet: add-repeating-tasks.sql isn't applied. */
const isMissing = (error: { code?: string; message?: string } | null) =>
  !!error &&
  (error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    /does not exist|could not find/i.test(error.message ?? ""));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Makes today's task for every repeating task due today in the caller's
 * household, once however often it's asked (spawn_routine_tasks). Null when
 * add-repeating-tasks.sql isn't applied: the caller then makes them itself
 * (insertRoutineTasksFn).
 */
export const spawnRoutineTasksFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<{ spawned: number } | null> => {
    const client = createAuthedClient(data.token);
    const { data: spawned, error } = await client.rpc("spawn_routine_tasks");
    if (isMissing(error)) return null;
    if (error) throw new Error(error.message);
    return { spawned: (spawned as number | null) ?? 0 };
  });

/**
 * Every task that repeats, scheduled on or after `sinceIso`: what the
 * Routines list and the planner's copies are read from. A series that's still
 * going has a task at least weekly, so a few weeks back is plenty.
 */
export const listRepeatingTicketsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; sinceIso: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { data: rows, error } = await client
      .from("tickets")
      // "*": occurrence_date only exists once the SQL is applied.
      .select("*")
      .not("recurrence", "is", null)
      .gte("scheduled_start", data.sinceIso)
      .order("scheduled_start", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as TicketRow[];
  });

/** One series' task for one day, as the web makes it before the SQL is applied. */
export type RoutineTaskInsert = {
  series: string;
  dayIso: string;
  title: string;
  notes?: string;
  helperId: string | null;
  scheduledStartIso: string;
  recurrence: string[];
  durationMinutes?: number;
  from?: PlaceRef;
  to?: PlaceRef;
};

/**
 * The web's stand-in for spawn_routine_tasks until add-repeating-tasks.sql is
 * applied. Each task's id comes from its series and day (occurrenceId), so a
 * second tab, or a reload, making the same one is refused by the primary key
 * and counted as already there rather than doubled. Returns how many it made.
 */
export const insertRoutineTasksFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; tasks: RoutineTaskInsert[] }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized: Invalid token");
    const { data: profile, error: profileError } = await client
      .from("user_profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();
    if (profileError || !profile) throw new Error("Unauthorized: Profile not found");

    const made = await Promise.all(
      data.tasks.map(async (t) => {
        const { error } = await client.from("tickets").insert({
          id: await occurrenceId(t.series, t.dayIso),
          household_id: profile.household_id,
          title: t.title,
          notes: t.notes ?? null,
          helper_id: t.helperId,
          scheduled_start: t.scheduledStartIso,
          recurrence: t.recurrence,
          routine_id: t.series,
          ...tripColumns(t.from, t.to),
          ...(t.durationMinutes ? { duration_minutes: t.durationMinutes } : {}),
          created_by: user.id,
        });
        if (!error) return 1;
        // Already made, by another tab or an earlier load.
        if (error.code === "23505") return 0;
        console.error(`[insertRoutineTasksFn] "${t.title}" on ${t.dayIso}:`, error.message);
        return 0;
      }),
    );
    return { spawned: made.reduce<number>((n, x) => n + x, 0) };
  });

/**
 * Stops a repeating task: no task of its series repeats any more, so nothing
 * is made after them. Tasks already made stay as they are. Returns how many
 * tasks it changed.
 */
export const stopRepeatFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; routineId: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const request = client.from("tickets").update({ recurrence: null });
    // A series from before routine_id was set is named by its first task's id.
    const { data: rows, error } = await (
      UUID_RE.test(data.routineId)
        ? request.or(`routine_id.eq.${data.routineId},id.eq.${data.routineId}`)
        : request.eq("routine_id", data.routineId)
    ).select("id");
    if (error) throw new Error(error.message);
    return rows?.length ?? 0;
  });

export interface TicketPatch {
  status?: Status;
  photoEvidenceUrl?: string | null;
  blockReason?: string | null;
  queued?: boolean;
  suggested?: boolean;
  actualStart?: string | null;
  scheduledStartIso?: string;
  title?: string;
  notes?: string | null;
  /** Assign, reassign, or (null) unassign. */
  helperId?: string | null;
  /** A trip's ends; null clears one, undefined leaves it. */
  from?: PlaceRef | null;
  to?: PlaceRef | null;
  /** How long; null clears it, undefined leaves it. */
  durationMinutes?: number | null;
}

/** The columns for a trip's ends that were given (undefined: leave them). */
function tripColumns(
  from: PlaceRef | null | undefined,
  to: PlaceRef | null | undefined,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (from !== undefined) {
    const c = placeColumns(from);
    out.from_household_id = c.household;
    out.from_place_id = c.place;
  }
  if (to !== undefined) {
    const c = placeColumns(to);
    out.to_household_id = c.household;
    out.to_place_id = c.place;
  }
  return out;
}

/** Covers updateStatus/blockTask/rescheduleTask/approveSuggestion -- all of
 * them are just a patch onto one ticket row. */
export const updateTicketFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      ticketId: string;
      patch: TicketPatch;
      /** Whoever has the task after this is reachable now (statusFor != off), so a move may ping her. */
      notifyHelper?: boolean;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { token, ticketId, patch, notifyHelper } = data;

    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.photoEvidenceUrl !== undefined) dbPatch.photo_evidence_url = patch.photoEvidenceUrl;
    if (patch.blockReason !== undefined) dbPatch.block_reason = patch.blockReason;
    if (patch.queued !== undefined) dbPatch.queued = patch.queued;
    if (patch.suggested !== undefined) dbPatch.suggested = patch.suggested;
    if (patch.actualStart !== undefined) dbPatch.actual_start = patch.actualStart;
    if (patch.scheduledStartIso !== undefined) dbPatch.scheduled_start = patch.scheduledStartIso;
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    if (patch.helperId !== undefined) dbPatch.helper_id = patch.helperId;
    Object.assign(dbPatch, tripColumns(patch.from, patch.to));
    if (patch.durationMinutes !== undefined) dbPatch.duration_minutes = patch.durationMinutes;

    const authedClient = createAuthedClient(token);

    // A finished task is the record of what she did: its title, assignee,
    // time and note stay as they were (client feedback, 2026-10-02). Status
    // changes still go through, so a mis-ticked Done can be undone.
    const editsRecord =
      patch.title !== undefined ||
      patch.notes !== undefined ||
      patch.helperId !== undefined ||
      patch.scheduledStartIso !== undefined ||
      patch.durationMinutes !== undefined;
    if (editsRecord && patch.status === undefined) {
      const { data: current } = await authedClient
        .from("tickets")
        .select("status")
        .eq("id", ticketId)
        .single();
      if (current?.status === "done") {
        throw new Error("A finished task can't be changed.");
      }
    }

    // A change of time or hands is never silent on her side (plan.md 2.2,
    // KNOWN_GAPS O20): the same notice an appointment move writes, which her
    // app shows as "Inilipat" and in Today's "May binago sa schedule mo".
    const change =
      patch.scheduledStartIso !== undefined || patch.helperId !== undefined
        ? await scheduleChange(authedClient, ticketId, patch)
        : null;
    if (change?.moved) {
      dbPatch.reschedule_notice = { oldStartIso: change.oldStartIso, movedBy: change.movedBy };
    } else if (change?.handedOver) {
      // A notice about someone else's schedule means nothing to the new assignee.
      dbPatch.reschedule_notice = null;
    }

    const { error } = await authedClient.from("tickets").update(dbPatch).eq("id", ticketId);

    if (error) {
      throw new Error(error.message);
    }

    if (patch.status === "cancelled" && notifyHelper) {
      const { data: cancelled } = await authedClient
        .from("tickets")
        .select("title, helper_id")
        .eq("id", ticketId)
        .single();
      if (cancelled?.helper_id) {
        await pushToHelper(authedClient, cancelled.helper_id as string, {
          title: "Kinansela ang task",
          body: cancelled.title as string,
          url: "/week",
        });
      }
    }

    if (change && notifyHelper && change.helperId && (change.moved || change.handedOver)) {
      const from = change.movedBy ? ` mula kay ${change.movedBy}` : "";
      await pushToHelper(
        authedClient,
        change.helperId,
        change.handedOver
          ? { title: `Bagong task${from}`, body: change.title, url: "/week" }
          : { title: "Inilipat ang task", body: `${change.title}: binago ang oras.`, url: "/week" },
      );
    }

    return { ticketId };
  });

/**
 * What a patch does to a ticket's schedule: moved in time for the same
 * helper, or handed to someone else. Done tasks and Unassigned ones concern
 * no helper's day, so they're neither.
 */
export async function scheduleChange(
  client: ReturnType<typeof createAuthedClient>,
  ticketId: string,
  patch: TicketPatch,
) {
  const { data: row, error } = await client
    .from("tickets")
    .select("title, status, helper_id, scheduled_start")
    .eq("id", ticketId)
    .single();
  if (error || !row) return null;

  const helperId: string | null = patch.helperId !== undefined ? patch.helperId : row.helper_id;
  const live = row.status !== "done" && row.status !== "cancelled" && helperId !== null;
  const handedOver = live && helperId !== row.helper_id;
  const moved =
    live &&
    !handedOver &&
    patch.scheduledStartIso !== undefined &&
    new Date(patch.scheduledStartIso).getTime() !== new Date(row.scheduled_start).getTime();
  if (!moved && !handedOver) return null;

  const {
    data: { user },
  } = await client.auth.getUser();
  const { data: me } = user
    ? await client.from("user_profiles").select("full_name").eq("id", user.id).single()
    : { data: null };

  return {
    title: row.title as string,
    helperId,
    moved,
    handedOver,
    oldStartIso: new Date(row.scheduled_start).toISOString(),
    movedBy: (me?.full_name as string | null | undefined) ?? undefined,
  };
}

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
 *
 * Also returns `householdToday` (Session B): C32 returned only the server
 * INSTANT, and the caller then rendered it to a calendar day with `toISODate`
 * in the BROWSER's timezone -- so a device with a correct clock but a
 * misconfigured timezone still derived the wrong day from a correct answer,
 * leaving the cross-check only partly server-authoritative. `household_today()`
 * resolves the day in `households.timezone` server side, so there is nothing
 * left for the client to get wrong. `serverNowIso` is kept for the
 * plausibility-gap arithmetic, which needs an instant, not a day.
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

    const { data: householdToday, error: todayError } = await authedClient.rpc("household_today");

    if (todayError || !householdToday) {
      throw new Error(todayError?.message || "Failed to read the household's civil date");
    }

    return {
      serverNowIso: serverNow as string,
      householdToday: householdToday as string,
    };
  });

// --------------------------------------------------------------------------
// Updates on a task (supabase/add-ticket-comments.sql): a thread the
// household's managers and the assigned helper both read and add to. RLS
// decides who sees what; the author is stamped by the database.
// --------------------------------------------------------------------------

export interface TicketComment {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

interface TicketCommentRow {
  id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
  edited_at: string | null;
}

const toComment = (row: TicketCommentRow): TicketComment => ({
  id: row.id,
  authorId: row.author_id,
  authorName: row.author_name,
  body: row.body,
  createdAt: row.created_at,
  editedAt: row.edited_at,
});

/** A task's updates, oldest first. Empty before the migration is applied. */
export const listTicketCommentsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; ticketId: string }) => data)
  .handler(async ({ data }) => {
    const authedClient = createAuthedClient(data.token);
    const { data: rows, error } = await authedClient
      .from("ticket_comments")
      .select("id, author_id, author_name, body, created_at, edited_at")
      .eq("ticket_id", data.ticketId)
      .order("created_at", { ascending: true });
    if (error) {
      if (/ticket_comments/.test(error.message)) return [];
      throw new Error(error.message);
    }
    return ((rows ?? []) as TicketCommentRow[]).map(toComment);
  });

export interface CommentActivity {
  count: number;
  lastAt: string;
  lastAuthorId: string | null;
}

/** How many days back the card badges look. Older threads still open in full. */
const COMMENT_ACTIVITY_DAYS = 60;

/**
 * Per task: how many updates, and who wrote the latest, for the badges on
 * task cards. RLS already limits it to the threads this user can see.
 */
export const listCommentActivityFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const authedClient = createAuthedClient(data.token);
    const since = new Date(Date.now() - COMMENT_ACTIVITY_DAYS * 86_400_000).toISOString();
    const { data: rows, error } = await authedClient
      .from("ticket_comments")
      .select("ticket_id, author_id, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true });
    if (error) {
      if (/ticket_comments/.test(error.message)) return {};
      throw new Error(error.message);
    }
    const activity: Record<string, CommentActivity> = {};
    for (const row of (rows ?? []) as {
      ticket_id: string;
      author_id: string | null;
      created_at: string;
    }[]) {
      const prev = activity[row.ticket_id];
      activity[row.ticket_id] = {
        count: (prev?.count ?? 0) + 1,
        lastAt: row.created_at,
        lastAuthorId: row.author_id,
      };
    }
    return activity;
  });

export const addTicketCommentFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; ticketId: string; body: string }) => data)
  .handler(async ({ data }) => {
    const body = data.body.trim();
    if (!body) throw new Error("Write something first.");
    const authedClient = createAuthedClient(data.token);
    const { data: row, error } = await authedClient
      .from("ticket_comments")
      .insert({ ticket_id: data.ticketId, body })
      .select("id, author_id, author_name, body, created_at, edited_at")
      .single();
    if (error || !row) {
      throw new Error(error?.message || "Couldn't post the update.");
    }
    return toComment(row as TicketCommentRow);
  });

/** Only the author's own: RLS refuses anyone else's quietly (0 rows). */
export const deleteTicketCommentFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; commentId: string }) => data)
  .handler(async ({ data }) => {
    const authedClient = createAuthedClient(data.token);
    const { error } = await authedClient.from("ticket_comments").delete().eq("id", data.commentId);
    if (error) throw new Error(error.message);
    return { commentId: data.commentId };
  });
