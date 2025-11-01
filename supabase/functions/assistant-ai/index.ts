import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ========== CONFIGURATION ==========
const RATE_LIMIT_MAX_REQUESTS = 3; // Max 3 requests per second per user
const RATE_LIMIT_WINDOW = 1000; // 1 second window
const CACHE_TTL = 60000; // Cache responses for 60 seconds
const REQUEST_TIMEOUT = 30000; // 30 second timeout for external calls
const MAX_RETRIES = 2; // Max 2 retry attempts (3 total attempts including first)
const RETRY_DELAYS = [1000, 2000]; // Delays between retries: 1s, 2s
const CLEANUP_INTERVAL = 30000; // Cleanup every 30 seconds
const DEV_MODE = false; // Set to true for verbose logging

// ========== IN-MEMORY STORAGE ==========
interface RateLimitEntry {
  timestamps: number[];
}

interface CacheEntry {
  response: any;
  timestamp: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const responseCache = new Map<string, CacheEntry>();

// ========== UTILITIES ==========
const devLog = (...args: any[]) => {
  if (DEV_MODE) console.log(...args);
};

const hashPrompt = async (prompt: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(prompt.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  
  // Cleanup rate limit map
  for (const [key, entry] of rateLimitMap.entries()) {
    entry.timestamps = entry.timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW * 2);
    if (entry.timestamps.length === 0) {
      rateLimitMap.delete(key);
    }
  }
  
  // Cleanup cache
  for (const [key, entry] of responseCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      responseCache.delete(key);
    }
  }
  
  devLog(`Cleanup: RateLimit entries: ${rateLimitMap.size}, Cache entries: ${responseCache.size}`);
}, CLEANUP_INTERVAL);

