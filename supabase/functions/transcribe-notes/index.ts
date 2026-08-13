import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TranscribeRequest {
  audioBase64: string;
  mimeType?: string;
}

// Deterministic mock transcript for offline/mock mode -- mirrors the Taglish
// scratchpad example straight from LINARA_MOBILE/aiagent.md Section 2.1.
function mockTranscript(): string {
  return "Bumili ng gatas at itlog para sa almusal ni Sofia bukas ng umaga, tapos ayusin din ang nursery.";
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
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

    const { audioBase64, mimeType }: TranscribeRequest = await req.json();

    if (!audioBase64 || typeof audioBase64 !== "string" || audioBase64.trim() === "") {
      return new Response(JSON.stringify({ error: "Missing or invalid audioBase64 parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const useMockAI = Deno.env.get("USE_MOCK_AI") === "true";
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("TRANSCRIBE_MODEL") || "whisper-1";

    if (useMockAI || !apiKey) {
      console.log(
        `[transcribe-notes] Returning mock response. Reason: useMockAI=${useMockAI}, apiKeyPresent=${!!apiKey}`,
      );
      return new Response(JSON.stringify({ transcript: mockTranscript() }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[transcribe-notes] Initiating live Whisper request with model ${model}`);

    const audioBytes = base64ToUint8Array(audioBase64);
    const audioBlob = new Blob([audioBytes], { type: mimeType || "audio/m4a" });

    const formData = new FormData();
    formData.append("file", audioBlob, "voice-note.m4a");
    formData.append("model", model);

    const openAIResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!openAIResponse.ok) {
      const errorBody = await openAIResponse.text();
      console.error("[transcribe-notes] OpenAI API error:", errorBody);
      throw new Error(`OpenAI API returned status ${openAIResponse.status}`);
    }

    const openAIData = await openAIResponse.json();
    const transcript = openAIData.text;

    if (typeof transcript !== "string") {
      throw new Error("No transcript text returned from OpenAI");
    }

    return new Response(JSON.stringify({ transcript }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[transcribe-notes] Fatal error processing request:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
