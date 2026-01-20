import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// STRICT JSON CONTRACT - All responses MUST follow this structure
// ============================================================================

type AIIntent =
  | 'NONE'
  | 'CREATE_TASK'
  | 'CREATE_EVENT'
  | 'RECORD_EXPENSE'
  | 'QUERY_TASKS'
  | 'QUERY_EVENTS'
  | 'QUERY_BUDGET'
  | 'DELETE_TASKS'
  | 'DELETE_EVENTS'
  | 'DELETE_EXPENSES'
  | 'ADVICE'
  | 'CANCEL'
  | 'SMALL_TALK'
  | 'ERROR';

interface AIAction {
  type: 'NONE' | 'CREATE_TASK' | 'CREATE_EVENT' | 'RECORD_EXPENSE' | 'DELETE_ALL_TASKS' | 'DELETE_ALL_EVENTS' | 'DELETE_ALL_EXPENSES' | 'QUERY_TASKS' | 'QUERY_EVENTS' | 'QUERY_BUDGET';
  title?: string;
  start_at?: string;
  end_at?: string;
  due_date?: string;
  due_time?: string;
  amount?: number;
  category?: string;
  scope?: 'today' | 'week' | 'all';
  recurring?: { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY'; byHour?: number; byMinute?: number; byDay?: string[] };
}

interface AIResponse {
  intent: AIIntent;
  reply: string;
  action: AIAction;
  needsConfirmation: boolean;
  confirmationQuestion: string | null;
  missingFields: string[];
  mode: 'CHATTY' | 'OPERATIVE';
  suggestions?: string[];
}

// Create a valid response object
function createResponse(partial: Partial<AIResponse>): AIResponse {
  const base: AIResponse = {
    reply: partial.reply || "Come posso aiutarti?",
    intent: partial.intent || "SMALL_TALK",
    action: partial.action || { type: "NONE" },
    needsConfirmation: partial.needsConfirmation || false,
    confirmationQuestion: partial.confirmationQuestion || null,
    missingFields: partial.missingFields || [],
    mode: "CHATTY",
    suggestions: partial.suggestions
  };
  
  // RULE: mode="OPERATIVE" if action.type !== "NONE" OR needsConfirmation===true OR missingFields.length > 0
  if (base.action.type !== "NONE" || base.needsConfirmation || base.missingFields.length > 0) {
    base.mode = "OPERATIVE";
  }
  
  return base;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// PREMIUM-ONLY actions (FREE users blocked)
const PREMIUM_ONLY_ACTIONS = ['DELETE_ALL_TASKS', 'DELETE_ALL_EVENTS', 'DELETE_ALL_EXPENSES'];

// Forbidden titles - never create with these
const FORBIDDEN_TITLES = [
  "ok", "no", "sì", "si", "yes", "ciao", "salve", "grazie", "boh", 
  "vediamo", "pianifichiamo", "perfetto", "va bene", "top", "dai",
  "annulla", "lascia stare", "niente", "nulla", "stop", "task", "evento",
  "un", "una", "il", "la", "lo", "i", "gli", "le"
];

// Check if action is premium-only
function isPremiumOnlyAction(actionType: string): boolean {
  return PREMIUM_ONLY_ACTIONS.includes(actionType);
}

// FREE plan message for premium features
function getPremiumBlockedMessage(): AIResponse {
  return createResponse({
    intent: "NONE",
    reply: "⭐ Questa funzione (bulk delete) è disponibile nel piano Premium. Per ora puoi eliminare uno alla volta.",
    suggestions: ["Mostra task", "Mostra eventi"]
  });
}

// Cancel patterns (pure standalone)
const CANCEL_PATTERNS_STANDALONE = ["no", "annulla", "lascia stare", "stop", "niente", "cambia idea", "non importa", "lascia perdere", "basta"];

// Cancel patterns with continuation (e.g., "no, consigliami cosa fare oggi")
const CANCEL_PREFIX_PATTERNS = [
  /^no\s*,\s*(.+)$/i,           // "no, consigliami..."
  /^no\s+(?!task|evento|spesa|grazie)(.{3,})$/i, // "no consigliami..." (no comma, but not "no task")
  /^annulla\s*,?\s*(.+)$/i,     // "annulla, fammi vedere..."
  /^lascia\s*(?:stare|perdere)\s*,?\s*(.+)$/i, // "lascia stare, dimmi..."
  /^niente\s*,?\s*(.+)$/i,      // "niente, consigliami..."
  /^basta\s*,?\s*(.+)$/i,       // "basta, dimmi..."
  /^stop\s*,?\s*(.+)$/i,        // "stop, consigliami..."
];

// ADVICE patterns - NEVER ask for date/time on these
const ADVICE_PATTERNS = [
  /cosa\s+(?:posso|potrei|dovrei)\s+fare/i,
  /cosa\s+faccio\s+oggi/i,
  /consigliami/i,
  /(?:dammi|dai)\s+(?:un\s+)?(?:consiglio|idea|suggerimento)/i,
  /come\s+posso/i,
  /idee\s+per/i,
  /che\s+(?:cosa|ne)\s+(?:faccio|dici)/i,
  /aiutami\s+(?:a\s+)?(?:capire|decidere)/i,
  /non\s+so\s+(?:cosa|che)\s+fare/i,
];

interface PendingAction {
  type: string;
  payload: any;
  question: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

async function getPendingAction(supabase: any, userId: string): Promise<PendingAction | null> {
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

async function setPendingAction(supabase: any, userId: string, action: PendingAction | null): Promise<void> {
  await supabase
    .from("assistant_state")
    .upsert({
      user_id: userId,
      intent_payload: { pendingAction: action },
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
}

// Get full state for slot filling
async function getAssistantState(supabase: any, userId: string): Promise<any> {
  const { data } = await supabase
    .from("assistant_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  
  return data || { active_intent: 'NONE', intent_payload: {} };
}

// Update state for slot filling
async function updateAssistantState(supabase: any, userId: string, patch: any): Promise<void> {
  const current = await getAssistantState(supabase, userId);
  await supabase
    .from("assistant_state")
    .upsert({
      user_id: userId,
      ...current,
      ...patch,
      intent_payload: { ...current.intent_payload, ...patch.intent_payload },
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
}

// Clear assistant state
async function clearAssistantState(supabase: any, userId: string): Promise<void> {
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

// Normalize title - remove action verbs and articles
function normalizeTitle(raw: string): string {
  let title = raw.trim();
  const removePatterns = [
    /^(crea|aggiungi|nuovo|nuova|inserisci|registra|fai|fare|creare|aggiungere|segna|metti)\s+/i,
    /^(un|una|il|la|lo|l'|i|gli|le)\s+/i,
    /^(task|evento|spesa|promemoria|appuntamento)\s*/i,
  ];
  for (const pattern of removePatterns) {
    title = title.replace(pattern, "");
  }
  title = title.trim();
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  return title;
}

function isForbiddenTitle(title: string): boolean {
  const lower = title.toLowerCase().trim();
  return FORBIDDEN_TITLES.includes(lower) || lower.length < 2;
}

// Check for pure cancel (standalone words)
function isCancel(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return CANCEL_PATTERNS_STANDALONE.some(p => lower === p);
}

// Check for cancel with continuation - returns { isCancel, continuation }
function detectCancelWithContinuation(message: string): { isCancel: boolean; continuation: string | null } {
  const lower = message.toLowerCase().trim();
  
  // Pure cancel first
  if (CANCEL_PATTERNS_STANDALONE.some(p => lower === p)) {
    return { isCancel: true, continuation: null };
  }
  
  // Cancel prefix with continuation
  for (const pattern of CANCEL_PREFIX_PATTERNS) {
    const match = message.match(pattern);
    if (match && match[1] && match[1].trim().length > 2) {
      return { isCancel: true, continuation: match[1].trim() };
    }
  }
  
  return { isCancel: false, continuation: null };
}

// Check if message is an ADVICE request (NEVER ask for date/time)
function isAdviceRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return ADVICE_PATTERNS.some(p => p.test(lower));
}

function isConfirm(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return ["sì", "si", "yes", "ok", "confermo", "conferma", "va bene", "procedi", "fatto", "perfetto", "certo", "dai"].includes(lower);
}

// ============================================================================
// NORMALIZE INPUT (CRITICAL: Fix decimal comma → dot)
// ============================================================================

/**
 * Normalize user text BEFORE any parsing:
 * - Converts decimal comma to dot: 5,5 → 5.5, €5,50 → €5.50
 * - Does NOT touch date slashes: 26/01 stays 26/01
 */
function normalizeUserText(input: string): string {
  // Pattern: number followed by comma followed by 1-2 digits (decimal)
  // But NOT when it's part of a date (no digits immediately after the 2 decimal digits)
  return input.replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');
}

// ============================================================================
// DATE/TIME PARSING - ROBUST
// ============================================================================

function parseDateTime(text: string): { date: string | null; time: string | null } {
  const lower = text.toLowerCase()
    .replace(/[ìí]/g, 'i')
    .replace(/[àá]/g, 'a')
    .replace(/[èé]/g, 'e')
    .replace(/[òó]/g, 'o')
    .replace(/[ùú]/g, 'u');
    
  const now = new Date();
  let date: string | null = null;
  let time: string | null = null;
  
  // Parse date references
  if (lower.includes("oggi") || lower.includes("stasera") || lower.includes("stamattina")) {
    date = now.toISOString().split("T")[0];
  } else if (lower.includes("domani") || lower.includes("domai")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    date = tomorrow.toISOString().split("T")[0];
  } else if (lower.includes("dopodomani")) {
    const dayAfter = new Date(now);
    dayAfter.setDate(dayAfter.getDate() + 2);
    date = dayAfter.toISOString().split("T")[0];
  } else {
    // Check for day names (normalized, no accents)
    const days: Record<string, number> = {
      'domenica': 0, 'lunedi': 1, 'martedi': 2, 'mercoledi': 3,
      'giovedi': 4, 'venerdi': 5, 'sabato': 6,
      'dom': 0, 'lun': 1, 'mar': 2, 'mer': 3, 'gio': 4, 'ven': 5, 'sab': 6
    };
    
    for (const [dayName, dayNum] of Object.entries(days)) {
      const regex = new RegExp(`\\b${dayName}\\b`, 'i');
      if (regex.test(lower)) {
        const currentDay = now.getDay();
        let daysUntil = dayNum - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysUntil);
        date = targetDate.toISOString().split("T")[0];
        break;
      }
    }
  }
  
  // Parse time - comprehensive patterns
  const timePatterns = [
    /(?:alle|ore)\s*(\d{1,2})(?::(\d{2}))?/i,
    /\b(\d{1,2}):(\d{2})\b/,
    /\b(\d{1,2})\.(\d{2})\b/,
    /\b(\d{1,2})(?:\s*(?:di sera|pm))/i,
    /\b(\d{1,2})(?:\s*(?:di mattina|am))/i
  ];
  
  for (const pattern of timePatterns) {
    const match = lower.match(pattern);
    if (match) {
      let hour = parseInt(match[1], 10);
      const minute = match[2] ? parseInt(match[2], 10) : 0;
      
      // Adjust for PM/sera if needed
      if ((lower.includes("sera") || lower.includes("pm")) && hour < 12 && hour > 0) {
        hour += 12;
      }
      
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        break;
      }
    }
  }
  
  // Special time words
  if (!time) {
    if (lower.includes("mattina") || lower.includes("stamattina")) {
      time = "09:00";
    } else if (lower.includes("pranzo") || lower.includes("mezzogiorno")) {
      time = "12:30";
    } else if (lower.includes("pomeriggio")) {
      time = "15:00";
    } else if (lower.includes("sera") || lower.includes("stasera")) {
      time = "20:00";
    } else if (lower.includes("cena")) {
      time = "20:00";
    }
  }
  
  return { date, time };
}

// Check if input is a pure time (for slot filling when expecting time)
function isPureTime(text: string): string | null {
  const lower = text.toLowerCase().trim();
  
  // "20" or "8" - just a number that looks like an hour
  const hourOnly = lower.match(/^(\d{1,2})$/);
  if (hourOnly) {
    const hour = parseInt(hourOnly[1], 10);
    if (hour >= 0 && hour <= 23) {
      return `${hour.toString().padStart(2, "0")}:00`;
    }
  }
  
  // "20:00" or "8:30"
  const timeMatch = lower.match(/^(\d{1,2})[:\.](\d{2})$/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    }
  }
  
  // "alle 20" or "ore 8"
  const alleMatch = lower.match(/^(?:alle?|ore)\s*(\d{1,2})(?::(\d{2}))?$/);
  if (alleMatch) {
    const hour = parseInt(alleMatch[1], 10);
    const minute = alleMatch[2] ? parseInt(alleMatch[2], 10) : 0;
    if (hour >= 0 && hour <= 23) {
      return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    }
  }
  
  return null;
}

// Check if input is a pure date (for slot filling when expecting date)
function isPureDate(text: string): string | null {
  const lower = text.toLowerCase().trim()
    .replace(/[ìí]/g, 'i')
    .replace(/[àá]/g, 'a');
  const now = new Date();
  
  // "domani"
  if (/^domani?$/.test(lower)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }
  
  // "oggi"
  if (lower === "oggi") {
    return now.toISOString().split("T")[0];
  }
  
  // Weekday only
  const days: Record<string, number> = {
    'domenica': 0, 'lunedi': 1, 'martedi': 2, 'mercoledi': 3,
    'giovedi': 4, 'venerdi': 5, 'sabato': 6
  };
  
  for (const [dayName, dayNum] of Object.entries(days)) {
    if (lower === dayName || lower === dayName.substring(0, 3)) {
      const currentDay = now.getDay();
      let daysUntil = dayNum - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      return targetDate.toISOString().split("T")[0];
    }
  }
  
  return null;
}

function buildISODateTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

// ============================================================================
// EXPENSE PARSING - ROBUST
// ============================================================================

function parseExpense(text: string): { amount: number | null; category: string | null; description: string | null } {
  // CRITICAL: Normalize decimal comma to dot FIRST
  const normalized = normalizeUserText(text);
  const lower = normalized.toLowerCase();
  const original = normalized;
  
  // Parse amount - multiple patterns
  let amount: number | null = null;
  const amountPatterns = [
    /€\s*(\d+(?:\.\d{1,2})?)/,          // €5.50
    /(\d+(?:\.\d{1,2})?)\s*€/,          // 5.50€
    /(\d+(?:\.\d{1,2})?)\s*euro/i,      // 5.50 euro
    /(\d+(?:\.\d{1,2})?)\s*eur\b/i      // 5.50 eur
  ];
  
  for (const pattern of amountPatterns) {
    const match = lower.match(pattern);
    if (match) {
      amount = parseFloat(match[1]);
      break;
    }
  }
  
  // If no symbol/word, check for standalone number with word context
  // Pattern: "word number" or "number word" (e.g., "sigarette 5.50", "5.50 sigarette")
  if (!amount) {
    // Number followed by word (5.5 sigarette)
    const numWordMatch = original.match(/^(\d+(?:\.\d{1,2})?)\s+([a-zA-ZàèéìòùÀÈÉÌÒÙ\s]+)$/i);
    // Word followed by number (sigarette 5.5)
    const wordNumMatch = original.match(/^([a-zA-ZàèéìòùÀÈÉÌÒÙ\s]+?)\s+(\d+(?:\.\d{1,2})?)$/i);
    
    if (numWordMatch) {
      amount = parseFloat(numWordMatch[1]);
    } else if (wordNumMatch) {
      amount = parseFloat(wordNumMatch[2]);
    }
  }
  
  // Parse category based on keywords
  let category: string | null = null;
  const categoryMap: Record<string, string[]> = {
    "cibo": ["pranzo", "cena", "colazione", "ristorante", "pizza", "sushi", "caffè", "caffe", "bar", "spesa", "supermercato", "alimentari", "pasto", "mangiare", "mangiar"],
    "trasporti": ["benzina", "treno", "bus", "metro", "taxi", "uber", "parcheggio", "autostrada", "pedaggio", "carburante", "gasolio"],
    "shopping": ["vestiti", "scarpe", "abbigliamento", "amazon", "shopping", "acquisti", "negozio"],
    "salute": ["farmacia", "medico", "dottore", "medicine", "ospedale", "dentista", "visita"],
    "svago": ["cinema", "teatro", "concerto", "netflix", "spotify", "giochi", "videogiochi", "abbonamento"],
    "casa": ["affitto", "bollette", "luce", "gas", "acqua", "internet", "telefono", "pulizie"],
    "vizi": ["sigarette", "alcol", "birra", "vino", "cocktail", "fumo", "tabacco"]
  };
  
  for (const [cat, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(k => lower.includes(k))) {
      category = cat;
      break;
    }
  }
  
  // Extract description - use the non-numeric part
  let description: string | null = null;
  const cleanText = original
    .replace(/€\s*\d+(?:[.,]\d{1,2})?/g, '')
    .replace(/\d+(?:[.,]\d{1,2})?\s*€/g, '')
    .replace(/\d+(?:[.,]\d{1,2})?\s*euro/gi, '')
    .replace(/\d+(?:[.,]\d{1,2})?/g, '')
    .trim();
  
  if (cleanText.length > 1) {
    description = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
    // Use description as category if no category found
    if (!category) {
      category = cleanText.toLowerCase();
    }
  }
  
  return { amount, category: category || "altro", description };
}

// ============================================================================
// RECURRING TASK PARSING
// ============================================================================

interface RecurringRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  byHour?: number;
  byMinute?: number;
  byDay?: string[];
}

function parseRecurring(text: string): RecurringRule | null {
  const lower = text.toLowerCase()
    .replace(/[ìí]/g, 'i')
    .replace(/[àá]/g, 'a');
  
  // "ogni giorno", "quotidiano", "tutti i giorni"
  if (/\b(ogni\s+giorno|quotidian|tutti\s+i\s+giorni|ogni\s+mattina|ogni\s+sera)\b/.test(lower)) {
    const { time } = parseDateTime(text);
    const rule: RecurringRule = { freq: 'DAILY' };
    if (time) {
      const [h, m] = time.split(':').map(Number);
      rule.byHour = h;
      rule.byMinute = m;
    }
    return rule;
  }
  
  // "ogni lunedì", "ogni settimana il lunedì"
  const weeklyMatch = lower.match(/\bogni\s+(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/);
  if (weeklyMatch) {
    const dayMap: Record<string, string> = {
      'lunedi': 'MO', 'martedi': 'TU', 'mercoledi': 'WE',
      'giovedi': 'TH', 'venerdi': 'FR', 'sabato': 'SA', 'domenica': 'SU'
    };
    const { time } = parseDateTime(text);
    const rule: RecurringRule = { freq: 'WEEKLY', byDay: [dayMap[weeklyMatch[1]]] };
    if (time) {
      const [h, m] = time.split(':').map(Number);
      rule.byHour = h;
      rule.byMinute = m;
    }
    return rule;
  }
  
  // "settimanale", "ogni settimana"
  if (/\b(settimanale|ogni\s+settimana)\b/.test(lower)) {
    const { time } = parseDateTime(text);
    const rule: RecurringRule = { freq: 'WEEKLY' };
    if (time) {
      const [h, m] = time.split(':').map(Number);
      rule.byHour = h;
      rule.byMinute = m;
    }
    return rule;
  }
  
  // "ogni mese", "mensile"
  if (/\b(ogni\s+mese|mensile)\b/.test(lower)) {
    const { time } = parseDateTime(text);
    const rule: RecurringRule = { freq: 'MONTHLY' };
    if (time) {
      const [h, m] = time.split(':').map(Number);
      rule.byHour = h;
      rule.byMinute = m;
    }
    return rule;
  }
  
  return null;
}

// ============================================================================
// DETERMINISTIC ROUTER (Phase 1 - Regex/Heuristics)
// ============================================================================

interface RouterResult {
  matched: boolean;
  intent?: AIIntent;
  action?: AIAction;
  missingFields?: string[];
  reply?: string;
  needsConfirmation?: boolean;
  confirmationQuestion?: string;
  suggestions?: string[];
}

function deterministicRouter(message: string, state?: any): RouterResult {
  const lower = message.toLowerCase().trim()
    .replace(/[ìí]/g, 'i')
    .replace(/[àá]/g, 'a');
  const { date, time } = parseDateTime(message);
  
  // === EXPENSE DETECTION (HIGHEST PRIORITY FOR MONEY PATTERNS) ===
  // Patterns: "sigarette €5,50", "pranzo 12 euro", "€20 benzina", "5.50 sigarette", "5,5 sigarette"
  // CRITICAL: Also detect "number word" or "word number" patterns for quick expense entry
  const normalizedMessage = normalizeUserText(message);
  const expensePatterns = [
    /€\s*\d+/,
    /\d+(?:\.\d{1,2})?\s*€/,
    /\d+(?:\.\d{1,2})?\s*euro/i,
    /\d+(?:\.\d{1,2})?\s*eur\b/i,
    // Simple patterns like "5.5 sigarette" or "sigarette 5.5"
    /^\d+(?:\.\d{1,2})?\s+[a-zA-ZàèéìòùÀÈÉÌÒÙ]+/i,
    /^[a-zA-ZàèéìòùÀÈÉÌÒÙ]+\s+\d+(?:\.\d{1,2})?$/i,
  ];
  
  if (expensePatterns.some(p => p.test(normalizedMessage))) {
    const { amount, category, description } = parseExpense(message);
    if (amount && amount > 0) {
      return {
        matched: true,
        intent: "RECORD_EXPENSE",
        action: {
          type: "RECORD_EXPENSE",
          amount,
          category: category || 'altro'
        },
        reply: `Registro €${amount.toFixed(2)} (${category || 'altro'})?`,
        needsConfirmation: true,
        confirmationQuestion: `Registro €${amount.toFixed(2)} in ${category || 'altro'}?`
      };
    }
  }
  
  // === BULK DELETE PATTERNS (MUST COME BEFORE EVENT PATTERNS) ===
  if (/(?:elimina|cancella|rimuovi)\s+(?:tutt[eio]|tutti)\s+(?:i\s+)?task/i.test(lower)) {
    return {
      matched: true,
      intent: "DELETE_TASKS",
      action: { type: "DELETE_ALL_TASKS" },
      reply: "Elimino tutti i task?",
      needsConfirmation: true,
      confirmationQuestion: "Elimino tutti i task?"
    };
  }
  
  if (/(?:elimina|cancella|rimuovi)\s+(?:tutt[eio]|tutti)\s+(?:gli\s+)?eventi/i.test(lower)) {
    return {
      matched: true,
      intent: "DELETE_EVENTS",
      action: { type: "DELETE_ALL_EVENTS" },
      reply: "Elimino tutti gli eventi?",
      needsConfirmation: true,
      confirmationQuestion: "Elimino tutti gli eventi?"
    };
  }
  
  if (/(?:elimina|cancella|rimuovi)\s+(?:tutt[eio]|tutte)\s+(?:le\s+)?spese/i.test(lower)) {
    return {
      matched: true,
      intent: "DELETE_EXPENSES",
      action: { type: "DELETE_ALL_EXPENSES" },
      reply: "Elimino tutte le spese?",
      needsConfirmation: true,
      confirmationQuestion: "Elimino tutte le spese?"
    };
  }
  
  // === EVENT CREATION WITH DATE/TIME ===
  // "padel domani alle 20", "cena sabato 20:30", "riunione lunedì ore 10"
  const eventDatePatterns = [
    /\b(oggi|domani|domai|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/i,
  ];
  
  const hasDatePattern = eventDatePatterns.some(p => p.test(lower));
  const hasTimePattern = /(?:alle|ore)\s*\d+|\d+[:\.]?\d*/.test(lower);
  
  if (hasDatePattern || (hasTimePattern && date)) {
    // Extract title from the message (remove date/time parts)
    let title = message;
    title = title.replace(/\b(oggi|domani|domai|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/gi, "");
    title = title.replace(/\b(alle|ore)\s*\d{1,2}(:\d{2})?\b/gi, "");
    title = title.replace(/\b\d{1,2}:\d{2}\b/g, "");
    title = title.replace(/\b\d{1,2}\.\d{2}\b/g, "");
    title = title.replace(/\b(di sera|di mattina|pomeriggio|stasera|stamattina)\b/gi, "");
    title = normalizeTitle(title);
    
    if (title && !isForbiddenTitle(title)) {
      if (date && time) {
        // Complete event
        const start_at = buildISODateTime(date, time);
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: {
            type: "CREATE_EVENT",
            title,
            start_at
          },
          reply: `Creo "${title}" per ${formatDateIT(date)} alle ${time}?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo "${title}" per ${formatDateIT(date)} alle ${time}?`
        };
      } else if (date && !time) {
        // Missing time - store partial and ask
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: { type: "NONE", title },
          missingFields: ["time"],
          reply: `A che ora "${title}"?`,
          needsConfirmation: true,
          confirmationQuestion: `A che ora "${title}"?`
        };
      } else if (time && !date) {
        // Missing date - store partial and ask
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: { type: "NONE", title },
          missingFields: ["date"],
          reply: `Che giorno "${title}"?`,
          needsConfirmation: true,
          confirmationQuestion: `Che giorno "${title}"?`
        };
      }
    }
  }
  
  // === RECURRING TASK DETECTION ===
  const recurring = parseRecurring(message);
  if (recurring && /\b(crea|aggiungi|nuovo|nuova|ricorda|promemoria|task)\b/i.test(lower)) {
    let title = message;
    title = title.replace(/\b(ogni\s+giorno|quotidian|tutti\s+i\s+giorni|ogni\s+mattina|ogni\s+sera|settimanale|ogni\s+settimana|ogni\s+mese|mensile)\b/gi, "");
    title = title.replace(/\b(ogni\s+(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica))\b/gi, "");
    title = title.replace(/\b(alle|ore)\s*\d{1,2}(:\d{2})?\b/gi, "");
    title = normalizeTitle(title);
    
    if (title && !isForbiddenTitle(title)) {
      return {
        matched: true,
        intent: "CREATE_TASK",
        action: {
          type: "CREATE_TASK",
          title,
          recurring
        },
        reply: `Creo task ricorrente "${title}"?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo task ricorrente "${title}"?`
      };
    }
  }
  
  // === EXPLICIT CREATE COMMANDS ===
  // "crea task lavoro", "aggiungi evento riunione"
  const createTaskMatch = lower.match(/^(crea|aggiungi|nuovo|nuova|fai|inserisci)\s+(task|attivita|promemoria|to-?do)\s+(.+)/i);
  if (createTaskMatch) {
    const title = normalizeTitle(createTaskMatch[3]);
    if (title && !isForbiddenTitle(title)) {
      return {
        matched: true,
        intent: "CREATE_TASK",
        action: {
          type: "CREATE_TASK",
          title
        },
        reply: `Creo "${title}"?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo "${title}"?`
      };
    }
  }
  
  const createEventMatch = lower.match(/^(crea|aggiungi|nuovo|nuova)\s+(evento|appuntamento|meeting)\s+(.+)/i);
  if (createEventMatch) {
    const rawTitle = createEventMatch[3];
    const { date: parsedDate, time: parsedTime } = parseDateTime(rawTitle);
    let title = normalizeTitle(rawTitle);
    
    // Remove date/time from title if present
    if (parsedDate || parsedTime) {
      title = rawTitle;
      title = title.replace(/\b(oggi|domani|domai|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/gi, "");
      title = title.replace(/\b(alle|ore)\s*\d{1,2}(:\d{2})?\b/gi, "");
      title = title.replace(/\b\d{1,2}:\d{2}\b/g, "");
      title = normalizeTitle(title);
    }
    
    if (title && !isForbiddenTitle(title)) {
      if (parsedDate && parsedTime) {
        const start_at = buildISODateTime(parsedDate, parsedTime);
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: { type: "CREATE_EVENT", title, start_at },
          reply: `Creo "${title}" per ${formatDateIT(parsedDate)} alle ${parsedTime}?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo "${title}"?`
        };
      }
      
      const missing: string[] = [];
      if (!parsedDate) missing.push('date');
      if (!parsedTime) missing.push('time');
      
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "NONE", title },
        missingFields: missing,
        reply: missing.includes('date') && missing.includes('time') ? `Quando "${title}"?` : 
               missing.includes('date') ? `Che giorno "${title}"?` : `A che ora "${title}"?`,
        needsConfirmation: true,
        confirmationQuestion: `Quando "${title}"?`
      };
    }
  }
  
  // === AMBIGUOUS CREATE (needs clarification) ===
  // "crea padel" - could be task or event
  const ambiguousCreateMatch = lower.match(/^(crea|aggiungi|nuovo|nuova|fai)\s+(.+)/i);
  if (ambiguousCreateMatch) {
    const content = ambiguousCreateMatch[2];
    const title = normalizeTitle(content);
    
    // If no explicit type indicator, ask
    if (title && !isForbiddenTitle(title) && 
        !/\b(task|evento|appuntamento|promemoria|attivita)\b/i.test(content)) {
      return {
        matched: true,
        intent: "NONE",
        action: { type: "NONE", title },
        missingFields: ["type"],
        reply: `"${title}": task o evento?`,
        needsConfirmation: true,
        confirmationQuestion: `"${title}": task o evento?`,
        suggestions: ["Task", "Evento"]
      };
    }
  }
  
  // === INCOMPLETE CREATE COMMANDS ===
  if (/^(crea|aggiungi|nuovo|nuova)\s+(un\s+)?(task|attivita|promemoria|to-?do)\s*$/i.test(lower)) {
    return {
      matched: true,
      intent: "CREATE_TASK",
      action: { type: "NONE" },
      missingFields: ["title"],
      reply: "Cosa?",
      needsConfirmation: true,
      confirmationQuestion: "Cosa?"
    };
  }
  
  if (/^(crea|aggiungi|nuovo|nuova)\s+(un\s+)?(evento|appuntamento|meeting)\s*$/i.test(lower)) {
    return {
      matched: true,
      intent: "CREATE_EVENT",
      action: { type: "NONE" },
      missingFields: ["title", "date", "time"],
      reply: "Che evento?",
      needsConfirmation: true,
      confirmationQuestion: "Che evento?"
    };
  }
  
  // === QUERY COMMANDS ===
  if (/\b(mostra|vedi|lista|elenco|quali|quanti)\s*(i\s+)?(miei\s+)?(task|attivita|cose da fare|to-?do)/i.test(lower)) {
    return { matched: true, intent: "QUERY_TASKS", action: { type: "QUERY_TASKS" } };
  }
  
  if (/\b(mostra|vedi|lista|elenco|quali|quanti)\s*(i\s+)?(miei\s+)?(eventi|appuntamenti|impegni)/i.test(lower)) {
    return { matched: true, intent: "QUERY_EVENTS", action: { type: "QUERY_EVENTS" } };
  }
  
  if (/\b(mostra|vedi|quanto|quante|budget|spese|speso)\s*/i.test(lower) && 
      /\b(spese|budget|speso|soldi|euro|€)/i.test(lower)) {
    return { matched: true, intent: "QUERY_BUDGET", action: { type: "QUERY_BUDGET" } };
  }
  
  // === GREETINGS & SMALL TALK ===
  const greetings = ["ciao", "salve", "buongiorno", "buonasera", "hey", "ehi", "come va", "come stai", "tutto bene"];
  if (greetings.some(g => lower.startsWith(g) || lower === g)) {
    return {
      matched: true,
      intent: "SMALL_TALK",
      reply: randomGreeting()
    };
  }
  
  // === HELP/CAPABILITIES ===
  if (/\b(cosa puoi fare|aiut|help|come funzion|cosa sai fare)\b/i.test(lower)) {
    return {
      matched: true,
      intent: "ADVICE",
      reply: "Posso aiutarti a gestire task, eventi e spese. Prova: \"padel domani alle 20\" o \"sigarette €5\".",
      suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
    };
  }
  
  // Not matched - will use LLM or slot filling
  return { matched: false };
}

// ============================================================================
// SLOT FILLING - Handle follow-ups when state is active
// ============================================================================

function handleSlotFilling(message: string, state: any): RouterResult | null {
  const activeIntent = state.active_intent;
  const payload = state.intent_payload || {};
  const pendingAction = payload.pendingAction;
  
  if (!activeIntent || activeIntent === 'NONE') {
    return null;
  }
  
  console.log(`[AI-FREE] Slot filling: intent=${activeIntent}, message="${message}"`);
  
  // Handle CREATE_EVENT slot filling
  if (activeIntent === 'CREATE_EVENT') {
    const title = payload.title || payload.pendingTitle;
    const existingDate = payload.date || payload.pending_date;
    const existingTime = payload.time || payload.pending_time;
    
    // Check if message is pure time (when we're waiting for time)
    const pureTime = isPureTime(message);
    if (pureTime && title && existingDate) {
      const start_at = buildISODateTime(existingDate, pureTime);
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: {
          type: "CREATE_EVENT",
          title,
          start_at
        },
        reply: `Creo "${title}" per ${formatDateIT(existingDate)} alle ${pureTime}?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo "${title}"?`
      };
    }
    
    // Check if message is pure date (when we're waiting for date)
    const pureDate = isPureDate(message);
    if (pureDate && title && !existingDate) {
      if (existingTime) {
        const start_at = buildISODateTime(pureDate, existingTime);
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: {
            type: "CREATE_EVENT",
            title,
            start_at
          },
          reply: `Creo "${title}" per ${formatDateIT(pureDate)} alle ${existingTime}?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo "${title}"?`
        };
      } else {
        // Have date now, need time
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: { type: "NONE", title },
          missingFields: ["time"],
          reply: "A che ora?",
          needsConfirmation: true,
          confirmationQuestion: "A che ora?"
        };
      }
    }
    
    // Try to extract both date and time from message
    const { date, time } = parseDateTime(message);
    
    // Message like "domani 20" or "sabato alle 20"
    if (date && time && title) {
      const start_at = buildISODateTime(date, time);
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: {
          type: "CREATE_EVENT",
          title,
          start_at
        },
        reply: `Creo "${title}" per ${formatDateIT(date)} alle ${time}?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo "${title}"?`
      };
    }
    
    // Only date extracted
    if (date && !time && title) {
      if (existingTime) {
        const start_at = buildISODateTime(date, existingTime);
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: {
            type: "CREATE_EVENT",
            title,
            start_at
          },
          reply: `Creo "${title}" per ${formatDateIT(date)} alle ${existingTime}?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo "${title}"?`
        };
      }
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "NONE", title },
        missingFields: ["time"],
        reply: "A che ora?",
        needsConfirmation: true,
        confirmationQuestion: "A che ora?"
      };
    }
    
    // Only time extracted (pure number like "20" during event creation)
    if (pureTime && title && existingDate) {
      const start_at = buildISODateTime(existingDate, pureTime);
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: {
          type: "CREATE_EVENT",
          title,
          start_at
        },
        reply: `Creo "${title}" per ${formatDateIT(existingDate)} alle ${pureTime}?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo "${title}"?`
      };
    }
  }
  
  // Handle RECORD_EXPENSE slot filling
  if (activeIntent === 'RECORD_EXPENSE') {
    const existingAmount = payload.amount;
    const existingCategory = payload.category;
    
    // Check if message is just a number (amount)
    const numMatch = message.match(/^(\d+(?:[.,]\d{1,2})?)$/);
    if (numMatch && !existingAmount) {
      const amount = parseFloat(numMatch[1].replace(",", "."));
      if (existingCategory) {
        return {
          matched: true,
          intent: "RECORD_EXPENSE",
          action: {
            type: "RECORD_EXPENSE",
            amount,
            category: existingCategory
          },
          reply: `Registro €${amount.toFixed(2)} (${existingCategory})?`,
          needsConfirmation: true,
          confirmationQuestion: `Registro €${amount.toFixed(2)}?`
        };
      }
      return {
        matched: true,
        intent: "RECORD_EXPENSE",
        action: { type: "NONE", amount },
        missingFields: ["category"],
        reply: "Per cosa?",
        needsConfirmation: true,
        confirmationQuestion: "Per cosa?"
      };
    }
    
    // Check if message is category (when we have amount)
    if (existingAmount && !existingCategory) {
      const category = message.trim().toLowerCase();
      if (category.length >= 2 && !category.match(/^\d/)) {
        return {
          matched: true,
          intent: "RECORD_EXPENSE",
          action: {
            type: "RECORD_EXPENSE",
            amount: existingAmount,
            category
          },
          reply: `Registro €${existingAmount.toFixed(2)} (${category})?`,
          needsConfirmation: true,
          confirmationQuestion: `Registro?`
        };
      }
    }
  }
  
  return null;
}

