import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// FIXED JSON CONTRACT - All responses MUST follow this structure
// ============================================================================
interface AIResponse {
  reply: string;
  intent: "CREATE_TASK" | "CREATE_EVENT" | "RECORD_EXPENSE" | "QUERY_TASKS" | "QUERY_EVENTS" | "QUERY_BUDGET" | "SUGGEST_ACTIONS" | "SMALL_TALK" | "ERROR";
  action: {
    type: "CREATE_TASK" | "CREATE_EVENT" | "RECORD_EXPENSE" | "NONE";
    payload: Record<string, any>;
  };
  data: Record<string, any>;
  needsConfirmation: boolean;
  confirmationQuestion: string | null;
  mode: "CHATTY" | "OPERATIVE";
  suggestions?: string[];
}

// Create a valid response object
function createResponse(partial: Partial<AIResponse>): AIResponse {
  const base: AIResponse = {
    reply: partial.reply || "Come posso aiutarti?",
    intent: partial.intent || "SMALL_TALK",
    action: partial.action || { type: "NONE", payload: {} },
    data: partial.data || {},
    needsConfirmation: partial.needsConfirmation || false,
    confirmationQuestion: partial.confirmationQuestion || null,
    mode: "CHATTY",
    suggestions: partial.suggestions
  };
  
  // RULE: mode="OPERATIVE" if action.type !== "NONE" OR needsConfirmation===true
  if (base.action.type !== "NONE" || base.needsConfirmation) {
    base.mode = "OPERATIVE";
  }
  
  return base;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Forbidden titles - never create with these
const FORBIDDEN_TITLES = [
  "ok", "no", "sì", "si", "yes", "ciao", "salve", "grazie", "boh", 
  "vediamo", "pianifichiamo", "perfetto", "va bene", "top", "dai",
  "annulla", "lascia stare", "niente", "nulla", "stop"
];

// Cancel patterns
const CANCEL_PATTERNS = ["no", "annulla", "lascia stare", "stop", "niente", "cambia idea", "non importa"];

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

// Normalize title - remove action verbs and articles
function normalizeTitle(raw: string): string {
  let title = raw.trim();
  const removePatterns = [
    /^(crea|aggiungi|nuovo|nuova|inserisci|registra|fai|fare|creare|aggiungere|segna|metti)\s+/i,
    /^(un|una|il|la|lo|l'|i|gli|le)\s+/i,
    /^(task|evento|spesa|promemoria)\s*/i,
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

function isCancel(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return CANCEL_PATTERNS.some(p => lower === p || lower.startsWith(p + " "));
}

function isConfirm(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return ["sì", "si", "yes", "ok", "confermo", "conferma", "va bene", "procedi", "fatto", "perfetto"].includes(lower);
}

// ============================================================================
// DATE/TIME PARSING
// ============================================================================

function parseDateTime(text: string): { date: string | null; time: string | null } {
  const lower = text.toLowerCase();
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
    // Check for day names
    const days = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
    const shortDays = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
    
    for (let i = 0; i < days.length; i++) {
      if (lower.includes(days[i]) || lower.includes(shortDays[i])) {
        const targetDay = i;
        const currentDay = now.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysUntil);
        date = targetDate.toISOString().split("T")[0];
        break;
      }
    }
  }
  
  // Parse time
  // Match patterns like "alle 20", "20:00", "8:30", "ore 15"
  const timePatterns = [
    /(?:alle|ore)\s*(\d{1,2})(?::(\d{2}))?/i,
    /\b(\d{1,2}):(\d{2})\b/,
    /\b(\d{1,2})(?:\s*(?:di sera|pm))/i,
    /\b(\d{1,2})(?:\s*(?:di mattina|am))/i
  ];
  
  for (const pattern of timePatterns) {
    const match = lower.match(pattern);
    if (match) {
      let hour = parseInt(match[1], 10);
      const minute = match[2] ? parseInt(match[2], 10) : 0;
      
      // Adjust for PM/sera if needed
      if ((lower.includes("sera") || lower.includes("pm")) && hour < 12) {
        hour += 12;
      }
      
      time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
      break;
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
      time = "19:00";
    } else if (lower.includes("cena")) {
      time = "20:00";
    }
  }
  
  return { date, time };
}

function buildISODateTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

// ============================================================================
// EXPENSE PARSING
// ============================================================================

function parseExpense(text: string): { amount: number | null; category: string | null; description: string | null } {
  const lower = text.toLowerCase();
  
  // Parse amount - patterns like "€5,50", "5.50€", "5,50 euro", "5 euro"
  let amount: number | null = null;
  const amountPatterns = [
    /€\s*(\d+(?:[.,]\d{1,2})?)/,
    /(\d+(?:[.,]\d{1,2})?)\s*€/,
    /(\d+(?:[.,]\d{1,2})?)\s*euro/i
  ];
  
  for (const pattern of amountPatterns) {
    const match = lower.match(pattern);
    if (match) {
      amount = parseFloat(match[1].replace(",", "."));
      break;
    }
  }
  
  // Parse category based on keywords
  let category: string | null = null;
  const categoryMap: Record<string, string[]> = {
    "cibo": ["pranzo", "cena", "colazione", "ristorante", "pizza", "sushi", "caffè", "bar", "spesa", "supermercato", "alimentari"],
    "trasporti": ["benzina", "treno", "bus", "metro", "taxi", "uber", "parcheggio", "autostrada", "pedaggio"],
    "shopping": ["vestiti", "scarpe", "abbigliamento", "amazon", "shopping"],
    "salute": ["farmacia", "medico", "dottore", "medicine", "ospedale"],
    "svago": ["cinema", "teatro", "concerto", "netflix", "spotify", "giochi", "videogiochi"],
    "casa": ["affitto", "bollette", "luce", "gas", "acqua", "internet"],
    "vizi": ["sigarette", "alcol", "birra", "vino", "cocktail"]
  };
  
  for (const [cat, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(k => lower.includes(k))) {
      category = cat;
      break;
    }
  }
  
  // Extract description (the part before the amount)
  let description: string | null = null;
  const descMatch = text.match(/^(.+?)(?:\s*€|\s*\d+[.,]\d{2}|\s+euro)/i);
  if (descMatch) {
    description = descMatch[1].trim();
  }
  
  return { amount, category: category || "altro", description };
}

// ============================================================================
// DETERMINISTIC ROUTER (Phase 1 - Regex/Heuristics)
// ============================================================================

interface RouterResult {
  matched: boolean;
  intent?: string;
  action?: { type: string; payload: Record<string, any> };
  missingFields?: string[];
  reply?: string;
  needsConfirmation?: boolean;
  confirmationQuestion?: string;
  suggestions?: string[];
}

function deterministicRouter(message: string): RouterResult {
  const lower = message.toLowerCase().trim();
  const { date, time } = parseDateTime(message);
  
  // === EXPENSE DETECTION ===
  // Patterns: "sigarette €5,50", "pranzo 12 euro", "€20 benzina"
  const expenseMatch = lower.match(/€\s*\d+|(\d+(?:[.,]\d{1,2})?)\s*€|\d+(?:[.,]\d{1,2})?\s*euro/i);
  if (expenseMatch) {
    const { amount, category, description } = parseExpense(message);
    if (amount && amount > 0) {
      return {
        matched: true,
        intent: "RECORD_EXPENSE",
        action: {
          type: "RECORD_EXPENSE",
          payload: { amount, category, description, date: date || new Date().toISOString().split("T")[0] }
        },
        reply: `Registro spesa: €${amount.toFixed(2)} (${category})?`,
        needsConfirmation: true,
        confirmationQuestion: `Registro €${amount.toFixed(2)} in ${category}?`
      };
    }
  }
  
  // === EVENT CREATION WITH DATE/TIME ===
  // Patterns: "padel domani alle 20", "cena sabato 20:30", "riunione lunedì ore 10"
  const eventPatterns = [
    /^(.+?)\s+(oggi|domani|domai|dopodomani|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|lun|mar|mer|gio|ven|sab|dom)/i,
    /^(evento|appuntamento|meeting|riunione)\s+(.+)/i
  ];
  
  for (const pattern of eventPatterns) {
    const match = lower.match(pattern);
    if (match && (date || time)) {
      // Extract title from the message
      let title = message;
      // Remove date/time parts
      title = title.replace(/\b(oggi|domani|domai|dopodomani|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\b/gi, "");
      title = title.replace(/\b(alle|ore)\s*\d{1,2}(:\d{2})?\b/gi, "");
      title = title.replace(/\b\d{1,2}:\d{2}\b/g, "");
      title = title.replace(/\b(di sera|di mattina|pomeriggio|stasera|stamattina)\b/gi, "");
      title = normalizeTitle(title);
      
      if (title && !isForbiddenTitle(title)) {
        if (date && time) {
          // Complete event
          const start_time = buildISODateTime(date, time);
          return {
            matched: true,
            intent: "CREATE_EVENT",
            action: {
              type: "CREATE_EVENT",
              payload: { title, start_time, date, time }
            },
            reply: `Creo evento "${title}" per ${formatDateIT(date)} alle ${time}?`,
            needsConfirmation: true,
            confirmationQuestion: `Creo evento "${title}" per ${formatDateIT(date)} alle ${time}?`
          };
        } else if (date && !time) {
          // Missing time
          return {
            matched: true,
            intent: "CREATE_EVENT",
            action: { type: "NONE", payload: { title, date } },
            missingFields: ["time"],
            reply: `A che ora vuoi "${title}"?`,
            needsConfirmation: true,
            confirmationQuestion: `A che ora vuoi "${title}"?`
          };
        }
      }
    }
  }
  
  // === EXPLICIT CREATE COMMANDS ===
  // "crea task lavoro", "aggiungi evento riunione", "nuovo promemoria"
  const createTaskMatch = lower.match(/^(crea|aggiungi|nuovo|nuova|fai|inserisci)\s+(task|attività|promemoria|to-?do)\s+(.+)/i);
  if (createTaskMatch) {
    const title = normalizeTitle(createTaskMatch[3]);
    if (title && !isForbiddenTitle(title)) {
      return {
        matched: true,
        intent: "CREATE_TASK",
        action: {
          type: "CREATE_TASK",
          payload: { title, priority: "medium" }
        },
        reply: `Creo il task "${title}"?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo il task "${title}"?`
      };
    }
  }
  
  const createEventMatch = lower.match(/^(crea|aggiungi|nuovo|nuova)\s+(evento|appuntamento|meeting)\s+(.+)/i);
  if (createEventMatch) {
    const rawTitle = createEventMatch[3];
    const title = normalizeTitle(rawTitle);
    const { date: parsedDate, time: parsedTime } = parseDateTime(rawTitle);
    
    if (title && !isForbiddenTitle(title)) {
      if (parsedDate && parsedTime) {
        const start_time = buildISODateTime(parsedDate, parsedTime);
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: { type: "CREATE_EVENT", payload: { title, start_time } },
          reply: `Creo evento "${title}" per ${formatDateIT(parsedDate)} alle ${parsedTime}?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo evento "${title}"?`
        };
      }
      // Missing date/time
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "NONE", payload: { title } },
        missingFields: ["date", "time"],
        reply: `Quando vuoi "${title}"?`,
        needsConfirmation: true,
        confirmationQuestion: `Quando vuoi "${title}"?`
      };
    }
  }
  
  // === INCOMPLETE CREATE COMMANDS ===
  // "crea un task", "aggiungi evento", "nuovo promemoria"
  if (/^(crea|aggiungi|nuovo|nuova)\s+(un\s+)?(task|attività|promemoria|to-?do)\s*$/i.test(lower)) {
    return {
      matched: true,
      intent: "CREATE_TASK",
      action: { type: "NONE", payload: {} },
      missingFields: ["title"],
      reply: "Che task vuoi creare?",
      needsConfirmation: true,
      confirmationQuestion: "Che task vuoi creare?"
    };
  }
  
  if (/^(crea|aggiungi|nuovo|nuova)\s+(un\s+)?(evento|appuntamento|meeting)\s*$/i.test(lower)) {
    return {
      matched: true,
      intent: "CREATE_EVENT",
      action: { type: "NONE", payload: {} },
      missingFields: ["title", "date", "time"],
      reply: "Che evento vuoi creare? Dimmi titolo e quando.",
      needsConfirmation: true,
      confirmationQuestion: "Che evento vuoi creare?"
    };
  }
  
  // === QUERY COMMANDS ===
  if (/\b(mostra|vedi|lista|elenco|quali|quanti)\s*(i\s+)?(miei\s+)?(task|attività|cose da fare|to-?do)/i.test(lower)) {
    return { matched: true, intent: "QUERY_TASKS" };
  }
  
  if (/\b(mostra|vedi|lista|elenco|quali|quanti)\s*(i\s+)?(miei\s+)?(eventi|appuntamenti|impegni)/i.test(lower)) {
    return { matched: true, intent: "QUERY_EVENTS" };
  }
  
  if (/\b(mostra|vedi|quanto|quante|budget|spese|speso)\s*/i.test(lower) && 
      /\b(spese|budget|speso|soldi|euro|€)/i.test(lower)) {
    return { matched: true, intent: "QUERY_BUDGET" };
  }
  
  // === GREETINGS & SMALL TALK (don't use NONE) ===
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
      intent: "SUGGEST_ACTIONS",
      reply: "Posso aiutarti a gestire task, eventi e spese. Prova a dire: \"padel domani alle 20\" o \"sigarette €5\".",
      suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
    };
  }
  
  // Not matched - will use LLM
  return { matched: false };
}

