import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

// --------------------------------------------------------------------------
// Pantry stock levels (`pantry_items`) -- closes KNOWN_GAPS.md Open Gap #23.
// `pantry_items` was already part of the original Story_3 core schema (see
// architecture.md Section 8, item 8) with household-scoped RLS
// (`pantry_items_isolation`) already live -- this file is purely the missing
// application layer, no migration needed. Mirrors grocery.actions.ts's shape
// exactly: no manager-only role check beyond what RLS already enforces,
// since stock-taking is "shared with the Cook" (see pantry-section.tsx's own
// copy), not a manager-sensitive action like wage or budget.
// --------------------------------------------------------------------------

export interface PantryItemRow {
  id: string;
  name: string;
  qty: number;
  unit: string;
  par: number;
  category: string;
  updated_at: string;
}

/** Lists every pantry item in the caller's household. */
export const listPantryItemsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const { token } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error } = await authedClient
      .from("pantry_items")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (rows ?? []) as PantryItemRow[];
  });

/** Adds a new pantry item, stocked at the given starting quantity/par. */
export const insertPantryItemFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      name: string;
      qty: number;
      unit: string;
      par: number;
      category: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { token, name, qty, unit, par, category } = data;

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
      .from("pantry_items")
      .insert({ household_id: profile.household_id, name, qty, unit, par, category })
      .select("id")
      .single();

    if (error || !row) {
      throw new Error(error?.message || "Failed to add pantry item");
    }

    return { id: row.id as string };
  });

/** Sets a pantry item's current quantity -- powers both the +/- adjust
 * buttons and the direct qty edit, which both resolve to an absolute qty
 * client-side before calling this (same "single mutator, callers compute
 * the delta" shape the old local-only mock already had). */
export const updatePantryItemQtyFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemId: string; qty: number }) => data)
  .handler(async ({ data }) => {
    const { token, itemId, qty } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient
      .from("pantry_items")
      .update({ qty, updated_at: new Date().toISOString() })
      .eq("id", itemId);

    if (error) {
      throw new Error(error.message);
    }

    return { itemId, qty };
  });

/** Removes a pantry item entirely. */
export const deletePantryItemFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemId: string }) => data)
  .handler(async ({ data }) => {
    const { token, itemId } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient.from("pantry_items").delete().eq("id", itemId);

    if (error) {
      throw new Error(error.message);
    }

    return { itemId };
  });
