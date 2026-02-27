/**
 * LAYER 1 — COGNITIVE ANALYZE (LLM)
 * 
 * RESPONSIBILITY: Understand what the user INTENDS to do.
 * OUTPUT: Structured JSON with atomic items.
 * 
 * RULES:
 * - NO execution, NO UI, NO confirmation
 * - ONE call to LLM, ONE JSON output
 * - If a phrase implies a future action → MUST produce an item
 * - If it doesn't → architectural bug, not "stupid LLM"
 */

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface AnalyzedItem {
  type: 'task' | 'event' | 'expense' | 'query' | 'greeting';
  title: string;
  description: string | null;
  date: string | null;      // YYYY-MM-DD
  time: string | null;      // HH:mm
  amount: number | null;
  currency: string | null;
  category: string | null;
  confidence: number;        // 0.0 - 1.0
}

export interface AnalyzeResult {
  language: string;
  items: AnalyzedItem[];
  uncertainties: string[];
  financial_response?: {
    summary: string;
    reasoning: string;
    actions: Array<{ type: string; title: string; description: string }>;
  };
}

// ============================================================================
// MODEL FALLBACK CHAIN
// ============================================================================

const FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-r1-0528:free",
];

// ============================================================================
// HARDENED SYSTEM PROMPT
// ============================================================================

