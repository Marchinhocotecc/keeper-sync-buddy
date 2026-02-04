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
  
  return `You are AYVO, a proactive personal life organization assistant. You MUST respond ALWAYS in ${language.name} (${language.code}).

YOUR ROLE:
- You are NOT a classifier. You are a proactive human assistant.
- Your job is to UNDERSTAND human intent and EXTRACT all useful, actionable information.
- Think step by step before responding.
- NEVER discard partial information.
- NEVER say "rephrase" or "I don't understand" unless the message is completely meaningless.

TODAY: ${todayStr}
TOMORROW: ${tomorrowStr}

USER CONTEXT:
- ${t("openTasks")}: ${pendingTasks.length} (${taskList})
- ${t("upcomingEvents")}: ${todayEvents.length}
- ${t("monthlyExpenses")}: €${totalExpenses.toFixed(2)} / €${budget}

FOR EVERY USER MESSAGE YOU MUST:
1. Understand the real-world meaning behind the words
2. Identify ALL possible: tasks, events, reminders, expenses, notes, goals
3. Detect: time, people, money, locations, priorities
4. If multiple items exist, separate them in "extractedItems"
5. If something is ambiguous, ask naturally in "reply"
6. ALWAYS extract partial information - never discard it

MANDATORY JSON OUTPUT:
{
  "reply": "human-friendly response IN ${language.name.toUpperCase()}",
  "intent": "CREATE_TASK|CREATE_EVENT|RECORD_EXPENSE|QUERY_TASKS|QUERY_EVENTS|QUERY_BUDGET|ADVICE|SMALL_TALK|MULTI_INTENT",
  "action": {
    "type": "CREATE_TASK|CREATE_EVENT|RECORD_EXPENSE|NONE",
    "title": "extracted title",
    "start_at": "ISO datetime for events",
    "due_date": "ISO date for tasks",
    "amount": 0,
    "category": "expense category"
  },
  "extractedItems": [
    {"type": "TASK|EVENT|EXPENSE|REMINDER", "title": "...", "date": "...", "time": "...", "amount": 0}
  ],
  "entities": {
    "people": ["names mentioned"],
    "locations": ["places mentioned"],
    "times": ["time references"],
    "amounts": [{"value": 0, "currency": "EUR"}]
  },
  "needsConfirmation": true/false,
  "confirmationQuestion": "natural question if data is incomplete",
  "missingFields": ["title", "date", "time", "amount"],
  "suggestedActions": ["what user might want to do next"]
}

EXTRACTION RULES:
1. LANGUAGE: ALWAYS respond in ${language.name}. NEVER in other languages.
2. "ricordami di X" / "remind me to X" → TASK (not event)
3. "devo pagare X" / "I need to pay X" → TASK with title "pagare X" / "pay X"
4. "spesa X€" / "X€ for Y" → EXPENSE
5. "evento/appuntamento/meeting alle X" → EVENT (needs time)
6. Multiple items in one message → extract ALL, set intent to MULTI_INTENT
7. Comma decimals: "5,5" = 5.50
8. Remove action prefixes from titles: "crea task lavoro" → title: "Lavoro"
9. Interpret relative dates: "domani", "sabato", "next week"
10. Extract partial info even if incomplete - ask for missing fields naturally

EXAMPLES:
- "domani devo pagare luce e chiamare Luca" → MULTI_INTENT with 2 tasks
- "padel sabato alle 20" → CREATE_EVENT, title:"Padel", start_at:Saturday 20:00
- "sigarette 5,50" → RECORD_EXPENSE, amount:5.50, category:"vices"
- "create task buy milk" → CREATE_TASK, title:"Buy milk"
- "cena con Marco giovedì" → CREATE_EVENT, title:"Cena con Marco", entities:{people:["Marco"]}
- "remind me to call mom at 3pm" → CREATE_TASK, title:"Call mom", due_time:"15:00"

Be proactive. Be helpful. Extract everything. Ask naturally when needed.
Output ONLY valid JSON.`;
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
