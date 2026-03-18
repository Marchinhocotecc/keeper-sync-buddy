/**
 * MODULE 3 + 4 — CONVERSATIONAL BRAIN + TRANSLATOR
 * 
 * Brain: Handles GENERAL_CHAT, PLANNING, and natural conversation.
 * Translator: Converts DecisionEngine JSON into human-friendly responses.
 * 
 * v2: Receives conversation memory for coherent follow-ups.
 */

import { DecisionResult } from "./decisionEngine.ts";

const FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-r1-0528:free",
];

// ============================================================================
// CONVERSATION MEMORY TYPE
// ============================================================================

export interface ConversationMemory {
  lastIntent?: string;
  lastUserMessage?: string;
  lastAssistantResponse?: string;
}

// ============================================================================
// CONVERSATIONAL BRAIN
// ============================================================================

const BRAIN_PROMPT = `Sei Ayvro, assistente personale intelligente e concreto.

Puoi:
- spiegare decisioni
- aiutare a pianificare
- fare domande intelligenti
- mantenere contesto conversazionale

Non generare JSON.
Non inventare numeri.
Se ricevi dati finanziari già calcolati, usali senza modificarli.
Se non hai dati, chiedi chiarimento con una domanda intelligente e specifica.

Rispondi in modo naturale ma conciso.
Evita frasi generiche o motivazionali.
Massimo 2-3 frasi.

REGOLE CRITICHE:
- Se l'utente chiede "perché?", "come mai?", "spiegami" → spiega il contesto della conversazione precedente
- Se l'utente chiede di pianificare (allenamento, routine, orari) → dai suggerimenti concreti basati sui dati disponibili
- NON rispondere MAI "non ho capito" se la frase è chiara
- Se sei in dubbio → fai una domanda intelligente, NON dire "non ho capito"`;

export async function conversationalReply(
  userMessage: string,
  userLang: string = 'it',
  context?: { todos?: any[]; events?: any[]; financialSummary?: string },
  memory?: ConversationMemory
): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");

  if (!apiKey || !apiKey.startsWith("sk-or-")) {
    return getFallbackReply(userLang, memory);
  }

  const envModel = Deno.env.get("OPENROUTER_MODEL");
  const modelsToTry = envModel && envModel.includes("/")
    ? [envModel, ...FALLBACK_MODELS.filter(m => m !== envModel)]
    : [...FALLBACK_MODELS];

  let contextBlock = '';
  
  // Add conversation memory for coherent follow-ups
  if (memory?.lastUserMessage && memory?.lastAssistantResponse) {
    contextBlock += `\nConversazione precedente:`;
    contextBlock += `\n- Utente: "${memory.lastUserMessage}"`;
    contextBlock += `\n- Assistente: "${memory.lastAssistantResponse}"`;
    if (memory.lastIntent) {
      contextBlock += `\n- Intent precedente: ${memory.lastIntent}`;
    }
  }

  if (context) {
    if (context.todos?.length) {
      const pending = context.todos.filter(t => !t.completed);
      if (pending.length > 0) {
        contextBlock += `\nTask pendenti: ${pending.map(t => t.title).join(', ')}`;
      }
    }
    if (context.events?.length) {
      contextBlock += `\nProssimi eventi: ${context.events.map(e => `${e.title} (${new Date(e.start_time).toLocaleDateString()})`).join(', ')}`;
    }
    if (context.financialSummary) {
      contextBlock += `\nContesto finanziario: ${context.financialSummary}`;
    }
  }

  const userPrompt = `${contextBlock ? `Contesto:${contextBlock}\n\n` : ''}Utente (lingua: ${userLang}): ${userMessage}`;

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

  return getFallbackReply(userLang, memory);
}

function getFallbackReply(lang: string, memory?: ConversationMemory): string {
  // If there's memory context, give a contextual fallback instead of "non ho capito"
  if (memory?.lastAssistantResponse) {
    const contextFallbacks: Record<string, string> = {
      it: "Puoi specificare meglio cosa vorresti sapere?",
      en: "Can you be more specific about what you'd like to know?",
      es: "¿Puedes especificar mejor qué te gustaría saber?",
      fr: "Peux-tu préciser ce que tu voudrais savoir ?",
      de: "Kannst du genauer sagen, was du wissen möchtest?",
    };
    return contextFallbacks[lang] || contextFallbacks['en'];
  }

  const fallbacks: Record<string, string> = {
    it: "Non ho abbastanza informazioni, puoi specificare meglio?",
    en: "I don't have enough information, can you be more specific?",
    es: "No tengo suficiente información, ¿puedes ser más específico?",
    fr: "Je n'ai pas assez d'informations, peux-tu être plus précis ?",
    de: "Ich habe nicht genug Informationen, kannst du genauer sein?",
  };
  return fallbacks[lang] || fallbacks['en'];
}

// ============================================================================
// TRANSLATOR (Decision → Natural language)
// ============================================================================

const TRANSLATOR_PROMPT = `Ricevi un oggetto JSON con:

- summary
- reasoning
- actions[]

Trasformalo in una risposta naturale per l'utente.

Mantieni:
- chiarezza
- concretezza
- suggerimenti pratici

Non inventare nuove azioni.
Non cambiare il significato.
Non generare JSON.
Massimo 2-3 frasi. Sii diretto.`;

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

  const userPrompt = `Lingua: ${userLang}

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
