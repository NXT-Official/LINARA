import { createServerFn } from "@tanstack/react-start";

import type { GroceryItem, GroceryReceipt } from "./grocery.types";

import { createAuthedClient } from "@/lib/supabase";
import {
  evidenceThumbPath,
  HOUSEHOLD_EVIDENCE_BUCKET,
  signEvidencePhotos,
} from "@/lib/evidence-photo";

// --------------------------------------------------------------------------
// Grocery list (`grocery_items`) -- closes the "spend dial reads real data"
// half of KNOWN_GAPS.md gap #2. Entering actual cost and attaching a receipt
// are mostly LINARA_MOBILE's job (it writes grocery_items and
// tickets.photo_evidence_url for real). From the web a manager curates the
// list (add/fix/remove planned items), and can tick an item bought and add
// the receipt, for when she did the shopping herself: the palengke is shared
// work (client feedback, 2026-10-02), and QA found no way to tick one here.
// --------------------------------------------------------------------------

export interface GroceryItemRow {
  id: string;
  name: string;
  qty: number;
  unit: string;
  pantry_item_id: string | null;
  bought: boolean;
  actual_cost: number | null;
  created_at: string;
  /** Absent before supabase/add-grocery-runs.sql. */
  run_id?: string | null;
  bought_at?: string | null;
}

export function toGroceryItem(row: GroceryItemRow): GroceryItem {
  return {
    id: row.id,
    name: row.name,
    qty: Number(row.qty),
    unit: row.unit,
    pantryItemId: row.pantry_item_id ?? undefined,
    bought: row.bought,
    costPHP: row.actual_cost === null ? undefined : Number(row.actual_cost),
    runId: row.run_id ?? undefined,
    boughtAt: row.bought_at ?? undefined,
  };
}

/** Adds a planned item to the pool, or straight onto a run (`runId`).
 * Always inserts unbought/uncosted. `pantryItemId` links it to the low
 * pantry item it restocks. */
export const insertGroceryItemFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      name: string;
      qty: number;
      unit: string;
      pantryItemId?: string;
      runId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { token, name, qty, unit, pantryItemId, runId } = data;

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
      .from("grocery_items")
      .insert({
        household_id: profile.household_id,
        name,
        qty,
        unit,
        pantry_item_id: pantryItemId ?? null,
        bought: false,
        // Only sent when there is one, so this works before add-grocery-runs.sql.
        ...(runId ? { run_id: runId } : {}),
      })
      .select("id")
      .single();

    if (error || !row) {
      throw new Error(error?.message || "Failed to add grocery item");
    }

    return { id: row.id as string };
  });

/** Fixes a planned item's name or amount. The UI only offers it before it's bought. */
export const updateGroceryItemFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; itemId: string; name: string; qty: number; unit: string }) => data,
  )
  .handler(async ({ data }) => {
    const { token, itemId, name, qty, unit } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient
      .from("grocery_items")
      .update({ name, qty, unit })
      .eq("id", itemId);

    if (error) {
      throw new Error(error.message);
    }

    return { itemId };
  });

/**
 * Ticks an item bought, or unticks a mis-tap. Same write as LINARA_MOBILE's
 * setGroceryItemBought: unticking clears the cost, and the database's
 * grocery_restock_pantry trigger moves the linked pantry count either way.
 */
export const setGroceryItemBoughtFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemId: string; bought: boolean }) => data)
  .handler(async ({ data }) => {
    const { token, itemId, bought } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient
      .from("grocery_items")
      .update(bought ? { bought } : { bought, actual_cost: null })
      .eq("id", itemId);

    if (error) {
      throw new Error(error.message);
    }

    return { itemId, bought };
  });

/** What a bought line cost; null clears it. */
export const setGroceryItemCostFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemId: string; cost: number | null }) => data)
  .handler(async ({ data }) => {
    const authedClient = createAuthedClient(data.token);
    const { error } = await authedClient
      .from("grocery_items")
      .update({ actual_cost: data.cost })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return { itemId: data.itemId };
  });

/** Removes a planned item. The web UI only ever calls this for `!bought`
 * items -- a manager curating the list, not erasing a helper's completed
 * purchase history. */
export const deleteGroceryItemFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; itemId: string }) => data)
  .handler(async ({ data }) => {
    const { token, itemId } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient.from("grocery_items").delete().eq("id", itemId);

    if (error) {
      throw new Error(error.message);
    }

    return { itemId };
  });

// --------------------------------------------------------------------------
// Petty-cash budget (`households.petty_cash_budget`) -- the other half of
// gap #2. One household-level default, manager-writable from here, read by
// both apps. See supabase/add-household-petty-cash-budget.sql.
// --------------------------------------------------------------------------

/** Sets the household's petty-cash allocation. Manager-only -- same role
 * check pattern as insertHouseSopFn/decideValeFn, since `households`' RLS
 * policy is household-scoped only (see the migration's comment for why a
 * plain policy is safe here, unlike household creation). */
