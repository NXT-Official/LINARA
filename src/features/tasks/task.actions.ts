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
