/**
 * FALLBACK ANALYZER — analyzeCore (simplified)
 * 
 * Called ONLY when Intent Classifier returns UNKNOWN
 * and deterministic router doesn't match.
 * 
 * Handles: task/event/expense extraction from natural language.
 * Financial logic has been moved to decisionEngine.ts.
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

function buildAnalyzePrompt(currentDate: string, dayOfWeek: string, userLang?: string): string {
  const langInstruction = userLang ? `\nIMPORTANT: The user's preferred language is "${userLang}". Detect and respect the language of the user's message. Keep all text fields (title, description) in the user's message language.` : '';

  return `You are Ayvro Analyze Core (FALLBACK). Your ONLY job: segment the user message into atomic items and return JSON.${langInstruction}

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
  "uncertainties": []
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

export async function analyzeMessage(userMessage: string, userLang?: string): Promise<AnalyzeResult> {
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
  const systemPrompt = buildAnalyzePrompt(currentDate, dayOfWeek, userLang);
  
  // console.log(`[ANALYZE-CORE] Fallback processing: "${userMessage.substring(0, 100)}", today=${currentDate} (${dayOfWeek})`);
  
  for (const model of modelsToTry) {
    try {
      // console.log(`[ANALYZE-CORE] Trying model: ${model}`);
      
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
      
      // console.log(`[ANALYZE-CORE] Raw response (model=${model}):`, content.substring(0, 800));
      
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
      
      // console.log(`[ANALYZE-CORE] Success (model=${model}): ${parsed.items.length} items`);
      
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
