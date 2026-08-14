import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RouteUtosRequest {
  prompt: string;
  helperId: string;
  helperStatus: "on_shift" | "available" | "off";
  senderType?: "manager" | "helper";
}

// Local mock classifier for offline prototype robustness
function parseMockUtos(
  prompt: string,
  helperId: string,
  helperStatus: string,
  senderType: string = "manager",
) {
  const query = prompt.toLowerCase();
  let classification = "QUICK_UTO";
  let contentCleaned = prompt.trim();
  let suggestedStation = "House";
  let boundaryWarn = helperStatus === "off";

  // Rule 1: Repetitive daily/weekly -> ROUTINE
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
  // Rule 2: Helper-authored notes -> PRIVATE_NOTE
  else if (
    senderType === "helper" ||
    query.includes("remind myself") ||
    query.includes("list down") ||
    query.includes("isulat")
  ) {
    classification = "PRIVATE_NOTE";
    contentCleaned = prompt.replace(/(remind myself to|isulat ang|list down)/gi, "").trim();
    suggestedStation = "House";
    boundaryWarn = false; // Internal reminders do not warn boundaries
  }
  // Rule 3: Heavy tasks with duration tracking / photo completions -> TASK
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
  // Rule 4: Transient, immediate actions -> QUICK_UTO
  else {
    classification = "QUICK_UTO";
    contentCleaned = prompt.replace(/(please|paki|paki-)/gi, "").trim();
    // Normalize content (e.g. "please get more water" -> "Get more water")
    if (query.includes("get more water") || query.includes("kumuha ng tubig")) {
      contentCleaned = "Get more water";
    }

    // Assign station
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

  // Capitalize first letter of content cleaned
  if (contentCleaned.length > 0) {
    contentCleaned = contentCleaned.charAt(0).toUpperCase() + contentCleaned.slice(1);
  }

  return {
    classification,
    contentCleaned,
    suggestedStation,
    boundaryWarn,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { prompt, helperId, helperStatus, senderType }: RouteUtosRequest = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
      return new Response(JSON.stringify({ error: "Missing or invalid prompt parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const useMockAI = Deno.env.get("USE_MOCK_AI") === "true";
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("UTOS_ROUTER_MODEL") || "gpt-4o-mini";

    if (useMockAI || !apiKey) {
      console.log(
        `[route-utos] Returning mock response. Reason: useMockAI=${useMockAI}, apiKeyPresent=${!!apiKey}`,
      );
      const mockResult = parseMockUtos(prompt, helperId, helperStatus, senderType);
      return new Response(JSON.stringify(mockResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[route-utos] Initiating live LLM request with model ${model}`);

    const systemPrompt = `You are the Linara Context Router. Your role is to analyze transient household requests and categorize them to prevent task bloat, protecting the helper's focus while enabling rapid entry.

Classification Logic:
- ROUTINE: If the text describes a highly repetitive, systematic daily/weekly chore (e.g. "laundry every Monday", "feed the baby formula at 2pm").
- TASK: If the request is a substantial one-off job that requires duration tracking, a photo completion standard, or structural visibility (e.g. "clean the whole kitchen fridge today", "renew SSS registration details").
- QUICK_UTO: If the request is a trivial, immediate micro-action requiring zero friction and no completion photo (e.g. "bring water to the bedroom", "add more rice", "please lock the front gate").
- PRIVATE_NOTE: If the author of the request is the HELPER themselves (indicated by senderType === "helper"), and the context suggests an internal reminder or private notes (e.g. "remind myself to ask Sir for baking powder", "list down cleaning soap").

Rules of execution:
1. Clean the text content: remove conversational fillers and polite prefixes (like "please", "paki", "can you please"). Capitalize the first letter.
2. Suggest the correct recipient station: "Yaya", "Cook", "Laundry", "Driver", or "House".
3. Check the recipient helper availability status. If helperStatus === "off" and the classification is QUICK_UTO or TASK, set boundaryWarn: true. Otherwise, set boundaryWarn: false.`;

    const userPrompt = `Classify and normalize this request:
Prompt: "${prompt}"
Helper ID: "${helperId}"
Helper Status: "${helperStatus}"
Sender Type: "${senderType || "manager"}"`;

    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "utos_routing",
            strict: true,
            schema: {
              type: "object",
              properties: {
                classification: {
                  type: "string",
                  enum: ["ROUTINE", "TASK", "QUICK_UTO", "PRIVATE_NOTE"],
                },
                contentCleaned: { type: "string" },
                suggestedStation: {
                  type: "string",
                  enum: ["Yaya", "Cook", "Laundry", "Driver", "House"],
                },
                boundaryWarn: { type: "boolean" },
              },
              required: ["classification", "contentCleaned", "suggestedStation", "boundaryWarn"],
              additionalProperties: false,
            },
          },
        },
        temperature: 0.1,
      }),
    });

    if (!openAIResponse.ok) {
      const errorBody = await openAIResponse.text();
      console.error("[route-utos] OpenAI API error:", errorBody);
      throw new Error(`OpenAI API returned status ${openAIResponse.status}`);
    }

    const openAIData = await openAIResponse.json();
    const resultString = openAIData.choices?.[0]?.message?.content;

    if (!resultString) {
      throw new Error("No structured completion returned from OpenAI");
    }

    const parsedResult = JSON.parse(resultString);
    return new Response(JSON.stringify(parsedResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[route-utos] Fatal error processing request:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