function buildAnalyzePrompt(currentDate: string, dayOfWeek: string, userLang?: string, financialContext?: any): string {
  const langInstruction = userLang ? `\nIMPORTANT: The user's preferred language is "${userLang}". Detect and respect the language of the user's message. Keep all text fields (title, description) in the user's message language.` : '';
  
  let financialBlock = '';
  if (financialContext?.signals) {
    const s = financialContext.signals;
    const r = financialContext.risk;
    financialBlock = `

FINANCIAL CONTEXT (pre-calculated, DO NOT recalculate):
- Budget: €${s.budget || 0}, Spent: €${Math.round(s.totalSpent || 0)}
- Burn rate: ${Math.round((s.burnRate || 0) * 100)}%
- Daily safe limit: €${Math.round(s.dailySafeLimit || 0)}
- Days remaining: ${s.daysRemaining || 0}
- Projected end balance: €${Math.round(s.projectedEndBalance || 0)}
- Top category: ${s.topCategory || 'N/A'}
- Impulse days: ${s.impulseCount || 0}
- Risk level: ${r?.riskLevel || 'unknown'} (flags: ${(r?.flags || []).join(', ') || 'none'})
- Time progress: ${Math.round((s.timeProgress || 0) * 100)}%
${financialContext.lastWeeklySummary ? `- Last weekly: spent €${Math.round(financialContext.lastWeeklySummary.totalSpent)}, variance ${Math.round(financialContext.lastWeeklySummary.variance)}%` : ''}
${financialContext.lastMonthlySummary ? `- Last monthly: budget ${financialContext.lastMonthlySummary.budgetRespected ? 'respected' : 'exceeded'}, action: "${financialContext.lastMonthlySummary.strategicAction}"` : ''}

When the user asks about finances, spending, budget, or affordability:
- Use ONLY these pre-calculated values. Never invent numbers.
- Respond with a SPECIAL financial response format by adding a "financial_response" field to your JSON output:
  "financial_response": {
    "summary": "concise answer (1-2 sentences)",
    "reasoning": "brief explanation of your logic",
    "actions": [{"type": "create_task|adjust_budget|review_category", "title": "short title", "description": "what to do"}]
  }
- Max 3 actions. Be rational, clear, non-judgmental.
- Intent type: ${financialContext.userIntentType || 'analysis'}
${financialContext.activeStrategy ? `\nSTRATEGY MEMORY:\nThe user has an active strategy: "${financialContext.activeStrategy.suggestion}"\nIf they are spending in "${financialContext.activeStrategy.category}" despite this strategy, briefly mention it.` : ''}`;
  }

  return `You are Ayvro Analyze Core. Your ONLY job: segment the user message into atomic items and return JSON.${langInstruction}${financialBlock}

RESPONSE STYLE (when financial_response is used):
- Maximum 2-3 sentences in summary. No preambles. No "dipende da".
- Always end with a concrete action. Give specific numbers when data is available.
- Be direct, rational, non-judgmental.

TODAY: ${currentDate} (${dayOfWeek})

STRICT RULES:
1. Each distinct intention = ONE separate item. NEVER merge multiple actions into one.
2. Detect the user's language. Keep all text fields in that language.
3. Resolve relative dates:
   - "oggi" / "today" → ${currentDate}
   - "domani" / "tomorrow" → next day
   - "dopodomani" / "day after tomorrow" → +2 days
   - "sabato", "venerdì", etc. → next occurrence (calculate from today)
4. If date/time is ambiguous or missing → set to null. Do NOT invent.
5. Remove action prefixes from titles: "crea task lavoro" → title: "Lavoro"
6. Comma decimals: "5,5" = 5.50
7. "ricordami di X" → type: "task" (NOT event)
8. If a phrase implies a future action, it MUST produce an item. Zero tolerance.

ALLOWED TYPES:
- "task": something to do (reminder, to-do, chore)
- "event": something with a specific date+time (appointment, meeting)
- "expense": money spent or to spend
- "query": user asking to see/list their data
- "greeting": hello, thanks, small talk

TYPE DECISION RULES:
- Has specific time (e.g. "alle 10", "at 3pm") → "event"
- Has only date, no time → "task" with date
- Has amount/money → "expense"
- "mostra task", "vedi eventi" → "query"
- "ciao", "grazie" → "greeting"

TITLE RULES:
- Short, meaningful, capitalized first letter
- NO verb prefixes: remove "crea", "aggiungi", "ricordami di", "devo"
- NO generic titles: "task", "evento", "cosa" are FORBIDDEN

NEGATIVE EXAMPLES (DO NOT DO THIS):
❌ "sabato spesa, domani lavoro alle 10" → 1 item with title "Sabato spesa, domani lavoro alle 10"
❌ Merging distinct actions into one item
❌ Title: "Task" or "Evento" or "Cosa"
❌ Inventing a time when user didn't specify one
❌ Returning 0 items for "devo comprare il latte" (this is clearly a task!)

POSITIVE EXAMPLES:

Input: "sabato spesa, domani lavoro alle 10 e dopodomani vado a sciare e spendo 50"
Output: 4 items:
1. {"type":"task","title":"Spesa","date":"SATURDAY_DATE","time":null,"amount":null,"confidence":0.9}
2. {"type":"event","title":"Lavoro","date":"TOMORROW_DATE","time":"10:00","amount":null,"confidence":0.95}
3. {"type":"event","title":"Sciare","date":"DAY_AFTER_DATE","time":null,"amount":null,"confidence":0.85}
4. {"type":"expense","title":"Sci","date":"DAY_AFTER_DATE","time":null,"amount":50,"currency":"EUR","category":"svago","confidence":0.9}

Input: "domani lavoro, venerdì ho padel e sabato ho il dottore"
Output: 3 items (all events because they have specific days):
1. {"type":"event","title":"Lavoro","date":"TOMORROW","time":null,"confidence":0.9}
2. {"type":"event","title":"Padel","date":"FRIDAY","time":null,"confidence":0.9}
3. {"type":"event","title":"Dottore","date":"SATURDAY","time":null,"confidence":0.9}

Input: "ciao"
Output: 1 item: {"type":"greeting","title":"ciao","confidence":1.0}

Input: "ricordami di comprare il latte"
Output: 1 item: {"type":"task","title":"Comprare il latte","date":null,"time":null,"confidence":0.95}

Input: "mostra i miei task"
Output: 1 item: {"type":"query","title":"tasks","confidence":0.95}

Input: "pizza 12 euro"
Output: 1 item: {"type":"expense","title":"Pizza","amount":12,"currency":"EUR","category":"cibo","confidence":0.95}

OUTPUT FORMAT (STRICT JSON, no markdown, no comments, no extra text):
{
  "language": "it",
  "items": [
    {
      "type": "task|event|expense|query|greeting",
      "title": "Short Title",
      "description": null,
      "date": "YYYY-MM-DD or null",
      "time": "HH:mm or null",
      "amount": null,
      "currency": null,
      "category": null,
      "confidence": 0.9
    }
  ],
  "uncertainties": []${financialContext?.signals ? ',\n  "financial_response": null' : ''}
}`;
}

