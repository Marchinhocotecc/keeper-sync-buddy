/**
 * AYVO Analyze Core
 * Pure semantic understanding layer - NO execution, NO UI, NO confirmation
 * Output: Structured JSON only
 */

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface AnalyzedItem {
  type: 'task' | 'event' | 'reminder' | 'expense' | 'note' | 'question' | 'reflection';
  title: string;
  description: string | null;
  date: string | null;      // ISO date
  time: string | null;      // HH:mm
  datetime: string | null;  // ISO datetime
  amount: number | null;
  currency: string | null;
  people: string[];
  location: string | null;
  recurrence: string | null;
}

export interface AnalyzedEntities {
  dates: string[];
  times: string[];
  people: string[];
  places: string[];
  amounts: { value: number; currency: string | null }[];
}

export interface AnalyzeResult {
  language: string;
  confidence: number;
  summary: string;
  items: AnalyzedItem[];
  entities: AnalyzedEntities;
  uncertainties: string[];
}

// ============================================================================
// MODEL FALLBACK CHAIN
// ============================================================================

const FALLBACK_MODELS = [
  "deepseek/deepseek-r1:free",
  "deepseek/deepseek-chat:free",
  "deepseek/deepseek-r1-0528:free",
];

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildAnalyzePrompt(currentDate: string): string {
  return `You are AYVO Analyze Core. Your ONLY task: understand the user's message and return structured JSON.

RULES:
- Do NOT execute actions, ask questions, confirm anything, or generate UI text.
- Detect user's language. Preserve it in all text fields.
- Today is: ${currentDate}. Resolve relative dates (tomorrow, next week, sabato, dopodomani, etc.)

MULTI-INTENT: One message may contain multiple intentions. Split them correctly.
Example: "Saturday shopping, Sunday trip, spent 50" → Task + Event + Expense

ALLOWED TYPES: task, event, reminder, expense, note, question, reflection

For every item extract:
- title (short, meaningful - NO verb prefixes like "crea", "aggiungi", "ricordami")
- description (optional, null if none)
- date (YYYY-MM-DD or null)
- time (HH:mm or null)
- datetime (YYYY-MM-DDTHH:mm:ss if both date+time exist, else null)
- amount (number if money, else null)
- currency (ISO code or null)
- people (array of names)
- location (string or null)
- recurrence (daily/weekly/monthly or null)

TEMPORAL REASONING:
- today → ${currentDate}
- tomorrow → next day
- dopodomani → day after tomorrow
- sabato/domenica → next occurrence
- If ambiguous → null + add to uncertainties

OUTPUT FORMAT (STRICT - JSON only, no markdown, no comments):
{
  "language": "",
  "confidence": 0.0,
  "summary": "",
  "items": [{ "type": "", "title": "", "description": null, "date": null, "time": null, "datetime": null, "amount": null, "currency": null, "people": [], "location": null, "recurrence": null }],
  "entities": { "dates": [], "times": [], "people": [], "places": [], "amounts": [] },
  "uncertainties": []
}

If no actionable intent exists, return empty items array.`;
}

// ============================================================================
// ANALYZE FUNCTION
// ============================================================================

export async function analyzeMessage(userMessage: string): Promise<AnalyzeResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  
  const fallbackResult: AnalyzeResult = {
    language: "unknown",
    confidence: 0,
    summary: "",
    items: [],
    entities: { dates: [], times: [], people: [], places: [], amounts: [] },
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
  const systemPrompt = buildAnalyzePrompt(currentDate);
  
  console.log(`[ANALYZE-CORE] Processing: "${userMessage.substring(0, 100)}", models: ${modelsToTry.join(', ')}`);
  
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
          "HTTP-Referer": "https://ayvo.app",
          "X-Title": "AYVO-AnalyzeCore"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
          ],
          max_tokens: 1000,
          temperature: 0.1
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[ANALYZE-CORE] API error: ${response.status}, model: ${model}, body: ${errorBody.substring(0, 500)}`);
        // Try next model
        continue;
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      console.log(`[ANALYZE-CORE] Raw response (model=${model}):`, content.substring(0, 500));
      
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
      
      // Validate and normalize
      if (!parsed.items) parsed.items = [];
      if (!parsed.entities) parsed.entities = { dates: [], times: [], people: [], places: [], amounts: [] };
      if (!parsed.uncertainties) parsed.uncertainties = [];
      if (typeof parsed.confidence !== 'number') parsed.confidence = 0.5;
      if (!parsed.language) parsed.language = "unknown";
      if (!parsed.summary) parsed.summary = "";
      
      // Normalize items
      parsed.items = parsed.items.map(item => ({
        type: item.type || 'task',
        title: item.title || '',
        description: item.description || null,
        date: item.date || null,
        time: item.time || null,
        datetime: item.datetime || null,
        amount: typeof item.amount === 'number' ? item.amount : null,
        currency: item.currency || null,
        people: Array.isArray(item.people) ? item.people : [],
        location: item.location || null,
        recurrence: item.recurrence || null
      }));
      
      console.log(`[ANALYZE-CORE] Success (model=${model}): ${parsed.items.length} items, confidence: ${parsed.confidence}`);
      
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
  
  // All models failed
  console.error("[ANALYZE-CORE] All models failed");
  return fallbackResult;
}
