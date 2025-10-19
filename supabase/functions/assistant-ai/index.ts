import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting: Map<identifier, lastRequestTimestamp>
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW = 1000; // 1 second minimum between requests per user/IP
const CLEANUP_INTERVAL = 10000; // Cleanup old entries every 10 seconds

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of rateLimitMap.entries()) {
    if (now - timestamp > RATE_LIMIT_WINDOW * 3) {
      rateLimitMap.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting by userId or IP
    const identifier = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "anonymous";
    const now = Date.now();
    const lastRequest = rateLimitMap.get(identifier) || 0;

    if (now - lastRequest < RATE_LIMIT_WINDOW) {
      console.log(`Rate limit exceeded for: ${identifier}`);
      return new Response(
        JSON.stringify({ 
          error: "Too many requests", 
          message: "Per favore attendi prima di inviare un altro messaggio",
          retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - lastRequest)) / 1000) 
        }), 
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((RATE_LIMIT_WINDOW - (now - lastRequest)) / 1000))
          } 
        }
      );
    }

    rateLimitMap.set(identifier, now);

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid request body", message: "Il formato della richiesta non è valido" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { prompt, userId } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid prompt", message: "Messaggio mancante o non valido" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const deepSeekKey = Deno.env.get("DEEP_SEEK_R1_FREE");

    if (!deepSeekKey) {
      console.error("Missing DEEP_SEEK_R1_FREE API key in environment");
      return new Response(
        JSON.stringify({ error: "Configuration error", message: "Configurazione API non disponibile" }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Calling DeepSeek R1 via OpenRouter for identifier:", identifier);

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
      
      // Handle specific error cases
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: "Rate limit exceeded", 
            message: "Il servizio AI è temporaneamente sovraccarico. Riprova tra qualche secondo.",
            details: errorText 
          }), 
          {
            status: 503, // Service Unavailable instead of 429 to avoid confusion with our rate limit
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: "AI service error", 
          message: "Impossibile contattare il servizio AI. Riprova più tardi.",
          details: errorText 
        }), 
        {
          status: response.status >= 500 ? 503 : response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error("Failed to parse AI response:", jsonError);
      return new Response(
        JSON.stringify({ 
          error: "Invalid AI response", 
          message: "Risposta del servizio AI non valida" 
        }), 
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = data.choices?.[0]?.message?.content;
    
    if (!result) {
      console.error("No content in AI response:", data);
      return new Response(
        JSON.stringify({ 
          error: "Empty AI response", 
          message: "Il servizio AI non ha fornito una risposta",
          result: "Nessuna risposta disponibile al momento. Riprova."
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log("DeepSeek R1 response received successfully");
    
    return new Response(
      JSON.stringify({ result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Edge function unexpected error:", e);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error", 
        message: "Si è verificato un errore interno. Riprova.",
        details: e instanceof Error ? e.message : "Unknown error" 
      }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
