/**
 * MODULE 3 + 4 — CONVERSATIONAL BRAIN + TRANSLATOR
 * 
 * Brain: Handles GENERAL_CHAT, PLANNING, and natural conversation.
 * Translator: Converts DecisionEngine JSON into human-friendly responses.
 */

import { DecisionResult } from "./decisionEngine.ts";

const FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-r1-0528:free",
];

// ============================================================================
// CONVERSATIONAL BRAIN
// ============================================================================

const BRAIN_PROMPT = `You are Ayvro, an intelligent and concrete personal assistant.

You can:
- explain decisions
- help plan
- ask smart questions
- maintain conversational context

Do NOT generate JSON.
Do NOT invent numbers.
If you receive pre-calculated financial data, use it without modifying.
If you don't have data, ask for clarification.

Reply naturally but concisely.
Avoid generic or motivational phrases.
Keep responses to 2-3 sentences maximum.`;

export async function conversationalReply(
  userMessage: string,
  userLang: string = 'it',
  context?: { todos?: any[]; events?: any[]; financialSummary?: string }
): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");

  if (!apiKey || !apiKey.startsWith("sk-or-")) {
    return getFallbackReply(userLang);
  }

  const envModel = Deno.env.get("OPENROUTER_MODEL");
  const modelsToTry = envModel && envModel.includes("/")
    ? [envModel, ...FALLBACK_MODELS.filter(m => m !== envModel)]
    : [...FALLBACK_MODELS];

  let contextBlock = '';
  if (context) {
    if (context.todos?.length) {
      contextBlock += `\nUser's pending tasks: ${context.todos.filter(t => !t.completed).map(t => t.title).join(', ')}`;
    }
    if (context.events?.length) {
      contextBlock += `\nUpcoming events: ${context.events.map(e => `${e.title} (${new Date(e.start_time).toLocaleDateString()})`).join(', ')}`;
    }
    if (context.financialSummary) {
      contextBlock += `\nFinancial context: ${context.financialSummary}`;
    }
  }

  const userPrompt = `${contextBlock ? `Context:${contextBlock}\n\n` : ''}User (language: ${userLang}): ${userMessage}`;

  for (const model of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ayvro.app",
          "X-Title": "Ayvro-Brain"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: BRAIN_PROMPT },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 300,
          temperature: 0.5
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[BRAIN] API error ${response.status} on ${model}`);
        continue;
      }

      const data = await response.json();
      let content = (data.choices?.[0]?.message?.content || "").trim();
      content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

      if (content) {
        console.log(`[BRAIN] Success (model=${model})`);
        return content;
      }

      continue;

    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[BRAIN] Timeout on ${model}`);
      } else {
        console.error(`[BRAIN] Error on ${model}:`, error instanceof Error ? error.message : "Unknown");
      }
      continue;
    }
  }

  return getFallbackReply(userLang);
}

function getFallbackReply(lang: string): string {
  const fallbacks: Record<string, string> = {
    it: "Non ho capito bene. Puoi riformulare?",
    en: "I didn't quite understand. Can you rephrase?",
    es: "No entendí bien. ¿Puedes reformular?",
    fr: "Je n'ai pas bien compris. Peux-tu reformuler ?",
    de: "Ich habe nicht ganz verstanden. Kannst du umformulieren?",
  };
  return fallbacks[lang] || fallbacks['en'];
}

// ============================================================================
// TRANSLATOR (Decision → Natural language)
// ============================================================================

const TRANSLATOR_PROMPT = `You receive a JSON object with:
- summary
- reasoning
- actions[]

Transform it into a natural response for the user.

Maintain:
- clarity
- concreteness
- practical suggestions

Do NOT invent new actions.
Do NOT change the meaning.
Do NOT generate JSON.
Keep it to 2-3 sentences. Be direct.`;

export async function translateDecision(
  decision: DecisionResult,
  userLang: string = 'it'
): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");

  // If no API key, do deterministic translation
  if (!apiKey || !apiKey.startsWith("sk-or-")) {
    return deterministicTranslation(decision);
  }

  const envModel = Deno.env.get("OPENROUTER_MODEL");
  const modelsToTry = envModel && envModel.includes("/")
    ? [envModel, ...FALLBACK_MODELS.filter(m => m !== envModel)]
    : [...FALLBACK_MODELS];

  const userPrompt = `Language: ${userLang}

Decision JSON:
${JSON.stringify(decision, null, 2)}`;

  for (const model of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ayvro.app",
          "X-Title": "Ayvro-Translator"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: TRANSLATOR_PROMPT },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 200,
          temperature: 0.3
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const data = await response.json();
      let content = (data.choices?.[0]?.message?.content || "").trim();
      content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

      if (content) {
        console.log(`[TRANSLATOR] Success (model=${model})`);
        return content;
      }
      continue;

    } catch {
      continue;
    }
  }

  return deterministicTranslation(decision);
}

function deterministicTranslation(decision: DecisionResult): string {
  let result = decision.summary;
  
  const realActions = decision.actions.filter(a => a.type !== 'none');
  if (realActions.length > 0) {
    result += ' ' + realActions.map(a => `${a.title}: ${a.description}`).join(' ');
  }

  return result;
}
