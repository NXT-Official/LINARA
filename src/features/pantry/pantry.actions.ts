import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

// --------------------------------------------------------------------------
// Pantry stock levels (`pantry_items`) -- closes KNOWN_GAPS.md gap C23.
// Same "curate real household state, no role gating beyond auth" posture as
// grocery.actions.ts -- plan.md 2.5 has the Cook (a helper) updating stock
// directly, so this isn't manager-only.
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

/** Adds a new stock item. */
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

/** Sets a stock item's quantity -- used for both the +/- steppers and direct edits. */
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

/** Removes a stock item. */
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
