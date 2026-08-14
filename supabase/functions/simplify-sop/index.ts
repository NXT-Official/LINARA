import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SimplifySopRequest {
  steps: string[];
  title?: string;
}

const MAX_INSTRUCTION_LENGTH = 100;

// Deterministic truncation fallback for offline/mock mode -- mirrors
// generate-sop's generateMockSOP style, but as a transform rather than a
// generator since the input steps already exist.
function simplifyMockSop(steps: string[], title?: string) {
  const cappedSteps = steps.slice(0, 3);
  const visualCards = cappedSteps.map((step, index) => ({
    stepNumber: index + 1,
    instruction: step.length > MAX_INSTRUCTION_LENGTH ? `${step.slice(0, 97)}...` : step,
    focusPoint: "Mag-ingat at kumustahin ang sarili habang ginagawa.",
  }));

  return {
    simplifiedGoal: title
      ? `Para sa maayos at ligtas na pagsasagawa ng "${title}".`
      : "Para sa maayos at ligtas na pagsasagawa ng gawaing bahay.",
    visualCards:
      visualCards.length > 0
        ? visualCards
        : [
            {
              stepNumber: 1,
              instruction: title || "Sundin ang mga hakbang nang mahinahon.",
              focusPoint: "Kumuha muna ng buong detalye bago simulan.",
            },
          ],
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

    const { steps, title }: SimplifySopRequest = await req.json();

    if (!Array.isArray(steps) || steps.length === 0) {
      return new Response(JSON.stringify({ error: "Missing or invalid steps parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const useMockAI = Deno.env.get("USE_MOCK_AI") === "true";
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("SOP_SIMPLIFIER_MODEL") || "gpt-4o-mini";

    if (useMockAI || !apiKey) {
      console.log(
        `[simplify-sop] Returning mock response. Reason: useMockAI=${useMockAI}, apiKeyPresent=${!!apiKey}`,
      );
      const mockResult = simplifyMockSop(steps, title);
      return new Response(JSON.stringify(mockResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[simplify-sop] Initiating live LLM request with model ${model}`);

    const systemPrompt = `You are Ate Linara, a supportive and reassuring guide for household helpers. Your job is to translate and simplify technical English house instructions (SOPs) into small, friendly, Taglish action steps.

Your instructions:
1. Speak in a warm, polite, and encouraging tone. Always use respectful Taglish honorifics (e.g., "po", "opo") when appropriate.
2. Break down heavy text paragraphs into a maximum of 3 highly focused, single-sentence visual cards.
3. Replace technical jargon with common Philippine household terms (e.g., "disinfectant" -> "alcohol o sabon", "steam machine" -> "mainit na tubig o steam machine").
4. Never sound demanding or monitoring. Highlight safety and child comfort as collaborative goals (e.g., "Siguraduhing hindi masyadong mainit para ligtas si baby" instead of "Do not burn the baby").`;

    const userPrompt = `Simplify this House Standard into Taglish visual cards:
${title ? `Title: "${title}"` : ""}
Steps:
${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`;

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
            name: "sop_translation",
            strict: true,
            schema: {
              type: "object",
              properties: {
                simplifiedGoal: { type: "string" },
                visualCards: {
                  type: "array",
                  minItems: 1,
                  maxItems: 3,
                  items: {
                    type: "object",
                    properties: {
                      stepNumber: { type: "integer" },
                      instruction: { type: "string", maxLength: MAX_INSTRUCTION_LENGTH },
                      focusPoint: { type: "string" },
                    },
                    required: ["stepNumber", "instruction", "focusPoint"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["simplifiedGoal", "visualCards"],
              additionalProperties: false,
            },
          },
        },
        temperature: 0.2,
      }),
    });

    if (!openAIResponse.ok) {
      const errorBody = await openAIResponse.text();
      console.error("[simplify-sop] OpenAI API error:", errorBody);
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
    console.error("[simplify-sop] Fatal error processing request:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