function randomGreeting(): string {
  const greetings = [
    "Ciao! Come posso aiutarti?",
    "Ehi! Dimmi pure.",
    "Buongiorno! Cosa posso fare per te?",
    "Ciao! Pronto ad organizzare la giornata?"
  ];
  return greetings[Math.floor(Math.random() * greetings.length)];
}

function formatDateIT(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

// ============================================================================
// FETCH USER CONTEXT
// ============================================================================

async function fetchUserContext(supabase: any, userId: string) {
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
// EXECUTE ACTIONS
// ============================================================================

async function executeAction(supabase: any, userId: string, action: AIAction): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    switch (action.type) {
      case "CREATE_TASK": {
        const title = normalizeTitle(action.title || "");
        if (isForbiddenTitle(title)) {
          return { success: false, message: "Titolo non valido." };
        }
        
        const insertData: any = {
          user_id: userId,
          title: title,
          priority: "medium",
          due_date: action.due_date || null,
          completed: false
        };
        
        // Note: recurring_rule would need a DB column - for now just mention in response
        const { data, error } = await supabase.from("todos").insert(insertData).select().single();
        
        if (error) throw error;
        
        let message = `✅ Task creato: "${title}"`;
        if (action.recurring) {
          message += ` (ricorrente: ${action.recurring.freq})`;
        }
        
        return { success: true, message, data };
      }
      
      case "CREATE_EVENT": {
        const title = normalizeTitle(action.title || "");
        if (isForbiddenTitle(title)) {
          return { success: false, message: "Titolo non valido." };
        }
        if (!action.start_at) {
          return { success: false, message: "Data/ora mancanti." };
        }
        const startDate = new Date(action.start_at);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1 hour
        
        const { data, error } = await supabase.from("calendar_events").insert({
          user_id: userId,
          title: title,
          start_time: action.start_at,
          end_time: action.end_at || endDate.toISOString()
        }).select().single();
        if (error) throw error;
        const dateStr = startDate.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
        const timeStr = startDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        return { success: true, message: `✅ Evento creato: "${title}" — ${dateStr} ${timeStr}`, data };
      }
      
      case "RECORD_EXPENSE": {
        if (!action.amount || action.amount <= 0) {
          return { success: false, message: "Importo non valido." };
        }
        const { data, error } = await supabase.from("expenses").insert({
          user_id: userId,
          amount: action.amount,
          category: action.category || "altro",
          date: new Date().toISOString().split("T")[0]
        }).select().single();
        if (error) throw error;
        return { success: true, message: `✅ Spesa salvata: €${action.amount.toFixed(2)} — ${action.category || 'altro'}`, data };
      }
      
      case "DELETE_ALL_TASKS": {
        const { error } = await supabase.from("todos").delete().eq("user_id", userId);
        if (error) throw error;
        return { success: true, message: "✅ Tutti i task eliminati." };
      }
      
      case "DELETE_ALL_EVENTS": {
        const { error } = await supabase.from("calendar_events").delete().eq("user_id", userId);
        if (error) throw error;
        return { success: true, message: "✅ Tutti gli eventi eliminati." };
      }
      
      case "DELETE_ALL_EXPENSES": {
        const { error } = await supabase.from("expenses").delete().eq("user_id", userId);
        if (error) throw error;
        return { success: true, message: "✅ Tutte le spese eliminate." };
      }
      
      default:
        return { success: false, message: `Azione non supportata: ${action.type}` };
    }
  } catch (error) {
    console.error("[AI-FREE] Action execution error:", error);
    return { success: false, message: "Errore nell'esecuzione." };
  }
}

