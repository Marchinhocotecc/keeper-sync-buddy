/**
 * MODULE 1 — INTENT CLASSIFIER
 * Ultra-light LLM call: receives message, returns ONLY a label.
 * max_tokens: 20, temperature: 0
 * 
 * v3: LLM is the PRIMARY source of truth.
 * Deterministic patterns are ONLY used as fallback when LLM fails.
 * Follow-up detection expanded with broader patterns.
 */

import {
  TASK_QUERY_PATTERN, EVENT_QUERY_PATTERN, EXPENSE_QUERY_PATTERN,
  FINANCIAL_DECISION_PATTERN, FINANCIAL_QUERY_PATTERN,
  PLANNING_PATTERN, GENERAL_CHAT_PATTERN
} from "./terminology.ts";

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

const CLASSIFIER_PROMPT = `You are an intent classifier for a personal assistant app.

Classify the user message into EXACTLY ONE of these categories:

- FINANCIAL_DECISION (can I afford X?, am I spending too much?, how much can I spend today?)
- FINANCIAL_QUERY (how am I doing financially?, how much have I spent?, risk level?, spending summary)
- TASK_QUERY (show tasks, what tasks do I have?, my to-do list, what do I need to do?)
- EVENT_QUERY (show events, what events today?, calendar, appointments)
- PLANNING (when should I exercise?, plan my day, help me organize, suggest a routine)
- GENERAL_CHAT (greetings, thanks, casual conversation, follow-ups like "why?", "explain", advice requests, "what can you do?", "help me")
- UNKNOWN (cannot determine)

CRITICAL RULES:
- Greetings (hi, hello, good morning) → GENERAL_CHAT
- "what can you do?" / "help" / "advise me" → GENERAL_CHAT
- "why?" / "explain" / "what do you mean?" → GENERAL_CHAT
- Short follow-ups without clear topic → GENERAL_CHAT

Reply with ONLY the label. No text. No explanation. No punctuation.`;

const FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-r1-0528:free",
];

// ============================================================================
// FOLLOW-UP DETECTION (expanded for multi-language)
// ============================================================================

const FOLLOW_UP_PATTERNS = [
  // Italian
  /^perch[eéè]\??$/i,
  /^come mai\??$/i,
  /^spiegami$/i,
  /^spiegami\s+meglio\??$/i,
  /^perch[eéè]\s+dici\s+(cos[iì]|questo)\??$/i,
  /^in che senso\??$/i,
  /^cosa\s+intendi\??$/i,
  /^cio[eè]\??$/i,
  /^e\s+quindi\??$/i,
  /^ma\s+perch[eéè]\??$/i,
  /^e\s+perch[eéè]\??$/i,
  /^cosa\s+significa\??$/i,
  /^puoi\s+spiegare\??$/i,
  /^dimmi\s+di\s+pi[uù]\??$/i,
  /^cosa\s+intendi\s+con\b/i,
  /^ma\s+perch[eéè]\s+dici\s+(cos[iì]|questo)\??$/i,
  /^in\s+che\s+senso\s+dici\??$/i,
  /^e\s+come\s+mai\??$/i,
  /^e\s+allora\??$/i,
  /^ma\s+davvero\??$/i,
  /^sul\s+serio\??$/i,
  // English
  /^why\??$/i,
  /^what do you mean\??$/i,
  /^explain$/i,
  /^explain\s+more\??$/i,
  /^can you explain\??$/i,
  /^tell me more\??$/i,
  /^what does that mean\??$/i,
  /^how come\??$/i,
  /^really\??$/i,
  /^and\s+why\??$/i,
  // Generic short follow-ups (any language)
  /^.{1,3}\??$/, // Very short messages ending with ? (e.g., "eh?", "e?", "hm?")
];

export function isFollowUp(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return FOLLOW_UP_PATTERNS.some(p => p.test(lower));
}

/**
 * Deterministic fallback — ONLY used when LLM is unavailable.
 * Uses centralized terminology patterns from terminology.ts.
 */
function classifyDeterministic(message: string): IntentLabel {
  const lower = message.toLowerCase().trim();

  // Follow-up → always GENERAL_CHAT
  if (isFollowUp(lower)) {
    return 'GENERAL_CHAT';
  }

  // Financial decision (centralized)
  if (FINANCIAL_DECISION_PATTERN.test(lower)) {
    return 'FINANCIAL_DECISION';
  }

  // Financial query (centralized)
  if (FINANCIAL_QUERY_PATTERN.test(lower)) {
    return 'FINANCIAL_QUERY';
  }

  // Task query (centralized — covers "che task ho", "task di oggi", etc.)
  if (TASK_QUERY_PATTERN.test(lower)) {
    return 'TASK_QUERY';
  }

  // Event query (centralized — covers "che eventi ho", "agenda di oggi", etc.)
  if (EVENT_QUERY_PATTERN.test(lower)) {
    return 'EVENT_QUERY';
  }

  // Expense query (centralized)
  if (EXPENSE_QUERY_PATTERN.test(lower)) {
    return 'FINANCIAL_QUERY';
  }

  // Planning (centralized)
  if (PLANNING_PATTERN.test(lower)) {
    return 'PLANNING';
  }

  // General chat (centralized)
  if (GENERAL_CHAT_PATTERN.test(lower)) {
    return 'GENERAL_CHAT';
  }

  return 'UNKNOWN';
}

export async function classifyIntent(message: string): Promise<IntentLabel> {
  // Fast path: follow-ups are ALWAYS GENERAL_CHAT, skip LLM
  if (isFollowUp(message)) {
    // console.log("[INTENT-CLASSIFIER] Follow-up detected, forcing GENERAL_CHAT");
    return 'GENERAL_CHAT';
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");

  if (!apiKey || !apiKey.startsWith("sk-or-")) {
    // console.log("[INTENT-CLASSIFIER] No API key, using deterministic fallback");
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
        // console.log(`[INTENT-CLASSIFIER] Result: ${content} (model=${model})`);
        return content as IntentLabel;
      }

      // Try partial match
      const found = VALID_LABELS.find(l => content.includes(l));
      if (found) {
        // console.log(`[INTENT-CLASSIFIER] Partial match: ${found} (model=${model})`);
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

  // console.log("[INTENT-CLASSIFIER] All models failed, using deterministic");
  return classifyDeterministic(message);
}