// ============================================================================
// DAY OF WEEK HELPER
// ============================================================================

function getDayOfWeek(dateStr: string): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const daysIT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const d = new Date(dateStr);
  return `${daysIT[d.getDay()]} / ${days[d.getDay()]}`;
}

// ============================================================================
// ANALYZE FUNCTION
// ============================================================================

export async function analyzeMessage(userMessage: string, userLang?: string, financialContext?: any): Promise<AnalyzeResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  
  const fallbackResult: AnalyzeResult = {
    language: "unknown",
    items: [],
    uncertainties: ["Analysis failed - API error"]
  };
  
  if (!apiKey || !apiKey.startsWith("sk-or-")) {
    console.error("[ANALYZE-CORE] Missing or invalid OPENROUTER_API_KEY");
    return fallbackResult;
  }
  
  const envModel = Deno.env.get("OPENROUTER_MODEL");
  const modelsToTry = envModel && envModel.includes("/") 
    ? [envModel, ...FALLBACK_MODELS.filter(m => m !== envModel)]
    : [...FALLBACK_MODELS];
  
  const currentDate = new Date().toISOString().split('T')[0];
  const dayOfWeek = getDayOfWeek(currentDate);
  const systemPrompt = buildAnalyzePrompt(currentDate, dayOfWeek, userLang, financialContext);
  
  console.log(`[ANALYZE-CORE] Processing: "${userMessage.substring(0, 100)}", today=${currentDate} (${dayOfWeek})`);
  
  for (const model of modelsToTry) {
    try {
      console.log(`[ANALYZE-CORE] Trying model: ${model}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ayvro.app",
          "X-Title": "Ayvro-AnalyzeCore"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
          ],
          max_tokens: 2500,
          temperature: 0.1
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[ANALYZE-CORE] API error: ${response.status}, model: ${model}, body: ${errorBody.substring(0, 500)}`);
        continue;
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      console.log(`[ANALYZE-CORE] Raw response (model=${model}):`, content.substring(0, 800));
      
      // Parse JSON - handle <think> tags and code blocks
      let cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      cleanContent = cleanContent.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      
      // Find JSON object
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`[ANALYZE-CORE] No JSON found in response from ${model}`);
        continue;
      }
      
      const parsed = JSON.parse(jsonMatch[0]) as AnalyzeResult;
      
      // Normalize
      if (!parsed.items) parsed.items = [];
      if (!parsed.uncertainties) parsed.uncertainties = [];
      if (!parsed.language) parsed.language = "unknown";
      
      // Normalize items
      parsed.items = parsed.items.map(item => ({
        type: item.type || 'task',
        title: item.title || '',
        description: item.description || null,
        date: item.date || null,
        time: item.time || null,
        amount: typeof item.amount === 'number' ? item.amount : null,
        currency: item.currency || null,
        category: item.category || null,
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.5
      }));
      
      console.log(`[ANALYZE-CORE] Success (model=${model}): ${parsed.items.length} items`);
      
      return parsed;
      
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[ANALYZE-CORE] Timeout on model: ${model}`);
        continue;
      }
      console.error(`[ANALYZE-CORE] Error on model ${model}:`, error instanceof Error ? error.message : "Unknown");
      continue;
    }
  }
  
  console.error("[ANALYZE-CORE] All models failed");
  return fallbackResult;
}
