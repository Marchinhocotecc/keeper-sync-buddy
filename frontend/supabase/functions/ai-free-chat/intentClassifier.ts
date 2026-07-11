/**
 * MODULE 1 — INTENT CLASSIFIER
 * Ultra-light LLM call: receives message, returns ONLY a label.
 *
 * Simplified: uses Groq (llama-3.3-70b-versatile) with a single try/catch.
 * On any LLM failure, falls back to the deterministic classifier (which is
 * always safe and never throws).
 */

import {
  TASK_QUERY_PATTERN, EVENT_QUERY_PATTERN, EXPENSE_QUERY_PATTERN,
  FINANCIAL_DECISION_PATTERN, FINANCIAL_QUERY_PATTERN,
  PLANNING_PATTERN, GENERAL_CHAT_PATTERN
} from "./terminology.ts";
import { callGroq } from "./groqClient.ts";

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
    return 'GENERAL_CHAT';
  }

  try {
    const raw = await callGroq({
      systemPrompt: CLASSIFIER_PROMPT,
      userPrompt: message,
      maxTokens: 20,
      temperature: 0,
      timeoutMs: 10000,
    });
    const cleaned = raw.toUpperCase().replace(/[^A-Z_]/g, "");
    if (VALID_LABELS.includes(cleaned as IntentLabel)) {
      return cleaned as IntentLabel;
    }
    // Partial match (model may have wrapped label with extra words)
    const found = VALID_LABELS.find(l => cleaned.includes(l));
    if (found) return found;
    console.warn(`[INTENT-CLASSIFIER] Invalid label from Groq: "${cleaned}"`);
    return classifyDeterministic(message);
  } catch (err) {
    console.error("[INTENT-CLASSIFIER] Groq call failed:", err instanceof Error ? err.message : err);
    return classifyDeterministic(message);
  }
}
