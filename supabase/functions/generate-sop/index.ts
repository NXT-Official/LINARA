import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SOPRequest {
  prompt: string;
  station?: "Yaya" | "Cook" | "Laundry" | "Driver" | "House";
}

// Deterministic high-quality fallback generator for offline or mock mode
function generateMockSOP(prompt: string, requestedStation?: string) {
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
      station: "Yaya",
      steps: [
        "Hugasan ang mga kamay nang maigi at i-sterilize ang bote gamit ang steam sterilizer sa loob ng 10 minuto.",
        "Magpakulo ng malinis na tubig at hayaang lumamig hanggang sa maging maligamgam (warm).",
        "Maglagay ng eksaktong 4 scoops ng gatas para sa bawat 4 oz ng maligamgam na tubig.",
        "I-screw nang maigi ang takip at aluging mabuti hanggang matunaw ang powder nang walang buo-buo.",
        "I-ligpit ang milk container pabalik sa pantry at punasan ang counter.",
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
      station: "House",
      steps: [
        "Punuin ang watering can ng malinis at katamtamang lamig na tubig galing sa gripo.",
        "Dahan-dahang diligan ang base ng bawat halaman. Huwag basain nang labis ang gitna ng fiddle leaf.",
        "Gumamit ng basang cloth para punasan ang alikabok sa malalaking dahon.",
        "Tiyaking walang nakaimbak na tubig sa ilalim ng pot plate upang maiwasan ang lamok.",
      ],
      toolsRequired: ["Watering can", "Damp cotton cloth", "Sprayer bottle"],
      safetyProtocol:
        "Ensure the soil is completely dry 1 inch deep before watering to prevent root rot. Never leave stagnant water in the plant saucers.",
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
      station: "Laundry",
      steps: [
        "I-hiwalay ang puting damit sa mga may kulay (colored) para maiwasan ang kupas o discoloration.",
        "Suriin ang mga bulsa para sa mga barya, resibo, o tissue bago ilagay sa washing machine.",
        "Maglagay ng 1 cap ng banayad na detergent para sa katamtamang karga ng labada.",
        "Isampay nang maayos ang mga damit gamit ang hangers o ilatag ang mga delikadong tela sa patuyuan.",
      ],
      toolsRequired: ["Washing machine", "Mild liquid detergent", "Hangers", "Laundry baskets"],
      safetyProtocol:
        "Check fabric care labels first. Never put pure wool or silk garments into the high-heat tumble dryer.",
    };
  }

  // Generic prompt fallback complying strictly to the schema
  const station = requestedStation || "House";
  return {
    title: `House Standard: ${prompt.trim().slice(0, 40)}${prompt.length > 40 ? "..." : ""}`,
    description: `A warm, structured standard compiled to establish clarity and repeating physical metrics for ${prompt.trim().toLowerCase()}.`,
    station: station,
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

serve(async (req) => {
  // Handle CORS Preflight
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

    const { prompt, station }: SOPRequest = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
      return new Response(JSON.stringify({ error: "Missing or invalid prompt parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Inspect environment variables
    const useMockAI = Deno.env.get("USE_MOCK_AI") === "true";
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("SOP_CREATOR_MODEL") || "gpt-4o";

    // If mock mode is explicitly requested, or if we have no API key, return the high-fidelity mock
    if (useMockAI || !apiKey) {
      console.log(
        `[generate-sop] Returning mock response. Reason: useMockAI=${useMockAI}, apiKeyPresent=${!!apiKey}`,
      );
      const mockResult = generateMockSOP(prompt, station);
      return new Response(JSON.stringify(mockResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-sop] Initiating live LLM request with model ${model}`);

    const systemPrompt = `You are the Linara Home Standard Organizer, a specialist in household operations and behavioral alignment. Your task is to compile clear, professional, and respectful Standard Operating Procedures (SOPs) for household tasks.

Your instructions:
1. Speak in a respectful, warm, and highly structured tone. Use Taglish (Filipino-English mix) terms where appropriate (e.g. "timpla", "luto", "ligpit") to ensure complete cultural compatibility.
2. Focus on clear, repeatable physical metrics rather than vague commands (e.g. write "Wipe tables using the blue microfiber cloth with 2 sprays of alcohol" instead of "Make sure tables are clean").
3. Always include safety or health precautions (such as checking temperatures on wrists or separating allergy-prone ingredients).
4. Do NOT use commanding or condescending verbs. Prefer collaborative nouns and objective actions ("Rinse completely" instead of "You must wash it good").
5. Structure the output strictly into a logical summary, a list of step-by-step checklist tasks, and a list of required tools conforming to the strict JSON Schema.`;

    const userPrompt = `Generate a high-standard SOP based on this input:
Input text: "${prompt}"
${station ? `Target Station/Role: "${station}"` : ""}`;

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
            name: "house_standard_sop",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                station: { type: "string", enum: ["Yaya", "Cook", "Laundry", "Driver", "House"] },
                steps: {
                  type: "array",
                  items: { type: "string" },
                },
                toolsRequired: {
                  type: "array",
                  items: { type: "string" },
                },
                safetyProtocol: { type: "string" },
              },
              required: [
                "title",
                "description",
                "station",
                "steps",
                "toolsRequired",
                "safetyProtocol",
              ],
              additionalProperties: false,
            },
          },
        },
        temperature: 0.2,
      }),
    });

    if (!openAIResponse.ok) {
      const errorBody = await openAIResponse.text();
      console.error("[generate-sop] OpenAI API error:", errorBody);
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
    console.error("[generate-sop] Fatal error processing request:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