// ============================================================================
// LLM SYSTEM PROMPT (Phase 2 - for unmatched messages)
// ============================================================================

function buildSystemPrompt(context: any): string {
  const pendingTasks = context.todos.filter((t: any) => !t.completed);
  const todayEvents = context.events.slice(0, 5);
  const totalExpenses = context.expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const budget = context.budget?.amount || 0;
  
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return `Sei un assistente personale italiano. Rispondi SOLO in JSON valido.

DATA OGGI: ${today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
DOMANI: ${tomorrow.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}

CONTESTO UTENTE:
- Task aperti: ${pendingTasks.length} (${pendingTasks.slice(0, 3).map((t: any) => t.title).join(", ") || "nessuno"})
- Eventi prossimi: ${todayEvents.length}
- Spese mese: €${totalExpenses.toFixed(2)} / €${budget}

CONTRATTO JSON OBBLIGATORIO - NESSUNA ECCEZIONE:
{
  "reply": "risposta breve",
  "intent": "CREATE_TASK|CREATE_EVENT|RECORD_EXPENSE|QUERY_TASKS|QUERY_EVENTS|QUERY_BUDGET|ADVICE|SMALL_TALK",
  "action": {"type": "CREATE_TASK|CREATE_EVENT|RECORD_EXPENSE|NONE", "title": "...", "start_at": "ISO", "amount": 0, "category": "..."},
  "needsConfirmation": true/false,
  "confirmationQuestion": "domanda se needsConfirmation=true",
  "missingFields": ["title", "date", "time", "amount", "category"]
}

REGOLE RIGIDE:
1. Se l'utente chiede un'AZIONE (crea, aggiungi, registra, elimina) → intent DEVE essere un'azione, MAI "NONE"
2. Se mancano dati per l'azione → imposta missingFields e fai UNA domanda breve
3. MAI rispondere "Dimmi di più" o frasi vaghe
4. Per eventi: se manca data o ora, chiedi SOLO quella mancante
5. Per spese: se manca importo o categoria, chiedi SOLO quello mancante
6. Titoli: rimuovi prefissi (crea/aggiungi/fai) - "crea task lavoro" → title:"Lavoro"
7. Date: "domai" = domani, interpreta giorni settimana correttamente

ESEMPI:
- "padel domani alle 20" → intent:CREATE_EVENT, action:{type:CREATE_EVENT, title:"Padel", start_at:"ISO"}
- "sigarette 5 euro" → intent:RECORD_EXPENSE, action:{type:RECORD_EXPENSE, amount:5, category:"vizi"}
- "crea evento" → intent:CREATE_EVENT, missingFields:["title","date","time"], reply:"Che evento?"

Rispondi SOLO JSON, niente altro.`;
}

