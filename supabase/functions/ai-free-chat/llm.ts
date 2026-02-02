/**
 * LLM Module - OpenRouter API Integration
 * LINGUA: Dinamica basata sulle preferenze utente
 */

import { UserContext } from "./types.ts";

const DEFAULT_MODEL = "deepseek/deepseek-r1-0528:free";

// ============================================================================
// LANGUAGE CONFIGURATION
// ============================================================================

interface LanguageConfig {
  code: string;
  name: string;
}

const LANGUAGE_TRANSLATIONS: Record<string, Record<string, string>> = {
  it: {
    today: "oggi",
    tomorrow: "domani",
    noTasks: "nessuno",
    openTasks: "Task aperti",
    upcomingEvents: "Eventi imminenti",
    monthlyExpenses: "Spese mese",
    configError: "Configurazione AI non valida. Riprova più tardi.",
    serviceUnavailable: "Servizio AI non disponibile.",
    timeout: "Richiesta scaduta. Riprova.",
    unexpectedError: "Errore imprevisto. Riprova.",
    howCanIHelp: "Come posso aiutarti?",
    rephrase: "Puoi riformulare?",
    showTasks: "Mostra task",
    addEvent: "Aggiungi evento",
    showExpenses: "Mostra spese"
  },
  en: {
    today: "today",
    tomorrow: "tomorrow",
    noTasks: "none",
    openTasks: "Open tasks",
    upcomingEvents: "Upcoming events",
    monthlyExpenses: "Monthly expenses",
    configError: "Invalid AI configuration. Please try again later.",
    serviceUnavailable: "AI service unavailable.",
    timeout: "Request timed out. Please retry.",
    unexpectedError: "Unexpected error. Please retry.",
    howCanIHelp: "How can I help you?",
    rephrase: "Could you rephrase that?",
    showTasks: "Show tasks",
    addEvent: "Add event",
    showExpenses: "Show expenses"
  },
  es: {
    today: "hoy",
    tomorrow: "mañana",
    noTasks: "ninguno",
    openTasks: "Tareas pendientes",
    upcomingEvents: "Próximos eventos",
    monthlyExpenses: "Gastos del mes",
    configError: "Configuración de IA inválida. Inténtalo más tarde.",
    serviceUnavailable: "Servicio de IA no disponible.",
    timeout: "Tiempo de espera agotado. Reintenta.",
    unexpectedError: "Error inesperado. Reintenta.",
    howCanIHelp: "¿Cómo puedo ayudarte?",
    rephrase: "¿Puedes reformular?",
    showTasks: "Mostrar tareas",
    addEvent: "Agregar evento",
    showExpenses: "Mostrar gastos"
  }
};

function getTranslation(langCode: string, key: string): string {
  const lang = LANGUAGE_TRANSLATIONS[langCode] || LANGUAGE_TRANSLATIONS["en"];
  return lang[key] || LANGUAGE_TRANSLATIONS["en"][key] || key;
}

// ============================================================================
// SYSTEM PROMPT (MULTILINGUAL)
// ============================================================================

export function buildSystemPrompt(context: UserContext, language: LanguageConfig = { code: "it", name: "italiano" }): string {
  const pendingTasks = context.todos.filter((t: any) => !t.completed);
  const todayEvents = context.events.slice(0, 5);
  const totalExpenses = context.expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const budget = context.budget?.amount || 0;
  
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const t = (key: string) => getTranslation(language.code, key);
  
  // Date formatting based on language
  const dateLocale = language.code === "es" ? "es-ES" : language.code === "en" ? "en-US" : "it-IT";
  const todayStr = today.toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const tomorrowStr = tomorrow.toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" });
  
  const taskList = pendingTasks.slice(0, 3).map((t: any) => t.title).join(", ") || t("noTasks");
  
  return `You are AYVO, an intelligent productivity assistant. You MUST respond ALWAYS in ${language.name} (${language.code}). Output ONLY valid JSON.

TODAY: ${todayStr}
TOMORROW: ${tomorrowStr}

USER CONTEXT:
- ${t("openTasks")}: ${pendingTasks.length} (${taskList})
- ${t("upcomingEvents")}: ${todayEvents.length}
- ${t("monthlyExpenses")}: €${totalExpenses.toFixed(2)} / €${budget}

MANDATORY JSON CONTRACT:
{
  "reply": "short response IN ${language.name.toUpperCase()}",
  "intent": "CREATE_TASK|CREATE_EVENT|RECORD_EXPENSE|QUERY_TASKS|QUERY_EVENTS|QUERY_BUDGET|ADVICE|SMALL_TALK",
  "action": {"type": "CREATE_TASK|CREATE_EVENT|RECORD_EXPENSE|NONE", "title": "...", "start_at": "ISO", "amount": 0, "category": "..."},
  "needsConfirmation": true/false,
  "confirmationQuestion": "question if needsConfirmation=true",
  "missingFields": ["title", "date", "time", "amount", "category"]
}

STRICT RULES:
1. LANGUAGE: ALWAYS respond in ${language.name}. NEVER in other languages.
2. If user requests an ACTION (create, add, record) → intent MUST be an action, NEVER "NONE"
3. If data is missing → set missingFields and ask ONE short question
4. For tasks: only title is required. Do NOT ask for time.
5. For events: title + date + time required. Ask ONLY for missing field.
6. For expenses: amount + category required. Support comma decimal (5,5 = €5.50)
7. Titles: remove prefixes (create/add) - "create task work" → title:"Work"
8. Dates: interpret weekday names relative to today

EXAMPLES:
- "create a task: buy milk" → intent:CREATE_TASK, action:{type:CREATE_TASK, title:"Buy milk"}
- "remind me to pay bill tomorrow" → intent:CREATE_TASK, action:{type:CREATE_TASK, title:"Pay bill", due_date:"ISO"}
- "padel tomorrow at 8pm" → intent:CREATE_EVENT, action:{type:CREATE_EVENT, title:"Padel", start_at:"ISO"}
- "cigarettes 5.5" → intent:RECORD_EXPENSE, action:{type:RECORD_EXPENSE, amount:5.5, category:"vices"}
- "create event" → intent:CREATE_EVENT, missingFields:["title","date","time"], reply:"What event?"

Reply ONLY with valid JSON, nothing else.`;
}

