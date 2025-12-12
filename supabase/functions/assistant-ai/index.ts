import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ========== SYSTEM PROMPT - JSON ONLY FORMAT ==========
const SYSTEM_PROMPT = `Sei l'Assistente AI di Daily Sync Keeper.
DEVI RISPONDERE SEMPRE E SOLO in formato JSON valido, senza testo aggiuntivo.

FORMATO OBBLIGATORIO:
{
  "intent": "TIPO_INTENT",
  "payload": { ... },
  "message": "Messaggio naturale per l'utente in italiano"
}

INTENT VALIDI:
- "create_event": Creare un evento (payload: title, date, startTime, endTime)
- "create_task": Creare un task (payload: title, priority)
- "create_expense": Registrare spesa (payload: amount, category, description)
- "create_note": Salvare nota (payload: content, category)
- "query_tasks": Mostrare task (payload: filter, limit)
- "query_events": Mostrare eventi (payload: period)
- "query_expenses": Mostrare spese (payload: period)
- "query_budget": Mostrare budget (payload: {})
- "advice": Dare consigli (payload: {})
- "suggestion": Suggerimento generico (payload: {})
- "greeting": Saluto (payload: {})
- "farewell": Congedo (payload: {})
- "thanks": Ringraziamento (payload: {})
- "question": Richiesta chiarimento (payload: {})
- "unknown": Richiesta non chiara (payload: {})

REGOLE FONDAMENTALI:
1. Rispondi SOLO in JSON puro, mai testo libero
2. NON inventare dati o eventi inesistenti
3. NON dire "ho creato" - proponi solo l'azione
4. Per date usa formato YYYY-MM-DD
5. Per orari usa formato HH:MM
6. Rispondi sempre in italiano
7. Il campo message deve essere breve e amichevole (max 2-3 frasi)

ESEMPI:

Utente: "Aggiungi evento lavoro domani alle 10"
{"intent":"create_event","payload":{"title":"Lavoro","date":"${new Date(Date.now() + 86400000).toISOString().split('T')[0]}","startTime":"10:00","endTime":"11:00"},"message":"Perfetto! Aggiungo l'evento lavoro per domani alle 10."}

Utente: "Ho speso 50 euro al supermercato"
{"intent":"create_expense","payload":{"amount":50,"category":"Supermercato","description":"Spesa alimentare"},"message":"Registro la spesa di €50 per il supermercato."}

Utente: "Mostra i miei task"
{"intent":"query_tasks","payload":{"filter":"pending","limit":10},"message":"Ecco i tuoi task in sospeso."}

Utente: "Cosa dovrei fare oggi?"
{"intent":"advice","payload":{},"message":"Ti consiglio di iniziare con le attività più importanti della mattina quando hai più energia!"}

Utente: "Ciao"
{"intent":"greeting","payload":{},"message":"Ciao! Come posso aiutarti oggi?"}

Data corrente: ${new Date().toISOString().split('T')[0]}
RISPONDI SEMPRE E SOLO IN JSON.`;

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

    const { prompt, message, userId, context, history, systemPrompt, forceJson } = body;
    const userMessage = prompt || message;

    if (!userMessage || typeof userMessage !== "string" || userMessage.trim().length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false,
          message: "Dimmi pure, sono qui per aiutarti!",
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
    const activeSystemPrompt = systemPrompt || SYSTEM_PROMPT;
    const messages = [
      { role: "system", content: activeSystemPrompt },
    ];

    // Add user context if available
    if (userContext) {
      messages.push({
        role: "system",
        content: `Contesto utente: ${JSON.stringify(userContext)}`
      });
    }

    // Add conversation history if provided
    const conversationHistory = history || context;
    if (conversationHistory && Array.isArray(conversationHistory)) {
      conversationHistory.slice(-6).forEach((msg: any) => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });
    }

    // Add JSON format reminder if forceJson
    const userContent = forceJson 
      ? `${userMessage}\n\n[RICORDA: Rispondi SOLO in JSON valido]`
      : userMessage;
    
    messages.push({ role: "user", content: userContent });

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
    
    try {
      // Try to parse as JSON first
      let jsonContent = result.trim();
      
      // Extract JSON from markdown code blocks if present
      const codeBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonContent = codeBlockMatch[1].trim();
      }
      
      // Extract JSON object from text
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonContent = jsonMatch[0];
      }
      
      const parsed = JSON.parse(jsonContent);
      
      // Validate and normalize the response
      parsedResponse = {
        type: "JSON",
        response: jsonContent,
        intent: parsed.intent || 'unknown',
        payload: parsed.payload || {},
        message: parsed.message || ''
      };
      
      console.log("Parsed JSON response:", parsedResponse);
    } catch (parseError) {
      // If JSON parsing fails, return as text
      console.warn("Failed to parse JSON, returning as text:", parseError);
      parsedResponse = {
        type: "TEXT",
        response: result,
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
