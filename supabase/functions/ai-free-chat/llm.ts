/**
 * LLM Module - OpenRouter API Integration
 */

import { UserContext } from "./types.ts";

const DEFAULT_MODEL = "deepseek/deepseek-r1-0528:free";

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export function buildSystemPrompt(context: UserContext): string {
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

export async function callOpenRouterAI(systemPrompt: string, userMessage: string): Promise<any> {
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
        "HTTP-Referer": "https://lumi-app.lovable.app",
        "X-Title": "LUMI"
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
    
    try {
      let cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      const jsonMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)```/) || cleanContent.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : cleanContent.trim();
      const parsed = JSON.parse(jsonStr);
      
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