// ============================================================================
// OPENROUTER API CALL
// ============================================================================

const DEFAULT_MODEL = "deepseek/deepseek-r1-0528:free";

async function callOpenRouterAI(systemPrompt: string, userMessage: string): Promise<any> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  
  if (!apiKey || apiKey.trim() === "" || !apiKey.startsWith("sk-or-")) {
    console.error("[AI-FREE] Invalid or missing OPENROUTER_API_KEY");
    return {
      intent: "ERROR",
      reply: "Configurazione AI non valida. Riprova più tardi.",
      action: { type: "NONE" },
      needsConfirmation: false,
      confirmationQuestion: null,
      missingFields: []
    };
  }
  
  let model = Deno.env.get("OPENROUTER_MODEL") || DEFAULT_MODEL;
  if (!model.includes("/")) {
    model = DEFAULT_MODEL;
  }
  
  console.log(`[AI-FREE] Calling LLM: ${model}`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://daily-sync-keeper.lovable.app",
        "X-Title": "Daily Sync Keeper"
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        max_tokens: 800,
        temperature: 0.3
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI-FREE] API error: status=${response.status}, error=${errorText.substring(0, 200)}`);
      return {
        intent: "ERROR",
        reply: response.status === 401 ? "Configurazione AI non valida." : "Servizio AI non disponibile.",
        action: { type: "NONE" },
        needsConfirmation: false,
        confirmationQuestion: null,
        missingFields: []
      };
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    console.log("[AI-FREE] Raw LLM response:", content.substring(0, 600));
    
    // Parse JSON
    try {
      let cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      const jsonMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)```/) || cleanContent.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : cleanContent.trim();
      const parsed = JSON.parse(jsonStr);
      
      // Ensure required fields
      if (!parsed.reply) parsed.reply = "Come posso aiutarti?";
      if (!parsed.intent) parsed.intent = "SMALL_TALK";
      if (!parsed.action) parsed.action = { type: "NONE" };
      if (parsed.needsConfirmation === undefined) parsed.needsConfirmation = false;
      if (!parsed.missingFields) parsed.missingFields = [];
      
      return parsed;
      
    } catch (e) {
      console.error("[AI-FREE] JSON parse error");
      let cleanText = content.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```json|```/g, "").trim();
      if (cleanText.length > 5 && cleanText.length < 400) {
        return {
          reply: cleanText,
          intent: "SMALL_TALK",
          action: { type: "NONE" },
          needsConfirmation: false,
          confirmationQuestion: null,
          missingFields: []
        };
      }
      return {
        reply: "Puoi provare a riformulare?",
        intent: "ADVICE",
        action: { type: "NONE" },
        needsConfirmation: false,
        confirmationQuestion: null,
        missingFields: [],
        suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
      };
    }
    
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[AI-FREE] Timeout");
      return {
        intent: "ERROR",
        reply: "Richiesta scaduta. Riprova.",
        action: { type: "NONE" },
        needsConfirmation: false,
        confirmationQuestion: null,
        missingFields: []
      };
    }
    
    console.error("[AI-FREE] Error:", error instanceof Error ? error.message : "Unknown");
    return {
      intent: "ERROR",
      reply: "Errore imprevisto. Riprova.",
      action: { type: "NONE" },
      needsConfirmation: false,
      confirmationQuestion: null,
      missingFields: []
    };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { userMessage, locale = "it" } = body;
    
    if (!userMessage || typeof userMessage !== "string") {
      return new Response(
        JSON.stringify(createResponse({ intent: "ERROR", reply: "Messaggio richiesto" })),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Extract and validate JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[AI-FREE] Missing authorization header");
      return new Response(
        JSON.stringify(createResponse({ intent: "ERROR", reply: "Non autenticato." })),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: userData, error: userError } = await authClient.auth.getUser();
    
    if (userError || !userData?.user?.id) {
      console.error("[AI-FREE] JWT verification failed:", userError?.message || "No user");
      return new Response(
        JSON.stringify(createResponse({ intent: "ERROR", reply: "Sessione scaduta." })),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const userId = userData.user.id;
    const message = userMessage.trim();
    console.log(`[AI-FREE] User ${userId}: "${message}"`);
    
    // Get current state for slot filling
    const state = await getAssistantState(supabase, userId);
    console.log(`[AI-FREE] Current state: active_intent=${state.active_intent}`);
    
    // === UI ACTIONS (bypass all routing) ===
    if (message.startsWith("__UI_ACTION__:")) {
      const action = message.replace("__UI_ACTION__:", "");
      const context = await fetchUserContext(supabase, userId);
      
      switch (action) {
        case "SHOW_TASKS": {
          const pending = context.todos.filter((t: any) => !t.completed);
          if (pending.length === 0) {
            return jsonResponse(createResponse({ 
              intent: "QUERY_TASKS", 
              reply: "Non hai task 🎉" 
            }));
          }
          const list = pending.map((t: any, i: number) => `${i + 1}. ${t.title}`).join("\n");
          return jsonResponse(createResponse({ 
            intent: "QUERY_TASKS", 
            reply: `📋 Task:\n${list}`,
            suggestions: ["Completa uno", "Aggiungi task"]
          }));
        }
        
        case "SHOW_EVENTS": {
          if (context.events.length === 0) {
            return jsonResponse(createResponse({ 
              intent: "QUERY_EVENTS", 
              reply: "Non hai eventi 📅" 
            }));
          }
          const list = context.events.map((e: any, i: number) => {
            const d = new Date(e.start_time).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
            return `${i + 1}. ${e.title} — ${d}`;
          }).join("\n");
          return jsonResponse(createResponse({ 
            intent: "QUERY_EVENTS", 
            reply: `📅 Eventi:\n${list}` 
          }));
        }
        
        case "SHOW_EXPENSES": {
          const total = context.expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
          const budget = context.budget?.amount || 0;
          return jsonResponse(createResponse({ 
            intent: "QUERY_BUDGET", 
            reply: `💰 Spese: €${total.toFixed(2)} / €${budget}` 
          }));
        }
        
        case "ADD_TASK":
          await updateAssistantState(supabase, userId, {
            active_intent: 'CREATE_TASK',
            intent_payload: { expectedInput: 'TASK_TITLE' }
          });
          return jsonResponse(createResponse({ 
            intent: "CREATE_TASK", 
            reply: "Cosa?",
            needsConfirmation: true,
            confirmationQuestion: "Cosa?",
            missingFields: ["title"]
          }));
        
        default:
          return jsonResponse(createResponse({ reply: "Comando non riconosciuto." }));
      }
    }
    
    // === CANCEL + CONTINUATION HANDLING (CRITICAL: BEFORE ALL OTHER ROUTING) ===
    const cancelResult = detectCancelWithContinuation(message);
    if (cancelResult.isCancel) {
      console.log(`[AI-FREE] Cancel detected, continuation: ${cancelResult.continuation}`);
      
      // Clear state FIRST
      await clearAssistantState(supabase, userId);
      await setPendingAction(supabase, userId, null);
      
      // If there's a continuation, process it as a fresh message
      if (cancelResult.continuation) {
        console.log(`[AI-FREE] Processing continuation: "${cancelResult.continuation}"`);
        // DON'T return cancel response - recursively process the continuation
        // We need to process the continuation through the full pipeline
        // So we reassign message and fall through to the rest of the handler
        // This is handled by re-calling the router with cleared state
        
        // Check if continuation is an ADVICE request (GUARDRAIL)
        if (isAdviceRequest(cancelResult.continuation)) {
          return jsonResponse(createResponse({
            intent: "ADVICE",
            reply: "Potresti: controllare i tuoi task, pianificare un nuovo evento, o registrare una spesa. Cosa preferisci?",
            suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
          }));
        }
        
        // Process continuation through deterministic router
        const contRouterResult = deterministicRouter(cancelResult.continuation, { active_intent: 'NONE' });
        if (contRouterResult.matched) {
          // Handle queries and advice directly
          if (contRouterResult.intent === "SMALL_TALK" || contRouterResult.intent === "ADVICE") {
            return jsonResponse(createResponse({
              intent: contRouterResult.intent,
              reply: contRouterResult.reply!,
              suggestions: contRouterResult.suggestions
            }));
          }
          // For other matched intents, set up state and return
          if (contRouterResult.needsConfirmation || (contRouterResult.missingFields && contRouterResult.missingFields.length > 0)) {
            if (contRouterResult.intent && contRouterResult.intent !== "NONE") {
              const newPayload: any = { expectedInput: contRouterResult.missingFields?.[0]?.toUpperCase() };
              if (contRouterResult.action?.title) newPayload.title = contRouterResult.action.title;
              await updateAssistantState(supabase, userId, {
                active_intent: contRouterResult.intent,
                intent_payload: newPayload
              });
            }
          }
          return jsonResponse(createResponse({
            intent: contRouterResult.intent || "NONE",
            action: contRouterResult.action || { type: "NONE" },
            reply: contRouterResult.reply!,
            needsConfirmation: contRouterResult.needsConfirmation || false,
            confirmationQuestion: contRouterResult.confirmationQuestion || null,
            missingFields: contRouterResult.missingFields || [],
            suggestions: contRouterResult.suggestions
          }));
        }
        
        // Continuation not matched by router - use LLM
        const context = await fetchUserContext(supabase, userId);
        const systemPrompt = buildSystemPrompt(context);
        const aiResponse = await callOpenRouterAI(systemPrompt, cancelResult.continuation);
        return jsonResponse(createResponse({
          intent: aiResponse.intent,
          action: aiResponse.action || { type: "NONE" },
          reply: aiResponse.reply,
          needsConfirmation: aiResponse.needsConfirmation || false,
          confirmationQuestion: aiResponse.confirmationQuestion || null,
          missingFields: aiResponse.missingFields || []
        }));
      }
      
      // No continuation - just cancel
      return jsonResponse(createResponse({ 
        intent: "CANCEL", 
        reply: "Ok, annullato." 
      }));
    }
    
    // === ADVICE GUARDRAIL (CRITICAL: BEFORE slot filling to prevent "A che ora?") ===
    if (isAdviceRequest(message)) {
      console.log("[AI-FREE] Advice request detected - clearing state");
      // Clear any pending state - user is changing topic
      if (state.active_intent && state.active_intent !== 'NONE') {
        await clearAssistantState(supabase, userId);
        await setPendingAction(supabase, userId, null);
      }
      
      return jsonResponse(createResponse({
        intent: "ADVICE",
        reply: "Potresti: controllare i tuoi task, pianificare un nuovo evento, o registrare una spesa. Cosa preferisci?",
        suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
      }));
    }
    
    // === PENDING ACTION HANDLING (Confirmation flow) ===
    const pendingAction = await getPendingAction(supabase, userId);
    
    if (pendingAction) {
      console.log(`[AI-FREE] Pending: ${pendingAction.type}`);
      
      // Confirmation for write actions
      if (pendingAction.type.startsWith("CONFIRM_")) {
        if (isConfirm(message)) {
          const actionTypeStr = pendingAction.type.replace("CONFIRM_", "");
          const actionObj: AIAction = {
            type: actionTypeStr as any,
            ...pendingAction.payload
          };
          const result = await executeAction(supabase, userId, actionObj);
          await setPendingAction(supabase, userId, null);
          await clearAssistantState(supabase, userId);
          
          return jsonResponse(createResponse({
            intent: actionTypeStr as AIIntent,
            action: result.success ? actionObj : { type: "NONE" },
            reply: result.message
          }));
        } else {
          // Not confirmed, cancel
          await setPendingAction(supabase, userId, null);
          await clearAssistantState(supabase, userId);
          return jsonResponse(createResponse({ 
            intent: "CANCEL", 
            reply: "Ok, annullato." 
          }));
        }
      }
      
      // Awaiting task title
      if (pendingAction.type === "AWAIT_TASK_TITLE") {
        const title = normalizeTitle(message);
        if (isForbiddenTitle(title)) {
          return jsonResponse(createResponse({ 
            intent: "CREATE_TASK", 
            reply: "Titolo più specifico?",
            needsConfirmation: true,
            confirmationQuestion: "Cosa?",
            missingFields: ["title"]
          }));
        }
        
        await setPendingAction(supabase, userId, {
          type: "CONFIRM_CREATE_TASK",
          payload: { title },
          question: `Creo "${title}"?`
        });
        return jsonResponse(createResponse({
          intent: "CREATE_TASK",
          action: { type: "CREATE_TASK", title },
          reply: `Creo "${title}"?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo "${title}"?`
        }));
      }
      
      // Awaiting event details (date/time)
      if (pendingAction.type === "AWAIT_EVENT_DETAILS" || pendingAction.type === "AWAIT_EVENT_TIME") {
        const existingPayload = pendingAction.payload || {};
        const title = existingPayload.title;
        const existingDate = existingPayload.date;
        
        // Check for pure time input (like "20")
        const pureTime = isPureTime(message);
        if (pureTime && title && existingDate) {
          const start_at = buildISODateTime(existingDate, pureTime);
          await setPendingAction(supabase, userId, {
            type: "CONFIRM_CREATE_EVENT",
            payload: { title, start_at },
            question: `Creo "${title}" per ${formatDateIT(existingDate)} alle ${pureTime}?`
          });
          return jsonResponse(createResponse({
            intent: "CREATE_EVENT",
            action: { type: "CREATE_EVENT", title, start_at },
            reply: `Creo "${title}" per ${formatDateIT(existingDate)} alle ${pureTime}?`,
            needsConfirmation: true,
            confirmationQuestion: `Confermi?`
          }));
        }
        
        const { date, time } = parseDateTime(message);
        
        // Both date and time provided
        if ((date || existingDate) && (time || pureTime)) {
          const finalDate = date || existingDate;
          const finalTime = time || pureTime;
          const start_at = buildISODateTime(finalDate, finalTime!);
          
          await setPendingAction(supabase, userId, {
            type: "CONFIRM_CREATE_EVENT",
            payload: { title, start_at },
            question: `Creo "${title}" per ${formatDateIT(finalDate)} alle ${finalTime}?`
          });
          return jsonResponse(createResponse({
            intent: "CREATE_EVENT",
            action: { type: "CREATE_EVENT", title, start_at },
            reply: `Creo "${title}" per ${formatDateIT(finalDate)} alle ${finalTime}?`,
            needsConfirmation: true,
            confirmationQuestion: `Confermi?`
          }));
        }
        
        // Only date provided, need time
        if (date && !time && !pureTime) {
          await setPendingAction(supabase, userId, {
            type: "AWAIT_EVENT_TIME",
            payload: { ...existingPayload, date },
            question: "A che ora?"
          });
          return jsonResponse(createResponse({
            intent: "CREATE_EVENT",
            reply: "A che ora?",
            needsConfirmation: true,
            confirmationQuestion: "A che ora?",
            missingFields: ["time"]
          }));
        }
        
        // Ask for date/time again
        return jsonResponse(createResponse({
          intent: "CREATE_EVENT",
          reply: "Quando?",
          needsConfirmation: true,
          confirmationQuestion: "Quando?",
          missingFields: existingDate ? ["time"] : ["date", "time"]
        }));
      }
    }
    
    // === SLOT FILLING (if active intent) ===
    if (state.active_intent && state.active_intent !== 'NONE') {
      const slotResult = handleSlotFilling(message, state);
      if (slotResult && slotResult.matched) {
        console.log(`[AI-FREE] Slot filled: intent=${slotResult.intent}`);
        
        // Update state with new data
        if (slotResult.action && slotResult.action.type !== 'NONE') {
          // Ready for confirmation
          await setPendingAction(supabase, userId, {
            type: `CONFIRM_${slotResult.action.type}`,
            payload: slotResult.action,
            question: slotResult.confirmationQuestion || ""
          });
        } else if (slotResult.missingFields && slotResult.missingFields.length > 0) {
          // Still missing data, update state
          const newPayload = { ...state.intent_payload };
          if (slotResult.action?.title) newPayload.title = slotResult.action.title;
          
          const { date, time } = parseDateTime(message);
          if (date) newPayload.date = date;
          if (time) newPayload.time = time;
          
          await updateAssistantState(supabase, userId, {
            intent_payload: { ...newPayload, pendingAction: state.intent_payload.pendingAction }
          });
        }
        
        return jsonResponse(createResponse({
          intent: slotResult.intent || "NONE",
          action: slotResult.action || { type: "NONE" },
          reply: slotResult.reply || "Continua...",
          needsConfirmation: slotResult.needsConfirmation || false,
          confirmationQuestion: slotResult.confirmationQuestion || null,
          missingFields: slotResult.missingFields || []
        }));
      }
    }
    
    // === PHASE 1: DETERMINISTIC ROUTER ===
    const routerResult = deterministicRouter(message, state);
    
    if (routerResult.matched) {
      console.log(`[AI-FREE] Router matched: intent=${routerResult.intent}`);
      
      // Handle queries directly
      if (routerResult.intent === "QUERY_TASKS") {
        const context = await fetchUserContext(supabase, userId);
        const pending = context.todos.filter((t: any) => !t.completed);
        if (pending.length === 0) {
          return jsonResponse(createResponse({ intent: "QUERY_TASKS", reply: "Non hai task 🎉" }));
        }
        const list = pending.map((t: any, i: number) => `${i + 1}. ${t.title}`).join("\n");
        return jsonResponse(createResponse({ intent: "QUERY_TASKS", reply: `📋 Task:\n${list}` }));
      }
      
      if (routerResult.intent === "QUERY_EVENTS") {
        const context = await fetchUserContext(supabase, userId);
        if (context.events.length === 0) {
          return jsonResponse(createResponse({ intent: "QUERY_EVENTS", reply: "Non hai eventi 📅" }));
        }
        const list = context.events.map((e: any, i: number) => {
          const d = new Date(e.start_time).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
          return `${i + 1}. ${e.title} — ${d}`;
        }).join("\n");
        return jsonResponse(createResponse({ intent: "QUERY_EVENTS", reply: `📅 Eventi:\n${list}` }));
      }
      
      if (routerResult.intent === "QUERY_BUDGET") {
        const context = await fetchUserContext(supabase, userId);
        const total = context.expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
        const budget = context.budget?.amount || 0;
        return jsonResponse(createResponse({ intent: "QUERY_BUDGET", reply: `💰 Spese: €${total.toFixed(2)} / €${budget}` }));
      }
      
      // Handle greetings/small talk/advice
      if (routerResult.intent === "SMALL_TALK" || routerResult.intent === "ADVICE") {
        return jsonResponse(createResponse({
          intent: routerResult.intent,
          reply: routerResult.reply!,
          suggestions: routerResult.suggestions
        }));
      }
      
      // Handle actions that need confirmation or have missing fields
      if (routerResult.needsConfirmation || (routerResult.missingFields && routerResult.missingFields.length > 0)) {
        // Set up state for slot filling
        if (routerResult.intent && routerResult.intent !== "NONE") {
          const newPayload: any = { expectedInput: routerResult.missingFields?.[0]?.toUpperCase() };
          if (routerResult.action?.title) newPayload.title = routerResult.action.title;
          if (routerResult.action?.start_at) newPayload.start_at = routerResult.action.start_at;
          
          // Extract date/time from action if available
          const { date, time } = parseDateTime(message);
          if (date) newPayload.date = date;
          if (time) newPayload.time = time;
          
          await updateAssistantState(supabase, userId, {
            active_intent: routerResult.intent,
            intent_payload: newPayload
          });
        }
        
        // Set pending action for confirmation if action is complete
        if (routerResult.action && routerResult.action.type !== "NONE" && 
            (!routerResult.missingFields || routerResult.missingFields.length === 0)) {
          await setPendingAction(supabase, userId, {
            type: `CONFIRM_${routerResult.action.type}`,
            payload: routerResult.action,
            question: routerResult.confirmationQuestion || ""
          });
        } else if (routerResult.missingFields && routerResult.missingFields.length > 0) {
          // Set pending action for slot filling
          const pendingType = routerResult.intent === "CREATE_TASK" ? "AWAIT_TASK_TITLE" : "AWAIT_EVENT_DETAILS";
          await setPendingAction(supabase, userId, {
            type: pendingType,
            payload: routerResult.action || {},
            question: routerResult.confirmationQuestion || routerResult.reply || ""
          });
        }
        
        return jsonResponse(createResponse({
          intent: routerResult.intent || "NONE",
          action: routerResult.action || { type: "NONE" },
          reply: routerResult.reply!,
          needsConfirmation: true,
          confirmationQuestion: routerResult.confirmationQuestion || null,
          missingFields: routerResult.missingFields || [],
          suggestions: routerResult.suggestions
        }));
      }
    }
    
    // === PHASE 2: LLM FALLBACK ===
    console.log("[AI-FREE] Using LLM fallback");
    const context = await fetchUserContext(supabase, userId);
    const systemPrompt = buildSystemPrompt(context);
    const aiResponse = await callOpenRouterAI(systemPrompt, message);
    
    // Handle LLM response
    if (aiResponse.intent === "ERROR") {
      return jsonResponse(createResponse({
        intent: "ERROR",
        reply: aiResponse.reply,
        suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
      }));
    }
    
    // If LLM suggests a write action with complete data
    const writeIntents = ["CREATE_TASK", "CREATE_EVENT", "RECORD_EXPENSE"];
    if (writeIntents.includes(aiResponse.intent) && aiResponse.action?.type !== "NONE") {
      // Validate and set up confirmation
      if (aiResponse.action.type === "CREATE_TASK" && aiResponse.action.title) {
        const title = normalizeTitle(aiResponse.action.title);
        if (!isForbiddenTitle(title)) {
          await setPendingAction(supabase, userId, {
            type: "CONFIRM_CREATE_TASK",
            payload: { ...aiResponse.action, title },
            question: aiResponse.confirmationQuestion || `Creo "${title}"?`
          });
        }
      } else if (aiResponse.action.type === "CREATE_EVENT" && aiResponse.action.start_at) {
        await setPendingAction(supabase, userId, {
          type: "CONFIRM_CREATE_EVENT",
          payload: aiResponse.action,
          question: aiResponse.confirmationQuestion || "Confermi?"
        });
      } else if (aiResponse.action.type === "RECORD_EXPENSE" && aiResponse.action.amount) {
        await setPendingAction(supabase, userId, {
          type: "CONFIRM_RECORD_EXPENSE",
          payload: aiResponse.action,
          question: aiResponse.confirmationQuestion || "Registro?"
        });
      }
    } else if (aiResponse.missingFields && aiResponse.missingFields.length > 0 && writeIntents.includes(aiResponse.intent)) {
      // LLM needs more info - set up slot filling state
      await updateAssistantState(supabase, userId, {
        active_intent: aiResponse.intent,
        intent_payload: { 
          expectedInput: aiResponse.missingFields[0]?.toUpperCase(),
          ...aiResponse.action
        }
      });
      
      const pendingType = aiResponse.intent === "CREATE_TASK" ? "AWAIT_TASK_TITLE" : "AWAIT_EVENT_DETAILS";
      await setPendingAction(supabase, userId, {
        type: pendingType,
        payload: aiResponse.action || {},
        question: aiResponse.confirmationQuestion || ""
      });
    }
    
    return jsonResponse(createResponse({
      intent: aiResponse.intent,
      action: aiResponse.action || { type: "NONE" },
      reply: aiResponse.reply,
      needsConfirmation: aiResponse.needsConfirmation || false,
      confirmationQuestion: aiResponse.confirmationQuestion || null,
      missingFields: aiResponse.missingFields || []
    }));

  } catch (error) {
    console.error("[AI-FREE] Error:", error);
    
    return new Response(
      JSON.stringify(createResponse({
        intent: "ERROR",
        reply: "Si è verificato un problema. Riprova.",
        suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
      })),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function jsonResponse(data: AIResponse): Response {
  console.log(`[AI-FREE] Response: intent=${data.intent}, mode=${data.mode}, action=${data.action.type}, missing=${data.missingFields.join(',')}`);
  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
