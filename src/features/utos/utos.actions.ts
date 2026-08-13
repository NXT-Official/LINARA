import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

export interface QuickUtosRow {
  id: string;
  sender_name: string;
  recipient_id: string;
  content: string;
  ack_state: "sent" | "seen" | "done";
  after_hours: boolean;
  emergency: boolean;
  waiting: boolean;
  created_at: string;
}

/**
 * Lists the recipient's quick utos. Scoped by `quick_utos_isolation`'s join
 * through helper_profiles (KNOWN_GAPS.md gap #6) -- explicitly filtered to
 * one recipient_id too, since a household can have more than one helper and
 * this app only ever tracks the current device's helper.
 */
export const listUtosFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string }) => data)
  .handler(async ({ data }) => {
    const { token, helperId } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error } = await authedClient
      .from("quick_utos")
      .select("*")
      .eq("recipient_id", helperId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (rows ?? []) as QuickUtosRow[];
  });

/** Sends a quick utos to a helper. */
export const insertUtoFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      helperId: string;
      senderName: string;
      content: string;
      afterHours?: boolean;
      emergency?: boolean;
      waiting?: boolean;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { token, helperId, senderName, content, afterHours, emergency, waiting } = data;

    const authedClient = createAuthedClient(token);
    const { data: row, error } = await authedClient
      .from("quick_utos")
      .insert({
        recipient_id: helperId,
        sender_name: senderName,
        content,
        after_hours: !!afterHours,
        emergency: !!emergency,
        waiting: !!waiting,
      })
      .select("id")
      .single();

    if (error || !row) {
      throw new Error(error?.message || "Failed to send quick utos");
    }

    return { id: row.id as string };
  });

/** Acknowledges a quick utos (helper taps "Seen" / "Done"). */
export const ackUtoFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; utoId: string; state: "seen" | "done" }) => data)
  .handler(async ({ data }) => {
    const { token, utoId, state } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient
      .from("quick_utos")
      .update({ ack_state: state })
      .eq("id", utoId);

    if (error) {
      throw new Error(error.message);
    }

    return { utoId };
  });

/**
 * Wipes a helper's quick utos for a new day. `QuickUtos` is documented as
 * "deliberately ephemeral" (utos.types.ts) -- this is a real delete, not a
 * soft-clear, matching that intent.
 */
export const clearUtosForHelperFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string }) => data)
  .handler(async ({ data }) => {
    const { token, helperId } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient.from("quick_utos").delete().eq("recipient_id", helperId);

    if (error) {
      throw new Error(error.message);
    }

    return { helperId };
  });

export interface ParsedUtos {
  classification: "ROUTINE" | "TASK" | "QUICK_UTO" | "PRIVATE_NOTE";
  contentCleaned: string;
  suggestedStation: "Yaya" | "Cook" | "Laundry" | "Driver" | "House";
  boundaryWarn: boolean;
}

/**
 * Server function to route and classify transient household requests (utos/notes).
 * Proxies to Supabase route-utos Edge Function or executes local mock classification.
 */
export const routeUtosFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      prompt: string;
      helperId: string;
      helperStatus: "on_shift" | "available" | "off";
      senderType?: "manager" | "helper";
    }) => data,
  )
  .handler(async ({ data }) => {
    const { prompt, helperId, helperStatus, senderType = "manager" } = data;
    const useMock = process.env.USE_MOCK_AI === "true" || !process.env.SUPABASE_URL;

    if (useMock) {
      console.log(
        `[ServerAction:routeUtosFn] Performing local mock classification for: "${prompt}"`,
      );
      // Simulate small server-side network delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      const query = prompt.toLowerCase();
      let classification: ParsedUtos["classification"] = "QUICK_UTO";
      let contentCleaned = prompt.trim();
      let suggestedStation: ParsedUtos["suggestedStation"] = "House";
      const boundaryWarn = helperStatus === "off";

      // 1. Repetitive daily/weekly -> ROUTINE
      if (
        query.includes("every") ||
        query.includes("tuwing") ||
        query.includes("araw-araw") ||
        query.includes("daily")
      ) {
        classification = "ROUTINE";
        contentCleaned = prompt.replace(/(please|paki|paki-)/gi, "").trim();
        if (query.includes("laundry") || query.includes("laba")) {
          suggestedStation = "Laundry";
        } else if (query.includes("luto") || query.includes("cook")) {
          suggestedStation = "Cook";
        } else if (query.includes("drive") || query.includes("sundo")) {
          suggestedStation = "Driver";
        } else {
          suggestedStation = "Yaya";
        }
      }
      // 2. Helper-authored notes -> PRIVATE_NOTE
      else if (
        senderType === "helper" ||
        query.includes("remind myself") ||
        query.includes("list down") ||
        query.includes("isulat")
      ) {
        classification = "PRIVATE_NOTE";
        contentCleaned = prompt.replace(/(remind myself to|isulat ang|list down)/gi, "").trim();
        suggestedStation = "House";
      }
      // 3. Heavy tasks with duration tracking / photo completions -> TASK
      else if (
        query.includes("clean the whole") ||
        query.includes("linisin ang buong") ||
        query.includes("renew") ||
        query.includes("paint")
      ) {
        classification = "TASK";
        contentCleaned = prompt.replace(/(please|paki|paki-)/gi, "").trim();
        suggestedStation = "House";
      }
      // 4. Transient, immediate actions -> QUICK_UTO
      else {
        classification = "QUICK_UTO";
        contentCleaned = prompt.replace(/(please|paki|paki-)/gi, "").trim();
        if (query.includes("get more water") || query.includes("kumuha ng tubig")) {
          contentCleaned = "Get more water";
        }

        if (query.includes("laba") || query.includes("laundry")) {
          suggestedStation = "Laundry";
        } else if (query.includes("luto") || query.includes("cook") || query.includes("pantry")) {
          suggestedStation = "Cook";
        } else if (query.includes("sundo") || query.includes("drive")) {
          suggestedStation = "Driver";
        } else {
          suggestedStation = "Yaya";
        }
      }

      if (contentCleaned.length > 0) {
        contentCleaned = contentCleaned.charAt(0).toUpperCase() + contentCleaned.slice(1);
      }

      return {
        classification,
        contentCleaned,
        suggestedStation,
        boundaryWarn: classification === "PRIVATE_NOTE" ? false : boundaryWarn,
      };
    }

    const url = `${process.env.SUPABASE_URL}/functions/v1/route-utos`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ prompt, helperId, helperStatus, senderType }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function returned error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return result as ParsedUtos;
  });
