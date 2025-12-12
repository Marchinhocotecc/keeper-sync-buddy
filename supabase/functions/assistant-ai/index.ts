import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ========== SYSTEM PROMPT - EXTERNAL REASONING ASSISTANT WITH XML ==========
const EXTERNAL_SYSTEM_PROMPT = `Sei l'Assistente Esterno Avanzato di Daily Sync Keeper.
Rispondi SEMPRE con questo formato XML:

<response>
  <message>Testo naturale da mostrare all'utente.</message>
  <action type="tipo_azione">
    <title>...</title>
    <date>YYYY-MM-DD</date>
    <startTime>HH:MM</startTime>
    <endTime>HH:MM</endTime>
    <amount>...</amount>
    <category>...</category>
    <description>...</description>
    <priority>low|medium|high</priority>
  </action>
</response>

REGOLE IMPORTANTI:
1. Non aggiungere MAI tu eventi/task/spese nella realtà - genera solo comandi XML.
2. Usa <action> SOLO se l'utente esprime volontà chiara ("aggiungi", "crea", "programma", "inserisci").
3. Se l'utente chiede consigli o informazioni, ometti completamente l'elemento <action>.
4. Rispondi SEMPRE in italiano con tono amichevole e motivazionale.
5. Il messaggio deve essere breve (max 3-4 frasi).

TIPI DI ACTION VALIDI:
- create_event: per creare eventi nel calendario
- create_task: per creare task/attività
- create_expense: per registrare spese
- update_budget: per aggiornare il budget
- create_note: per salvare note

ESEMPI:

Utente: "Lavoro domani dalle 10 alle 14"
<response>
  <message>Perfetto! Ti organizzo l'evento di lavoro per domani. Buona produttività! 💪</message>
  <action type="create_event">
    <title>Lavoro</title>
    <date>${new Date(Date.now() + 86400000).toISOString().split('T')[0]}</date>
    <startTime>10:00</startTime>
    <endTime>14:00</endTime>
  </action>
</response>

Utente: "Ho speso 25 euro al supermercato"
<response>
  <message>Registrato! Spesa di €25 per la spesa. 📊</message>
  <action type="create_expense">
    <amount>25</amount>
    <category>Supermercato</category>
    <description>Spesa alimentare</description>
  </action>
</response>

Utente: "Cosa potrei fare oggi?"
<response>
  <message>Potresti iniziare con le attività più importanti della mattina, quando l'energia è alta. Prenditi anche una pausa per ricaricarti!</message>
</response>

Data corrente: ${new Date().toISOString().split('T')[0]}`;

// Legacy system prompt for backward compatibility
const SYSTEM_PROMPT = EXTERNAL_SYSTEM_PROMPT;

// ========== CONFIGURATION ==========
const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_WINDOW = 1000;
const REQUEST_TIMEOUT = 30000;

// ========== IN-MEMORY STORAGE ==========
interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// ========== UTILITIES ==========
const fetchWithTimeout = async (url: string, options: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// ========== MAIN HANDLER ==========
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = supabaseUrl && supabaseServiceKey 
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

  try {
    // ========== RATE LIMITING ==========
    const identifier = req.headers.get("x-forwarded-for") || "anonymous";
    const now = Date.now();
    
    const entry = rateLimitMap.get(identifier) || { timestamps: [] };
    entry.timestamps = entry.timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW);
    
    if (entry.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      return new Response(
        JSON.stringify({ 
          success: false,
          message: "Attendi qualche secondo prima di inviare un altro messaggio 😊",
          type: "RATE_LIMIT"
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    entry.timestamps.push(now);
    rateLimitMap.set(identifier, entry);

    // ========== PARSE REQUEST ==========
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ 
          success: false,
          message: "Richiesta non valida",
          type: "ERROR"
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { prompt, userId, context } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false,
          message: "Dimmi pure, sono qui per aiutarti! 💛",
          type: "ERROR"
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== FETCH USER CONTEXT ==========
    let userContext = null;
    if (supabase && userId) {
      const { data } = await supabase
        .from('user_context')
        .select('*')
        .eq('user_id', userId)
        .single();
      userContext = data;
    }

    // ========== BUILD MESSAGES ==========
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Add user context if available
    if (userContext) {
      messages.push({
        role: "system",
        content: `Contesto utente salvato: ${JSON.stringify(userContext)}`
      });
    }

    // Add conversation context if provided
    if (context && Array.isArray(context)) {
      context.slice(-5).forEach((msg: any) => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });
    }

    messages.push({ role: "user", content: prompt });

    // ========== CALL LOVABLE AI ==========
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      console.error("Missing LOVABLE_API_KEY");
      return new Response(
        JSON.stringify({ 
          success: false,
          message: "Configurazione AI mancante. Contatta il supporto.",
          type: "ERROR"
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ 
            success: false,
            message: "Servizio AI sovraccarico. Riprova tra poco 😊",
            type: "RATE_LIMIT"
          }), 
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ 
            success: false,
            message: "Crediti AI esauriti. Contatta il supporto.",
            type: "ERROR"
          }), 
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.error("AI gateway error:", response.status);
      return new Response(
        JSON.stringify({ 
          success: false,
          message: "Servizio AI temporaneamente non disponibile. Riprova.",
          type: "ERROR"
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content;

    if (!result) {
      return new Response(
        JSON.stringify({ 
          success: false,
          message: "Nessuna risposta disponibile. Riprova.",
          type: "ERROR"
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== PARSE AI RESPONSE ==========
    let parsedResponse;
    let command = null;
    let textMessage = result;
    
    try {
      // Extract <COMMAND> block if present
      const commandMatch = result.match(/<COMMAND>\s*([\s\S]*?)\s*<\/COMMAND>/);
      if (commandMatch) {
        try {
          command = JSON.parse(commandMatch[1].trim());
          // Remove the command block from the text message
          textMessage = result.replace(/<COMMAND>[\s\S]*?<\/COMMAND>/, '').trim();
        } catch (cmdError) {
          console.error('Failed to parse COMMAND block:', cmdError);
        }
      }
      
      // Build response object
      parsedResponse = {
        type: command ? "COMMAND" : "GENERAL",
        message: textMessage,
        ...(command && { payload: command })
      };
    } catch {
      // If parsing fails, use the raw response
      parsedResponse = {
        type: "GENERAL", 
        message: result
      };
    }

    // ========== SAVE CONTEXT UPDATE ==========
    if (parsedResponse.type === "CONTEXT_UPDATE" && supabase && userId) {
      try {
        await supabase
          .from('user_context')
          .upsert({
            user_id: userId,
            ...parsedResponse.payload?.data,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
      } catch (error) {
        console.error('Failed to save context:', error);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        ...parsedResponse
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Edge function error:", error);
    
    const isTimeout = error instanceof Error && error.name === "AbortError";
    
    return new Response(
      JSON.stringify({ 
        success: false,
        message: isTimeout 
          ? "Timeout. Riprova tra poco 😊"
          : "Errore interno. Riprova.",
        type: "ERROR"
      }), 
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
