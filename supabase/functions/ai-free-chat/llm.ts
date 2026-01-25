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
  
  return `You are AYVO, an intelligent productivity assistant. Respond ONLY in valid JSON.

TODAY: ${today.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
TOMORROW: ${tomorrow.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}

USER CONTEXT:
- Open tasks: ${pendingTasks.length} (${pendingTasks.slice(0, 3).map((t: any) => t.title).join(", ") || "none"})
- Upcoming events: ${todayEvents.length}
- Month expenses: €${totalExpenses.toFixed(2)} / €${budget}

MANDATORY JSON CONTRACT - NO EXCEPTIONS:
{
  "reply": "brief response",
  "intent": "CREATE_TASK|CREATE_EVENT|RECORD_EXPENSE|QUERY_TASKS|QUERY_EVENTS|QUERY_BUDGET|ADVICE|SMALL_TALK",
  "action": {"type": "CREATE_TASK|CREATE_EVENT|RECORD_EXPENSE|NONE", "title": "...", "start_at": "ISO", "amount": 0, "category": "..."},
  "needsConfirmation": true/false,
  "confirmationQuestion": "question if needsConfirmation=true",
  "missingFields": ["title", "date", "time", "amount", "category"]
}

STRICT RULES:
1. If user requests an ACTION (create, add, record, delete) → intent MUST be an action, NEVER "NONE"
2. If data is missing for action → set missingFields and ask ONE brief question
3. NEVER respond "Tell me more" or vague phrases
4. For events: if date or time is missing, ask ONLY for that missing field
5. For expenses: if amount or category is missing, ask ONLY for that missing field
6. Titles: remove prefixes (create/add/make) - "create task work" → title:"Work"
7. Dates: interpret weekdays correctly relative to today

EXAMPLES:
- "padel tomorrow at 8pm" → intent:CREATE_EVENT, action:{type:CREATE_EVENT, title:"Padel", start_at:"ISO"}
- "cigarettes 5 euros" → intent:RECORD_EXPENSE, action:{type:RECORD_EXPENSE, amount:5, category:"vices"}
- "create event" → intent:CREATE_EVENT, missingFields:["title","date","time"], reply:"What event?"

Respond ONLY JSON, nothing else.`;
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
      reply: "AI configuration invalid. Try again later.",
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
        reply: response.status === 401 ? "AI configuration invalid." : "AI service unavailable.",
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
      
      if (!parsed.reply) parsed.reply = "How can I help?";
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
        reply: "Can you rephrase that?",
        intent: "ADVICE",
        action: { type: "NONE" },
        needsConfirmation: false,
        confirmationQuestion: null,
        missingFields: [],
        suggestions: ["Show tasks", "Add event", "Show expenses"]
      };
    }
    
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[AI-FREE] Timeout");
      return {
        intent: "ERROR",
        reply: "Request timed out. Try again.",
        action: { type: "NONE" },
        needsConfirmation: false,
        confirmationQuestion: null,
        missingFields: []
      };
    }
    
    console.error("[AI-FREE] Error:", error instanceof Error ? error.message : "Unknown");
    return {
      intent: "ERROR",
      reply: "Unexpected error. Try again.",
      action: { type: "NONE" },
      needsConfirmation: false,
      confirmationQuestion: null,
      missingFields: []
    };
  }
}
