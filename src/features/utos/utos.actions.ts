import { createServerFn } from "@tanstack/react-start";

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