export const updateHouseholdBudgetFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; budget: number }) => data)
  .handler(async ({ data }) => {
    const { token, budget } = data;

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

    // A remote admin too: plan.md 1.2, "usually the funding source"
    // (supabase/add-household-managers.sql lets the database agree).
    if (!["primary_manager", "co_manager", "remote_admin"].includes(profile.user_type)) {
      throw new Error("Forbidden: Only managers can set the petty-cash budget");
    }

    const { error } = await authedClient
      .from("households")
      .update({ petty_cash_budget: budget })
      .eq("id", profile.household_id);

    if (error) {
      throw new Error(error.message);
    }

    return { budget };
  });

export type GroceryReceiptRow = GroceryReceipt;

type ReceiptDbRow = {
  id: string;
  storage_path: string;
  created_at: string;
  run_id?: string | null;
  uploaded_by_profile: { full_name: string } | null;
};

/** Signs each receipt's photo and thumbnail; drops any whose photo is gone. */
export async function signReceipts(
  authedClient: ReturnType<typeof createAuthedClient>,
  rows: ReceiptDbRow[],
): Promise<GroceryReceipt[]> {
  const signed = await signEvidencePhotos(
    authedClient,
    rows.map((row) => row.storage_path),
  );
  return rows.flatMap((row) => {
    const photo = signed.get(row.storage_path);
    return photo
      ? [
          {
            id: row.id,
            url: photo.url,
            thumbUrl: photo.thumbUrl,
            createdAt: row.created_at,
            byName: row.uploaded_by_profile?.full_name ?? null,
            runId: row.run_id ?? null,
          },
        ]
      : [];
  });
}

/**
 * The household's latest palengke receipts (supabase/add-grocery-receipts.sql),
 * each with a fresh signed URL and thumbnail. Empty before that migration is
 * applied. Receipts older than 60 days are deleted, row and photo, by the
 * nightly purge (supabase/add-evidence-photo-retention.sql).
 */
export const listGroceryReceiptsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<GroceryReceiptRow[]> => {
    const authedClient = createAuthedClient(data.token);
    // `*` so run_id comes along once add-grocery-runs.sql adds it.
    const { data: rows, error } = await authedClient
      .from("grocery_receipts")
      .select("*, uploaded_by_profile:user_profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(6);

    // 42P01 / PGRST205: the table isn't there yet.
    if (error?.code === "42P01" || error?.code === "PGRST205") return [];
    if (error) throw new Error(error.message);

    return signReceipts(authedClient, (rows ?? []) as unknown as ReceiptDbRow[]);
  });

/** A shrunk receipt is about 150 to 300 KB; anything near this isn't one. */
const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;

function jpegBytes(base64: string): Uint8Array {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_RECEIPT_BYTES) {
    throw new Error("That photo is too large. Try another one.");
  }
  // Every JPEG starts FF D8 FF; shrinkPhoto only ever sends JPEG.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error("That file isn't a photo.");
  }
  return bytes;
}

/**
 * A receipt the manager took herself (KNOWN_GAPS.md O29). The browser
 * shrinks it first (src/lib/shrink-photo.ts, the same sizes as the app), and
 * it goes where the app puts one: "<household>/receipts/<ms>.jpg" plus its
 * .thumb.jpg, then a grocery_receipts row, so the nightly purge deletes it
 * after 60 days like any other. The thumbnail is best effort, as on the
 * phone; the list falls back to the full photo.
 */
export const addGroceryReceiptFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; photo: string; thumb: string; runId?: string }) => data)
  .handler(async ({ data }) => {
    const photo = jpegBytes(data.photo);

    const authedClient = createAuthedClient(data.token);
    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized: Invalid token");

    const { data: profile, error: profileError } = await authedClient
      .from("user_profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();
    if (profileError || !profile?.household_id) throw new Error("Unauthorized: Profile not found");

    const path = `${profile.household_id}/receipts/${Date.now()}.jpg`;
    const bucket = authedClient.storage.from(HOUSEHOLD_EVIDENCE_BUCKET);
    const { error: uploadError } = await bucket.upload(path, photo, {
      contentType: "image/jpeg",
    });
    if (uploadError) throw new Error(`Couldn't upload the receipt: ${uploadError.message}`);

    try {
      const { error } = await bucket.upload(evidenceThumbPath(path), jpegBytes(data.thumb), {
        contentType: "image/jpeg",
      });
      if (error) console.warn("[addGroceryReceiptFn] Thumbnail upload failed:", error.message);
    } catch (err) {
      console.warn("[addGroceryReceiptFn] Thumbnail failed:", (err as Error).message);
    }

    const { error: insertError } = await authedClient.from("grocery_receipts").insert({
      household_id: profile.household_id,
      storage_path: path,
      ...(data.runId ? { run_id: data.runId } : {}),
    });
    if (insertError) {
      // Don't leave a photo no row points at (the purge would get it in 60
      // days, but there's no reason to wait).
      await bucket.remove([path, evidenceThumbPath(path)]);
      throw new Error(insertError.message);
    }
    return { path };
  });
