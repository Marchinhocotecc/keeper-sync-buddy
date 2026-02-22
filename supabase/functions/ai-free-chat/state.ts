/**
 * State Module - Assistant State Management
 * Safe merge: non sovrascrive mai con undefined/null
 */

import { PendingAction } from "./types.ts";

// ============================================================================
// PENDING ACTION STATE
// ============================================================================

export async function getPendingAction(supabase: any, userId: string): Promise<PendingAction | null> {
  const { data } = await supabase
    .from("assistant_state")
    .select("intent_payload")
    .eq("user_id", userId)
    .maybeSingle();
  
  if (data?.intent_payload?.pendingAction) {
    return data.intent_payload.pendingAction as PendingAction;
  }
  return null;
}

export async function setPendingAction(supabase: any, userId: string, action: PendingAction | null): Promise<void> {
  const current = await getAssistantState(supabase, userId);
  const currentPayload = current.intent_payload || {};
  
  await supabase
    .from("assistant_state")
    .upsert({
      user_id: userId,
      intent_payload: { ...currentPayload, pendingAction: action },
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
}

// ============================================================================
// FULL ASSISTANT STATE
// ============================================================================

export async function getAssistantState(supabase: any, userId: string): Promise<any> {
  const { data } = await supabase
    .from("assistant_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  
  return data || { active_intent: 'NONE', intent_payload: {} };
}

/**
 * SAFE MERGE: aggiorna lo stato facendo deep-merge del payload
 * NON sovrascrive valori esistenti con undefined/null
 */
export async function updateAssistantState(supabase: any, userId: string, patch: any): Promise<void> {
  const current = await getAssistantState(supabase, userId);
  
  // Deep merge del payload: mantieni valori esistenti se i nuovi sono undefined/null
  const currentPayload = current.intent_payload || {};
  const patchPayload = patch.intent_payload || {};
  
  const mergedPayload: any = { ...currentPayload };
  for (const [key, value] of Object.entries(patchPayload)) {
    // Solo se il nuovo valore è definito e non null
    if (value !== undefined && value !== null) {
      mergedPayload[key] = value;
    }
  }
  
  await supabase
    .from("assistant_state")
    .upsert({
      user_id: userId,
      ...current,
      ...patch,
      intent_payload: mergedPayload,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
}

export async function clearAssistantState(supabase: any, userId: string): Promise<void> {
  await supabase
    .from("assistant_state")
    .upsert({
      user_id: userId,
      active_intent: 'NONE',
      intent_payload: {},
      missing_fields: [],
      awaiting_confirmation: false,
      attempts: 0,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
}

// ============================================================================
// RATE LIMITING
// ============================================================================

const FREE_DAILY_LIMIT = 10;
const PREMIUM_DAILY_LIMIT = 200;

export async function checkRateLimit(
  supabase: any,
  userId: string,
  isPremium: boolean = false
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const limit = isPremium ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT;

  const { count, error } = await supabase
    .from("ai_requests")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (error) {
    console.error("[STATE] Rate limit check error:", error);
    // Fail open: allow the request if we can't check
    return { allowed: true, remaining: limit, limit };
  }

  const used = count || 0;
  const remaining = Math.max(0, limit - used);
  console.log(`[STATE] Rate limit: ${used}/${limit} used, ${remaining} remaining`);

  return { allowed: used < limit, remaining, limit };
}

export async function logAIRequest(supabase: any, userId: string): Promise<void> {
  const { error } = await supabase
    .from("ai_requests")
    .insert({ user_id: userId, endpoint: "ai-free-chat" });

  if (error) {
    console.error("[STATE] Failed to log AI request:", error);
  }
}

// ============================================================================
// CACHE
// ============================================================================

const CACHE_TTL_HOURS = 24;

async function hashMessage(message: string): Promise<string> {
  const normalized = message.toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function getCachedAnalysis(supabase: any, message: string): Promise<any | null> {
  try {
    const hash = await hashMessage(message);
    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("ai_cache")
      .select("result")
      .eq("prompt_hash", hash)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.result) return null;

    console.log("[STATE] Cache HIT for:", message.substring(0, 50));
    return data.result;
  } catch (e) {
    console.error("[STATE] Cache read error:", e);
    return null;
  }
}

export async function setCachedAnalysis(supabase: any, userId: string, message: string, result: any): Promise<void> {
  try {
    const hash = await hashMessage(message);
    await supabase
      .from("ai_cache")
      .insert({ user_id: userId, prompt_hash: hash, result });
    console.log("[STATE] Cache SET for:", message.substring(0, 50));
  } catch (e) {
    console.error("[STATE] Cache write error:", e);
  }
}

// ============================================================================
// USER CONTEXT
// ============================================================================

export async function fetchUserContext(supabase: any, userId: string) {
  const today = new Date().toISOString().split("T")[0];
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  
  const [todosRes, eventsRes, expensesRes, budgetRes] = await Promise.all([
    supabase.from("todos").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    supabase.from("calendar_events").select("*").eq("user_id", userId).gte("start_time", today).order("start_time").limit(10),
    supabase.from("expenses").select("*").eq("user_id", userId).gte("date", startOfMonth.toISOString().split("T")[0]).order("date", { ascending: false }).limit(20),
    supabase.from("budgets").select("*").eq("user_id", userId).order("year", { ascending: false }).limit(1).maybeSingle()
  ]);
  
  return {
    todos: todosRes.data || [],
    events: eventsRes.data || [],
    expenses: expensesRes.data || [],
    budget: budgetRes.data
  };
}

// ============================================================================
// USER LANGUAGE PREFERENCES
// ============================================================================

const LANGUAGE_NAMES: Record<string, string> = {
  it: "italiano",
  en: "English",
  es: "español",
  fr: "français",
  de: "Deutsch"
};

/**
 * Carica la lingua preferita dell'utente da:
 * 1. Impostazioni utente (tabella settings)
 * 2. Profilo utente (tabella profiles)
 * 3. Fallback al parametro passato o "it"
 */
export async function loadPreferredLanguage(
  supabase: any, 
  userId: string, 
  fallbackLocale: string = "it"
): Promise<{ code: string; name: string }> {
  try {
    // Prima prova settings
    const { data: settings } = await supabase
      .from("settings")
      .select("language")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (settings?.language) {
      return {
        code: settings.language,
        name: LANGUAGE_NAMES[settings.language] || settings.language
      };
    }
    
    // Poi prova profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("language")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (profile?.language) {
      return {
        code: profile.language,
        name: LANGUAGE_NAMES[profile.language] || profile.language
      };
    }
    
    // Fallback
    return {
      code: fallbackLocale,
      name: LANGUAGE_NAMES[fallbackLocale] || fallbackLocale
    };
    
  } catch (error) {
    console.error("[STATE] Error loading language preference:", error);
    return {
      code: fallbackLocale,
      name: LANGUAGE_NAMES[fallbackLocale] || fallbackLocale
    };
  }
}
