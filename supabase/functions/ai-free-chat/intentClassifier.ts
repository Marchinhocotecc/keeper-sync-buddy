/**
 * MODULE 1 — INTENT CLASSIFIER
 * Ultra-light LLM call: receives message, returns ONLY a label.
 * max_tokens: 20, temperature: 0
 */

export type IntentLabel =
  | 'FINANCIAL_DECISION'
  | 'FINANCIAL_QUERY'
  | 'TASK_QUERY'
  | 'EVENT_QUERY'
  | 'PLANNING'
  | 'GENERAL_CHAT'
  | 'UNKNOWN';

const VALID_LABELS: IntentLabel[] = [
  'FINANCIAL_DECISION', 'FINANCIAL_QUERY', 'TASK_QUERY',
  'EVENT_QUERY', 'PLANNING', 'GENERAL_CHAT', 'UNKNOWN'
];

const CLASSIFIER_PROMPT = `You are an intent classifier for a personal assistant.

Classify the user message into ONE of these categories:

- FINANCIAL_DECISION (e.g. can I afford it?, am I spending too much?, how much can I spend today?)
- FINANCIAL_QUERY (e.g. how am I doing?, how much did I spend?, risk level?)
- TASK_QUERY (e.g. list tasks, what do I have today?, show my to-do)
- EVENT_QUERY (e.g. today's events?, what's on my calendar?)
- PLANNING (e.g. when should I work out?, help me plan)
- GENERAL_CHAT (any normal conversation, greetings, thanks, small talk)
- UNKNOWN (cannot determine)

Reply ONLY with the label.
No extra text. No explanation. No punctuation.`;

const FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-r1-0528:free",
];

/**
 * Deterministic fallback when LLM is unavailable
 */
function classifyDeterministic(message: string): IntentLabel {
  const lower = message.toLowerCase().trim();

  // Financial decision
  if (/(?:posso permettermi|posso spendere|sto spendendo troppo|quanto posso|ce la faccio|can i afford|budget enough)/i.test(lower)) {
    return 'FINANCIAL_DECISION';
  }

  // Financial query
  if (/(?:come sto andando|quanto ho speso|livello di rischio|situazione finanziaria|how much.*spent|burn rate|risk level|spending|spese totali|budget)/i.test(lower)) {
    return 'FINANCIAL_QUERY';
  }

  // Task query
  if (/(?:mostra.*task|elenca.*task|lista.*task|i miei task|show.*task|my tasks|cose da fare|to-?do)/i.test(lower)) {
    return 'TASK_QUERY';
  }

  // Event query
  if (/(?:mostra.*event|elenca.*event|eventi di oggi|calendar|impegni|appuntamenti|show.*event)/i.test(lower)) {
    return 'EVENT_QUERY';
  }

  // Planning
  if (/(?:quando.*consigli|pianifica|organizza.*giornata|plan|schedule|help me plan|quando dovrei)/i.test(lower)) {
    return 'PLANNING';
  }

  return 'UNKNOWN';
}

export async function classifyIntent(message: string): Promise<IntentLabel> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");

  if (!apiKey || !apiKey.startsWith("sk-or-")) {
    console.log("[INTENT-CLASSIFIER] No API key, using deterministic fallback");
    return classifyDeterministic(message);
  }

  const envModel = Deno.env.get("OPENROUTER_MODEL");
  const modelsToTry = envModel && envModel.includes("/")
    ? [envModel, ...FALLBACK_MODELS.filter(m => m !== envModel)]
    : [...FALLBACK_MODELS];

  for (const model of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ayvro.app",
          "X-Title": "Ayvro-IntentClassifier"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: CLASSIFIER_PROMPT },
            { role: "user", content: message }
          ],
          max_tokens: 20,
          temperature: 0
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[INTENT-CLASSIFIER] API error ${response.status} on model ${model}`);
        continue;
      }

      const data = await response.json();
      let content = (data.choices?.[0]?.message?.content || "").trim();
      
      // Clean think tags and whitespace
      content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      content = content.toUpperCase().replace(/[^A-Z_]/g, "");

      if (VALID_LABELS.includes(content as IntentLabel)) {
        console.log(`[INTENT-CLASSIFIER] Result: ${content} (model=${model})`);
        return content as IntentLabel;
      }

      // Try partial match
      const found = VALID_LABELS.find(l => content.includes(l));
      if (found) {
        console.log(`[INTENT-CLASSIFIER] Partial match: ${found} (model=${model})`);
        return found;
      }

      console.warn(`[INTENT-CLASSIFIER] Invalid label "${content}" from ${model}`);
      continue;

    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[INTENT-CLASSIFIER] Timeout on ${model}`);
      } else {
        console.error(`[INTENT-CLASSIFIER] Error on ${model}:`, error instanceof Error ? error.message : "Unknown");
      }
      continue;
    }
  }

  console.log("[INTENT-CLASSIFIER] All models failed, using deterministic");
  return classifyDeterministic(message);
}