function randomGreeting(): string {
  const greetings = [
    "Ciao! Come posso aiutarti oggi?",
    "Ehi! Tutto bene? Dimmi pure.",
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

async function executeAction(supabase: any, userId: string, actionType: string, payload: any): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    switch (actionType) {
      case "CREATE_TASK": {
        const title = normalizeTitle(payload.title || "");
        if (isForbiddenTitle(title)) {
          return { success: false, message: "Titolo non valido." };
        }
        const { data, error } = await supabase.from("todos").insert({
          user_id: userId,
          title: title,
          priority: payload.priority || "medium",
          due_date: payload.due_date || null,
          completed: false
        }).select().single();
        if (error) throw error;
        return { success: true, message: `✅ Task creato: "${title}"`, data };
      }
      
      case "CREATE_EVENT": {
        const title = normalizeTitle(payload.title || "");
        if (isForbiddenTitle(title)) {
          return { success: false, message: "Titolo non valido." };
        }
        if (!payload.start_time) {
          return { success: false, message: "Data/ora mancanti." };
        }
        const startDate = new Date(payload.start_time);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1 hour
        
        const { data, error } = await supabase.from("calendar_events").insert({
          user_id: userId,
          title: title,
          start_time: payload.start_time,
          end_time: payload.end_time || endDate.toISOString()
        }).select().single();
        if (error) throw error;
        const dateStr = startDate.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
        const timeStr = startDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        return { success: true, message: `✅ Evento creato: "${title}" — ${dateStr} ${timeStr}`, data };
      }
      
      case "RECORD_EXPENSE": {
        if (!payload.amount || payload.amount <= 0) {
          return { success: false, message: "Importo non valido." };
        }
        const { data, error } = await supabase.from("expenses").insert({
          user_id: userId,
          amount: payload.amount,
          category: payload.category || "altro",
          description: payload.description || null,
          date: payload.date || new Date().toISOString().split("T")[0]
        }).select().single();
        if (error) throw error;
        return { success: true, message: `✅ Spesa salvata: €${payload.amount.toFixed(2)} — ${payload.category}`, data };
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
      
      case "COMPLETE_ALL_TASKS": {
        const { error } = await supabase.from("todos").update({ completed: true }).eq("user_id", userId).eq("completed", false);
        if (error) throw error;
        return { success: true, message: "✅ Tutti i task completati." };
      }
      
      default:
        return { success: false, message: `Azione non supportata: ${actionType}` };
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
  
  return `Sei un assistente personale. Rispondi SOLO in JSON valido.

DATA OGGI: ${today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
DOMANI: ${tomorrow.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}

CONTESTO:
- Task aperti: ${pendingTasks.length} (${pendingTasks.slice(0, 3).map((t: any) => t.title).join(", ") || "nessuno"})
- Eventi prossimi: ${todayEvents.length}
- Spese mese: €${totalExpenses.toFixed(2)} / €${budget}

CONTRATTO JSON (OBBLIGATORIO):
{
  "reply": "risposta breve e naturale",
  "intent": "CREATE_TASK|CREATE_EVENT|RECORD_EXPENSE|QUERY_TASKS|QUERY_EVENTS|QUERY_BUDGET|SUGGEST_ACTIONS|SMALL_TALK",
  "action": {"type": "CREATE_TASK|CREATE_EVENT|RECORD_EXPENSE|NONE", "payload": {}},
  "data": {},
  "needsConfirmation": true/false,
  "confirmationQuestion": "domanda specifica se needsConfirmation=true"
}

REGOLE MODE:
- Se action.type != "NONE" o needsConfirmation=true → mode OPERATIVE (risposte brevi, 1-2 frasi, no emoji)
- Altrimenti → mode CHATTY (tono umano, max 2-3 frasi)

REGOLE AZIONI:
- "padel domani alle 20" → intent=CREATE_EVENT, action.type=CREATE_EVENT, payload={title:"Padel", start_time:"ISO"}
- "sigarette €5" → intent=RECORD_EXPENSE, action.type=RECORD_EXPENSE, payload={amount:5, category:"vizi"}
- Se manca info per azione → action.type=NONE, needsConfirmation=true, fai UNA domanda mirata
- MAI intent SMALL_TALK se il messaggio può essere un'azione

TITOLI:
- Rimuovi "crea/aggiungi/fai" dal titolo
- "crea task lavoro" → title:"Lavoro"

DATE/ORA:
- "domai" = domani, "alle 20" = 20:00
- Converti sempre in ISO per start_time

VIETATO:
- Risposte vaghe tipo "Dimmi di più"
- intent:"NONE" (usa SMALL_TALK o SUGGEST_ACTIONS)
- Titoli vuoti o generici

Rispondi SOLO JSON, niente altro testo.`;
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
      action: { type: "NONE", payload: {} },
      data: {},
      needsConfirmation: false,
      confirmationQuestion: null
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
        temperature: 0.5
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
        action: { type: "NONE", payload: {} },
        data: {},
        needsConfirmation: false,
        confirmationQuestion: null
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
      if (!parsed.action) parsed.action = { type: "NONE", payload: {} };
      if (parsed.needsConfirmation === undefined) parsed.needsConfirmation = false;
      
      return parsed;
      
    } catch (e) {
      console.error("[AI-FREE] JSON parse error");
      // Fallback - treat as conversation
      let cleanText = content.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```json|```/g, "").trim();
      if (cleanText.length > 5 && cleanText.length < 400) {
        return {
          reply: cleanText,
          intent: "SMALL_TALK",
          action: { type: "NONE", payload: {} },
          data: {},
          needsConfirmation: false,
          confirmationQuestion: null
        };
      }
      return {
        reply: "Puoi provare a riformulare?",
        intent: "SUGGEST_ACTIONS",
        action: { type: "NONE", payload: {} },
        data: {},
        needsConfirmation: false,
        confirmationQuestion: null,
        suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
      };
    }
    
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[AI-FREE] Timeout");
      return {
        intent: "ERROR",
        reply: "Richiesta scaduta. Riprova.",
        action: { type: "NONE", payload: {} },
        data: {},
        needsConfirmation: false,
        confirmationQuestion: null
      };
    }
    
    console.error("[AI-FREE] Error:", error instanceof Error ? error.message : "Unknown");
    return {
      intent: "ERROR",
      reply: "Errore imprevisto. Riprova.",
      action: { type: "NONE", payload: {} },
      data: {},
      needsConfirmation: false,
      confirmationQuestion: null
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
    // Parse request body
    const body = await req.json();
    const { userMessage, locale = "it" } = body;
    
    // Validate required fields
    if (!userMessage || typeof userMessage !== "string") {
      return new Response(
        JSON.stringify(createResponse({ intent: "ERROR", reply: "Messaggio richiesto" })),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for database operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Extract and validate JWT from Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[AI-FREE] Missing or invalid authorization header");
      return new Response(
        JSON.stringify(createResponse({ intent: "ERROR", reply: "Non autenticato. Effettua il login." })),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Create auth client to verify token
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: userData, error: userError } = await authClient.auth.getUser();
    
    if (userError || !userData?.user?.id) {
      console.error("[AI-FREE] JWT verification failed:", userError?.message || "No user");
      return new Response(
        JSON.stringify(createResponse({ intent: "ERROR", reply: "Sessione scaduta. Effettua nuovamente il login." })),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Extract userId from verified JWT
    const userId = userData.user.id;
    
    const message = userMessage.trim();
    console.log(`[AI-FREE] Authenticated user ${userId}: "${message}"`);
    
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
              reply: "Non hai task in sospeso 🎉" 
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
              reply: "Non hai eventi in programma 📅" 
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
            reply: `💰 Spese mese: €${total.toFixed(2)} / €${budget}` 
          }));
        }
        
        case "ADD_TASK":
          await setPendingAction(supabase, userId, {
            type: "AWAIT_TASK_TITLE",
            payload: {},
            question: "Che task vuoi creare?"
          });
          return jsonResponse(createResponse({ 
            intent: "CREATE_TASK", 
            reply: "Che task vuoi creare?",
            needsConfirmation: true,
            confirmationQuestion: "Che task vuoi creare?"
          }));
        
        default:
          return jsonResponse(createResponse({ reply: "Comando non riconosciuto." }));
      }
    }
    
    // === CANCEL HANDLING ===
    if (isCancel(message)) {
      await setPendingAction(supabase, userId, null);
      return jsonResponse(createResponse({ 
        intent: "SMALL_TALK", 
        reply: "Ok, annullato. Dimmi pure." 
      }));
    }
    
    // === PENDING ACTION HANDLING ===
    const pendingAction = await getPendingAction(supabase, userId);
    
    if (pendingAction) {
      console.log(`[AI-FREE] Pending: ${pendingAction.type}`);
      
      // Confirmation for write actions
      if (pendingAction.type.startsWith("CONFIRM_")) {
        if (isConfirm(message)) {
          const actionType = pendingAction.type.replace("CONFIRM_", "");
          const result = await executeAction(supabase, userId, actionType, pendingAction.payload);
          await setPendingAction(supabase, userId, null);
          
          const resp = createResponse({
            intent: actionType as any,
            action: result.success ? { type: actionType as any, payload: pendingAction.payload } : { type: "NONE", payload: {} },
            reply: result.message
          });
          console.log(`[AI-FREE] mode=${resp.mode} intent=${resp.intent} action=${resp.action.type} needsConfirmation=${resp.needsConfirmation}`);
          return jsonResponse(resp);
        } else {
          // Not confirmed, cancel
          await setPendingAction(supabase, userId, null);
          return jsonResponse(createResponse({ 
            intent: "SMALL_TALK", 
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
            reply: "Dimmi un titolo più specifico.",
            needsConfirmation: true,
            confirmationQuestion: "Quale task?"
          }));
        }
        
        await setPendingAction(supabase, userId, {
          type: "CONFIRM_CREATE_TASK",
          payload: { title },
          question: `Creo "${title}"?`
        });
        return jsonResponse(createResponse({
          intent: "CREATE_TASK",
          reply: `Creo il task "${title}"?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo "${title}"?`
        }));
      }
      
      // Awaiting event details
      if (pendingAction.type === "AWAIT_EVENT_DETAILS") {
        const { date, time } = parseDateTime(message);
        const existingPayload = pendingAction.payload || {};
        
        if (date && time) {
          const title = existingPayload.title || normalizeTitle(message.replace(/\d/g, "").trim()) || "Evento";
          const start_time = buildISODateTime(date, time);
          
          await setPendingAction(supabase, userId, {
            type: "CONFIRM_CREATE_EVENT",
            payload: { title, start_time },
            question: `Creo "${title}" per ${formatDateIT(date)} alle ${time}?`
          });
          return jsonResponse(createResponse({
            intent: "CREATE_EVENT",
            reply: `Creo "${title}" per ${formatDateIT(date)} alle ${time}?`,
            needsConfirmation: true,
            confirmationQuestion: `Confermi evento "${title}"?`
          }));
        } else if (date && !time) {
          await setPendingAction(supabase, userId, {
            type: "AWAIT_EVENT_TIME",
            payload: { ...existingPayload, date },
            question: "A che ora?"
          });
          return jsonResponse(createResponse({
            intent: "CREATE_EVENT",
            reply: "A che ora?",
            needsConfirmation: true,
            confirmationQuestion: "A che ora?"
          }));
        } else {
          return jsonResponse(createResponse({
            intent: "CREATE_EVENT",
            reply: "Quando vuoi l'evento?",
            needsConfirmation: true,
            confirmationQuestion: "Quando?"
          }));
        }
      }
      
      // Awaiting event time
      if (pendingAction.type === "AWAIT_EVENT_TIME") {
        const { time } = parseDateTime(message);
        if (time) {
          const title = pendingAction.payload.title || "Evento";
          const date = pendingAction.payload.date;
          const start_time = buildISODateTime(date, time);
          
          await setPendingAction(supabase, userId, {
            type: "CONFIRM_CREATE_EVENT",
            payload: { title, start_time },
            question: `Creo "${title}" per ${formatDateIT(date)} alle ${time}?`
          });
          return jsonResponse(createResponse({
            intent: "CREATE_EVENT",
            reply: `Creo "${title}" per ${formatDateIT(date)} alle ${time}?`,
            needsConfirmation: true,
            confirmationQuestion: `Confermi?`
          }));
        } else {
          return jsonResponse(createResponse({
            intent: "CREATE_EVENT",
            reply: "Non ho capito l'ora. Prova con formato tipo \"alle 20\" o \"15:30\".",
            needsConfirmation: true,
            confirmationQuestion: "A che ora?"
          }));
        }
      }
    }
    
    // === PHASE 1: DETERMINISTIC ROUTER ===
    const routerResult = deterministicRouter(message);
    
    if (routerResult.matched) {
      console.log(`[AI-FREE] Router matched: intent=${routerResult.intent}`);
      
      // Handle queries directly
      if (routerResult.intent === "QUERY_TASKS") {
        const context = await fetchUserContext(supabase, userId);
        const pending = context.todos.filter((t: any) => !t.completed);
        if (pending.length === 0) {
          return jsonResponse(createResponse({ intent: "QUERY_TASKS", reply: "Non hai task in sospeso 🎉" }));
        }
        const list = pending.map((t: any, i: number) => `${i + 1}. ${t.title}`).join("\n");
        return jsonResponse(createResponse({ intent: "QUERY_TASKS", reply: `📋 Task:\n${list}` }));
      }
      
      if (routerResult.intent === "QUERY_EVENTS") {
        const context = await fetchUserContext(supabase, userId);
        if (context.events.length === 0) {
          return jsonResponse(createResponse({ intent: "QUERY_EVENTS", reply: "Non hai eventi in programma 📅" }));
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
      
      // Handle greetings/small talk
      if (routerResult.intent === "SMALL_TALK" || routerResult.intent === "SUGGEST_ACTIONS") {
        const resp = createResponse({
          intent: routerResult.intent as any,
          reply: routerResult.reply!,
          suggestions: routerResult.suggestions
        });
        console.log(`[AI-FREE] mode=${resp.mode} intent=${resp.intent} action=${resp.action.type} needsConfirmation=${resp.needsConfirmation}`);
        return jsonResponse(resp);
      }
      
      // Handle actions that need confirmation
      if (routerResult.needsConfirmation) {
        // If missing fields, set pending and ask
        if (routerResult.missingFields && routerResult.missingFields.length > 0) {
          const pendingType = routerResult.intent === "CREATE_TASK" ? "AWAIT_TASK_TITLE" : "AWAIT_EVENT_DETAILS";
          await setPendingAction(supabase, userId, {
            type: pendingType,
            payload: routerResult.action?.payload || {},
            question: routerResult.confirmationQuestion || routerResult.reply || ""
          });
        } else if (routerResult.action && routerResult.action.type !== "NONE") {
          // Complete data, ask for confirmation
          await setPendingAction(supabase, userId, {
            type: `CONFIRM_${routerResult.intent}`,
            payload: routerResult.action.payload,
            question: routerResult.confirmationQuestion || ""
          });
        }
        
        const resp = createResponse({
          intent: routerResult.intent as any,
          reply: routerResult.reply!,
          needsConfirmation: true,
          confirmationQuestion: routerResult.confirmationQuestion || null
        });
        console.log(`[AI-FREE] mode=${resp.mode} intent=${resp.intent} action=${resp.action.type} needsConfirmation=${resp.needsConfirmation}`);
        return jsonResponse(resp);
      }
    }
    
    // === PHASE 2: LLM FALLBACK ===
    console.log("[AI-FREE] Using LLM fallback");
    const context = await fetchUserContext(supabase, userId);
    const systemPrompt = buildSystemPrompt(context);
    const aiResponse = await callOpenRouterAI(systemPrompt, message);
    
    // Handle LLM response
    if (aiResponse.intent === "ERROR") {
      const resp = createResponse({
        intent: "ERROR",
        reply: aiResponse.reply,
        suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
      });
      console.log(`[AI-FREE] mode=${resp.mode} intent=${resp.intent} action=${resp.action.type} needsConfirmation=${resp.needsConfirmation}`);
      return jsonResponse(resp);
    }
    
    // If LLM suggests a write action
    const writeIntents = ["CREATE_TASK", "CREATE_EVENT", "RECORD_EXPENSE"];
    if (writeIntents.includes(aiResponse.intent) && aiResponse.action?.type !== "NONE") {
      // Validate and set up confirmation
      if (aiResponse.action.type === "CREATE_TASK" && aiResponse.action.payload?.title) {
        const title = normalizeTitle(aiResponse.action.payload.title);
        if (!isForbiddenTitle(title)) {
          await setPendingAction(supabase, userId, {
            type: "CONFIRM_CREATE_TASK",
            payload: { ...aiResponse.action.payload, title },
            question: aiResponse.confirmationQuestion || `Creo "${title}"?`
          });
        }
      } else if (aiResponse.action.type === "CREATE_EVENT" && aiResponse.action.payload?.start_time) {
        await setPendingAction(supabase, userId, {
          type: "CONFIRM_CREATE_EVENT",
          payload: aiResponse.action.payload,
          question: aiResponse.confirmationQuestion || "Confermi?"
        });
      } else if (aiResponse.action.type === "RECORD_EXPENSE" && aiResponse.action.payload?.amount) {
        await setPendingAction(supabase, userId, {
          type: "CONFIRM_RECORD_EXPENSE",
          payload: aiResponse.action.payload,
          question: aiResponse.confirmationQuestion || "Registro?"
        });
      }
    } else if (aiResponse.needsConfirmation && writeIntents.includes(aiResponse.intent)) {
      // LLM needs more info
      const pendingType = aiResponse.intent === "CREATE_TASK" ? "AWAIT_TASK_TITLE" : "AWAIT_EVENT_DETAILS";
      await setPendingAction(supabase, userId, {
        type: pendingType,
        payload: aiResponse.data || {},
        question: aiResponse.confirmationQuestion || ""
      });
    }
    
    const resp = createResponse({
      intent: aiResponse.intent,
      action: aiResponse.action || { type: "NONE", payload: {} },
      data: aiResponse.data || {},
      reply: aiResponse.reply,
      needsConfirmation: aiResponse.needsConfirmation || false,
      confirmationQuestion: aiResponse.confirmationQuestion || null
    });
    
    console.log(`[AI-FREE] mode=${resp.mode} intent=${resp.intent} action=${resp.action.type} needsConfirmation=${resp.needsConfirmation}`);
    return jsonResponse(resp);

  } catch (error) {
    console.error("[AI-FREE] Error:", error);
    
    const resp = createResponse({
      intent: "ERROR",
      reply: "Si è verificato un problema. Riprova.",
      suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
    });
    
    return new Response(
      JSON.stringify(resp),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function jsonResponse(data: AIResponse): Response {
  return new Response(
    JSON.stringify(data),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
