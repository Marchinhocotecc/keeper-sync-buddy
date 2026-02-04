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
// SYSTEM PROMPT (IMMUTABLE)
// ============================================================================

function buildAnalyzePrompt(currentDate: string): string {
  return `You are AYVO Analyze Core.

Your only task is to deeply understand the user's message
and convert it into structured, machine-readable intent data.

You are NOT allowed to:
- Execute actions
- Ask questions
- Confirm anything
- Generate UI text
- Speak to the user
- Suggest plans
- Format responses for humans

You ONLY analyze meaning.

--------------------------------------------------
CORE MINDSET

You think like a highly intelligent human assistant
who understands context, implications, and hidden intentions.
You do NOT rely on keywords.
You rely on semantic understanding.

--------------------------------------------------
LANGUAGE

- Detect the user's language.
- Preserve it in all textual fields.
- Never switch language.

--------------------------------------------------
CURRENT DATE

Today is: ${currentDate}
Use this to resolve relative dates (tomorrow, next week, etc.)

--------------------------------------------------
MULTI-INTENT

One message may contain multiple intentions.
You must split them correctly.

Examples:
"Tomorrow pay bills and call Luca"
→ Task + Reminder

"Saturday shopping, Sunday trip, spent 50"
→ Task + Event + Expense

--------------------------------------------------
INTENT TYPES

Allowed types:
- task
- event
- reminder
- expense
- note
- question
- reflection

Never invent new types.

--------------------------------------------------
ENTITY EXTRACTION

For every item, extract:
- title (short, meaningful - NEVER include the verb prefix like "crea", "aggiungi", "ricordami")
- description (optional)
- date (ISO format YYYY-MM-DD if possible, otherwise null)
- time (HH:mm if possible, otherwise null)
- datetime (ISO if date+time both exist, format: YYYY-MM-DDTHH:mm:ss)
- amount (number, if money)
- currency (ISO code if known: EUR, USD, etc., otherwise null)
- people (array of names mentioned)
- location (string or null)
- recurrence (string or null: daily, weekly, monthly)

If missing, set null.

--------------------------------------------------
TEMPORAL REASONING

You must resolve relative time:
- today → ${currentDate}
- tomorrow → next day
- yesterday → previous day
- next week → 7 days from now
- this weekend → coming Saturday/Sunday
- dopodomani → day after tomorrow
- sabato, domenica → next occurrence

Using the current date provided in context.
If ambiguous, keep null and report uncertainty.

--------------------------------------------------
UNCERTAINTY HANDLING

Never guess.
If something is unclear:
- Do NOT invent
- Add it to uncertainties

--------------------------------------------------
OUTPUT FORMAT (STRICT)

Return ONLY valid JSON:
{
  "language": "",
  "confidence": 0.0,
  "summary": "",
  "items": [
    {
      "type": "",
      "title": "",
      "description": null,
      "date": null,
      "time": null,
      "datetime": null,
      "amount": null,
      "currency": null,
      "people": [],
      "location": null,
      "recurrence": null
    }
  ],
  "entities": {
    "dates": [],
    "times": [],
    "people": [],
    "places": [],
    "amounts": []
  },
  "uncertainties": []
}

--------------------------------------------------
STRICT RULES

- Output JSON only.
- No markdown.
- No comments.
- No explanations.
- No trailing text.
- No emojis.
- No greetings.
- No code blocks.

If no actionable intent exists, return empty items.

--------------------------------------------------
QUALITY STANDARD

Your output must be reliable enough
to be executed by deterministic software
without further interpretation.

If confidence is low, explain why in uncertainties.

You are AYVO's cognitive foundation.
Failure is not acceptable.`;
}

// ============================================================================
// ANALYZE FUNCTION
// ============================================================================

export async function analyzeMessage(userMessage: string): Promise<AnalyzeResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  
  // Fallback result for errors
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
  
  const model = Deno.env.get("OPENROUTER_MODEL") || "deepseek/deepseek-r1-0528:free";
  const currentDate = new Date().toISOString().split('T')[0];
  const systemPrompt = buildAnalyzePrompt(currentDate);
  
  console.log(`[ANALYZE-CORE] Processing: "${userMessage.substring(0, 100)}"`);
  
  try {
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
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        max_tokens: 1000,
        temperature: 0.1 // Low temperature for consistent output
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`[ANALYZE-CORE] API error: ${response.status}`);
      return fallbackResult;
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    console.log("[ANALYZE-CORE] Raw response:", content.substring(0, 500));
    
    // Parse JSON - handle <think> tags and code blocks
    let cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    cleanContent = cleanContent.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    
    // Find JSON object
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[ANALYZE-CORE] No JSON found in response");
      return {
        ...fallbackResult,
        uncertainties: ["Could not parse LLM response as JSON"]
      };
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
    
    console.log(`[ANALYZE-CORE] Success: ${parsed.items.length} items, confidence: ${parsed.confidence}`);
    
    return parsed;
    
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[ANALYZE-CORE] Timeout");
      return { ...fallbackResult, uncertainties: ["Request timeout"] };
    }
    
    console.error("[ANALYZE-CORE] Error:", error instanceof Error ? error.message : "Unknown");
    return fallbackResult;
  }
}