// ============================================================================
// LANGUAGE ENFORCEMENT (POST-PROCESSING)
// ============================================================================

const ENGLISH_FALLBACK_PATTERNS = [
  "Can you rephrase",
  "Tell me more",
  "I don't understand",
  "What do you mean",
  "Could you be more specific",
  "I'm not sure",
  "How can I help",
  "What would you like"
];

function ensureCorrectLanguage(response: any, targetLang: string): any {
  if (!response.reply) return response;
  
  const reply = response.reply;
  const t = (key: string) => getTranslation(targetLang, key);
  
  // Check for English fallback patterns when target is not English
  if (targetLang !== "en") {
    for (const pattern of ENGLISH_FALLBACK_PATTERNS) {
      if (reply.toLowerCase().includes(pattern.toLowerCase())) {
        // Replace with target language equivalent
        if (pattern.includes("rephrase")) {
          response.reply = t("rephrase");
        } else if (pattern.includes("help")) {
          response.reply = t("howCanIHelp");
        } else {
          response.reply = t("howCanIHelp");
        }
        break;
      }
    }
    
    // If reply looks purely English (ASCII letters only) and intent is NONE/ADVICE/SMALL_TALK
    if (/^[a-zA-Z\s,.'!?]+$/.test(reply) && 
        (response.intent === "NONE" || response.intent === "ADVICE" || response.intent === "SMALL_TALK")) {
      response.reply = t("howCanIHelp");
    }
  }
  
  // Update suggestions to target language if present
  if (response.suggestions && Array.isArray(response.suggestions)) {
    response.suggestions = [
      t("showTasks"),
      t("addEvent"),
      t("showExpenses")
    ];
  }
  
  return response;
}

// ============================================================================
// OPENROUTER API CALL
// ============================================================================

export async function callOpenRouterAI(
  systemPrompt: string, 
  userMessage: string,
  targetLanguage: string = "it"
): Promise<any> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const t = (key: string) => getTranslation(targetLanguage, key);
  
  if (!apiKey || apiKey.trim() === "" || !apiKey.startsWith("sk-or-")) {
    console.error("[AI-FREE] Invalid or missing OPENROUTER_API_KEY");
    return {
      intent: "ERROR",
      reply: t("configError"),
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
  
  console.log(`[AI-FREE] Calling LLM: ${model}, targetLang: ${targetLanguage}`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ayvo.app",
        "X-Title": "AYVO"
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
        reply: response.status === 401 ? t("configError") : t("serviceUnavailable"),
        action: { type: "NONE" },
        needsConfirmation: false,
        confirmationQuestion: null,
        missingFields: []
      };
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    console.log("[AI-FREE] Raw LLM response:", content.substring(0, 600));
    
    try {
      let cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      const jsonMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)```/) || cleanContent.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : cleanContent.trim();
      const parsed = JSON.parse(jsonStr);
      
      if (!parsed.reply) parsed.reply = t("howCanIHelp");
      if (!parsed.intent) parsed.intent = "SMALL_TALK";
      if (!parsed.action) parsed.action = { type: "NONE" };
      if (parsed.needsConfirmation === undefined) parsed.needsConfirmation = false;
      if (!parsed.missingFields) parsed.missingFields = [];
      
      // Ensure response is in correct language
      return ensureCorrectLanguage(parsed, targetLanguage);
      
    } catch (e) {
      console.error("[AI-FREE] JSON parse error");
      let cleanText = content.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```json|```/g, "").trim();
      if (cleanText.length > 5 && cleanText.length < 400) {
        // Check if it's in wrong language
        if (targetLanguage !== "en" && /^[a-zA-Z\s,.'!?]+$/.test(cleanText)) {
          cleanText = t("howCanIHelp");
        }
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
        reply: t("rephrase"),
        intent: "ADVICE",
        action: { type: "NONE" },
        needsConfirmation: false,
        confirmationQuestion: null,
        missingFields: [],
        suggestions: [t("showTasks"), t("addEvent"), t("showExpenses")]
      };
    }
    
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[AI-FREE] Timeout");
      return {
        intent: "ERROR",
        reply: t("timeout"),
        action: { type: "NONE" },
        needsConfirmation: false,
        confirmationQuestion: null,
        missingFields: []
      };
    }
    
    console.error("[AI-FREE] Error:", error instanceof Error ? error.message : "Unknown");
    return {
      intent: "ERROR",
      reply: t("unexpectedError"),
      action: { type: "NONE" },
      needsConfirmation: false,
      confirmationQuestion: null,
      missingFields: []
    };
  }
}
