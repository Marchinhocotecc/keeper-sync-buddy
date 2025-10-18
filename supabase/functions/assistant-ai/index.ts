import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, userId } = await req.json();
    const deepSeekKey = Deno.env.get("DEEP_SEEK_R1_FREE");

    if (!deepSeekKey) {
      return new Response(
        JSON.stringify({ error: "Missing DEEP_SEEK_R1_FREE API key" }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Missing prompt" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Calling DeepSeek R1 via OpenRouter for user:", userId);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${deepSeekKey}`,
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-r1:free",
        messages: [
          { 
            role: "system", 
            content: "Sei un assistente personale utile, empatico e preciso. Aiuta l'utente a gestire attività, spese e benessere." 
          },
          { role: "user", content: prompt }
        ],
        max_tokens: 400,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "OpenRouter API error", details: errorText }), 
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content ?? "Nessuna risposta";
    
    console.log("DeepSeek R1 response received successfully");
    
    return new Response(
      JSON.stringify({ result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Edge function error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
