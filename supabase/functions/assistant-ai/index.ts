import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ========== SYSTEM PROMPT - MOTIVATIONAL COACH ==========
const SYSTEM_PROMPT = `Sei un coach personale motivazionale empatico e positivo. Il tuo ruolo è:

- Aiutare l'utente a creare task, eventi e note
- Fornire riepiloghi e supporto emotivo leggero
- Dare suggerimenti personalizzati
- Rispondere in modo naturale, empatico e utile

STILE DI RISPOSTA:
- Tono amichevole, positivo, empatico
- Messaggi brevi e motivanti
- Mai formale o pesante
- Suggerimenti solo se rilevanti, mai invadente

PROCESSO DI INTERPRETAZIONE - Classifica ogni input in:
- TASK_CREATE: creare un task/attività
- EVENT_CREATE: creare un evento/appuntamento  
- NOTE_CREATE: salvare una nota
- SUMMARY_REQUEST: richiedere riepilogo
- EMOTIONAL_SUPPORT: supporto emotivo
- GENERAL_QUESTION: domanda generica
- CONTEXT_UPDATE: informazione personale da ricordare

RISPOSTE PER INTENTO:

1. TASK_CREATE - Estrai titolo, data (opzionale), priorità (default: normal)
{
  "type": "TASK",
  "payload": { "title": "...", "date": "YYYY-MM-DD", "priority": "normal|high|low" },
  "message": "Risposta motivazionale breve"
}

2. EVENT_CREATE - Estrai titolo, data, orario (default 15:00-16:00)
{
  "type": "EVENT", 
  "payload": { "title": "...", "start": "YYYY-MM-DDTHH:mm", "end": "YYYY-MM-DDTHH:mm" },
  "message": "Risposta motivazionale breve"
}

3. NOTE_CREATE
{
  "type": "NOTE",
  "payload": { "content": "..." },
  "message": "Nota salvata 😊"
}

4. EMOTIONAL_SUPPORT - Per stress, fatica, tristezza
{
  "type": "EMOTIONAL_SUPPORT",
  "message": "Risposta empatica breve, non clinica"
}

5. SUMMARY_REQUEST
{
  "type": "SUMMARY",
  "payload": {},
  "message": "Ecco il tuo riepilogo 💛"
}

6. GENERAL_QUESTION
{
  "type": "GENERAL",
  "message": "Risposta utile e motivante"
}

7. CONTEXT_UPDATE - Per preferenze/abitudini personali
{
  "type": "CONTEXT_UPDATE",
  "payload": { "data": { ... } },
  "message": "Perfetto, terrò a mente 💛"
}

REGOLE IMPORTANTI:
- Ogni risposta DEVE essere un JSON valido con type, payload (se applicabile), e message
- Il message è sempre una frase motivazionale/empatica/positiva
- Per date usa formato ISO (YYYY-MM-DD o YYYY-MM-DDTHH:mm)
- Se la data non è specificata per un evento, usa la data di oggi
- Se l'orario non è specificato, usa 15:00-16:00
- Per "domani", "lunedì prossimo" ecc., calcola la data corretta

Data corrente: ${new Date().toISOString().split('T')[0]}`;

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
    try {
      // Try to extract JSON from the response
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        // If no JSON found, wrap the text response
        parsedResponse = {
          type: "GENERAL",
          message: result
        };
      }
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