// ========== RETRY WITH EXPONENTIAL BACKOFF ==========
const fetchWithRetry = async (url: string, options: RequestInit, attempt = 0): Promise<Response> => {
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
    
    if (attempt < MAX_RETRIES - 1) {
      const delay = RETRY_DELAYS[attempt];
      devLog(`Retry attempt ${attempt + 1} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, attempt + 1);
    }
    
    throw error;
  }
};

// ========== LOGGING TO DATABASE ==========
const logRequest = async (supabase: any, logData: {
  user_id: string | null;
  prompt: string;
  response_time: number;
  status_code: number;
  error_message?: string;
  cached: boolean;
}) => {
  try {
    await supabase.from('requests_log').insert(logData);
  } catch (error) {
    console.error('Failed to log request:', error);
  }
};

// ========== MAIN HANDLER ==========
serve(async (req) => {
  const startTime = Date.now();
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize Supabase client for logging
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = supabaseUrl && supabaseServiceKey 
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

  let userId: string | null = null;
  let prompt: string = "";

  try {
    // ========== RATE LIMITING (3 req/sec per user) ==========
    const identifier = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "anonymous";
    const now = Date.now();
    
    const entry = rateLimitMap.get(identifier) || { timestamps: [] };
    entry.timestamps = entry.timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW);
    
    if (entry.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      devLog(`Rate limit exceeded for: ${identifier}`);
      
      return new Response(
        JSON.stringify({ 
          success: false,
          message: "Rate limit exceeded, try again in a few seconds.",
          timestamp: new Date().toISOString(),
          cached: false
        }), 
        { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }
    
    entry.timestamps.push(now);
    rateLimitMap.set(identifier, entry);

    // ========== PARSE REQUEST BODY ==========
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      
      const responseTime = Date.now() - startTime;
      if (supabase) {
        await logRequest(supabase, {
          user_id: null,
          prompt: "",
          response_time: responseTime,
          status_code: 400,
          error_message: "Invalid request body",
          cached: false
        });
      }
      
      return new Response(
        JSON.stringify({ 
          success: false,
          message: "Il formato della richiesta non è valido",
          timestamp: new Date().toISOString(),
          cached: false
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    prompt = body.prompt;
    userId = body.userId || null;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      const responseTime = Date.now() - startTime;
      if (supabase) {
        await logRequest(supabase, {
          user_id: userId,
          prompt: "",
          response_time: responseTime,
          status_code: 400,
          error_message: "Missing or invalid prompt",
          cached: false
        });
      }
      
      return new Response(
        JSON.stringify({ 
          success: false,
          message: "Messaggio mancante o non valido",
          timestamp: new Date().toISOString(),
          cached: false
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== CHECK CACHE (60s TTL) ==========
    const promptHash = await hashPrompt(prompt);
    const cachedEntry = responseCache.get(promptHash);
    
    if (cachedEntry && (now - cachedEntry.timestamp < CACHE_TTL)) {
      devLog(`Cache HIT for prompt hash: ${promptHash.substring(0, 8)}`);
      
      const responseTime = Date.now() - startTime;
      if (supabase) {
        await logRequest(supabase, {
          user_id: userId,
          prompt: prompt.substring(0, 200), // Limit prompt length in logs
          response_time: responseTime,
          status_code: 200,
          cached: true
        });
      }
      
      return new Response(
        JSON.stringify({ 
          success: true,
          message: cachedEntry.response,
          timestamp: new Date().toISOString(),
          cached: true
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    devLog(`Cache MISS for prompt hash: ${promptHash.substring(0, 8)}`);

    // ========== VALIDATE API KEY ==========
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

    if (!OPENROUTER_API_KEY) {
      console.error("Missing OPENROUTER_API_KEY in environment variables");
      
      const responseTime = Date.now() - startTime;
      if (supabase) {
        await logRequest(supabase, {
          user_id: userId,
          prompt: prompt.substring(0, 200),
          response_time: responseTime,
          status_code: 500,
          error_message: "Missing API key",
          cached: false
        });
      }
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Missing API key",
          message: "OpenRouter API key is not configured. Please add OPENROUTER_API_KEY to environment variables.",
          timestamp: new Date().toISOString(),
          cached: false
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    devLog("Calling AI model via OpenRouter for identifier:", identifier);

    // ========== CALL AI WITH RETRY & TIMEOUT ==========
    let response: Response;
    try {
      response = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://lovable.dev",
          "X-Title": "Lovable Assistant"
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
    } catch (fetchError) {
      console.error("Failed to fetch from OpenRouter after retries:", fetchError);
      
      const responseTime = Date.now() - startTime;
      if (supabase) {
        await logRequest(supabase, {
          user_id: userId,
          prompt: prompt.substring(0, 200),
          response_time: responseTime,
          status_code: 503,
          error_message: `Network error: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
          cached: false
        });
      }
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Network error",
          message: "Impossibile contattare il servizio AI. Verifica la tua connessione e riprova.",
          timestamp: new Date().toISOString(),
          cached: false
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== HANDLE AI RESPONSE ERRORS ==========
    if (!response.ok) {
      let errorText = "";
      let errorData: any = null;
      
      try {
        errorText = await response.text();
        errorData = JSON.parse(errorText);
      } catch {
        // If parsing fails, use raw text
      }
      
      console.error("OpenRouter API error:", response.status, errorText);
      
      const responseTime = Date.now() - startTime;
      let errorMessage = "AI service error";
      let userMessage = "Impossibile contattare il servizio AI. Riprova più tardi.";
      
      if (response.status === 429) {
        errorMessage = "AI service rate limited";
        userMessage = "Il servizio AI è temporaneamente sovraccarico. Riprova tra qualche secondo.";
      } else if (response.status === 401 || response.status === 403) {
        errorMessage = "Invalid API key";
        userMessage = "Errore di autenticazione con il servizio AI. Verifica la configurazione.";
      } else if (response.status >= 500) {
        errorMessage = "AI service unavailable";
        userMessage = "Il servizio AI è temporaneamente non disponibile. Riprova più tardi.";
      }
      
      if (supabase) {
        await logRequest(supabase, {
          user_id: userId,
          prompt: prompt.substring(0, 200),
          response_time: responseTime,
          status_code: response.status,
          error_message: `${errorMessage}: ${errorText.substring(0, 200)}`,
          cached: false
        });
      }
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: errorMessage,
          message: userMessage,
          details: errorData?.error?.message || errorText.substring(0, 100),
          timestamp: new Date().toISOString(),
          cached: false
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== PARSE AI RESPONSE ==========
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error("Failed to parse AI response:", jsonError);
      
      const responseTime = Date.now() - startTime;
      if (supabase) {
        await logRequest(supabase, {
          user_id: userId,
          prompt: prompt.substring(0, 200),
          response_time: responseTime,
          status_code: 502,
          error_message: "Invalid AI response JSON",
          cached: false
        });
      }
      
      return new Response(
        JSON.stringify({ 
          success: false,
          message: "Risposta del servizio AI non valida",
          timestamp: new Date().toISOString(),
          cached: false
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = data.choices?.[0]?.message?.content;
    
    if (!result) {
      console.error("No content in AI response:", data);
      
      const responseTime = Date.now() - startTime;
      if (supabase) {
        await logRequest(supabase, {
          user_id: userId,
          prompt: prompt.substring(0, 200),
          response_time: responseTime,
          status_code: 200,
          error_message: "Empty AI response content",
          cached: false
        });
      }
      
      return new Response(
        JSON.stringify({ 
          success: false,
          message: "Nessuna risposta disponibile al momento. Riprova.",
          timestamp: new Date().toISOString(),
          cached: false
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // ========== CACHE SUCCESSFUL RESPONSE ==========
    responseCache.set(promptHash, {
      response: result,
      timestamp: Date.now()
    });
    
    devLog("AI response received and cached successfully");
    
    // ========== LOG SUCCESS ==========
    const responseTime = Date.now() - startTime;
    if (supabase) {
      await logRequest(supabase, {
        user_id: userId,
        prompt: prompt.substring(0, 200),
        response_time: responseTime,
        status_code: 200,
        cached: false
      });
    }
    
    return new Response(
      JSON.stringify({ 
        success: true,
        message: result,
        timestamp: new Date().toISOString(),
        cached: false
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Edge function unexpected error:", e);
    
    // ========== LOG UNEXPECTED ERRORS ==========
    const responseTime = Date.now() - startTime;
    if (supabase) {
      await logRequest(supabase, {
        user_id: userId,
        prompt: prompt ? prompt.substring(0, 200) : "",
        response_time: responseTime,
        status_code: 500,
        error_message: e instanceof Error ? e.message : "Unknown error",
        cached: false
      });
    }
    
    // Check if it's a timeout error
    const isTimeout = e instanceof Error && (e.name === "AbortError" || e.message.includes("timeout"));
    
    return new Response(
      JSON.stringify({ 
        success: false,
        message: isTimeout 
          ? "Timeout: il servizio AI non ha risposto in tempo. Riprova."
          : "Si è verificato un errore interno. Riprova.",
        timestamp: new Date().toISOString(),
        cached: false
      }), 
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
