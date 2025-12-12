/**
 * OpenRouter Client - Wrapper for external AI calls
 */

import { supabase } from '@/integrations/supabase/client';
import type { AIConversationEntry, OpenRouterOptions, ParsedAIResponse } from './typesAI';
import { parseAIResponse } from './intentParser';

const DEFAULT_TIMEOUT = 12000; // 12 seconds
const DEFAULT_RETRIES = 2;

// System prompt for the external AI
const SYSTEM_PROMPT = `Sei l'Assistente AI di Daily Sync Keeper. 
DEVI SEMPRE rispondere SOLO in formato JSON valido, senza testo aggiuntivo.

Formato richiesto:
{
  "intent": "create_event" | "create_task" | "create_expense" | "create_note" | "update_task" | "query_tasks" | "query_events" | "query_expenses" | "query_budget" | "advice" | "suggestion" | "greeting" | "farewell" | "thanks" | "question" | "unknown",
  "payload": { ... dati specifici dell'azione ... },
  "message": "Messaggio naturale per l'utente"
}

REGOLE FONDAMENTALI:
1. NON inventare dati o eventi che non esistono
2. NON dire che hai creato qualcosa - proponi solo l'azione
3. Per create_event: payload deve avere { title, date (YYYY-MM-DD), startTime (HH:MM), endTime (HH:MM) }
4. Per create_task: payload deve avere { title, priority? (low/medium/high) }
5. Per create_expense: payload deve avere { amount (numero), category?, description? }
6. Per advice/suggestion: payload può essere vuoto, usa message per il consiglio
7. Se non capisci, usa intent "question" e chiedi chiarimenti in message

ESEMPI:
Utente: "Aggiungi un evento domani alle 10"
{"intent":"create_event","payload":{"title":"Evento","date":"2025-12-13","startTime":"10:00","endTime":"11:00"},"message":"Vuoi che aggiunga questo evento?"}

Utente: "Ho speso 50 euro per la spesa"
{"intent":"create_expense","payload":{"amount":50,"category":"spesa","description":"Spesa"},"message":"Registro la spesa di €50?"}

Utente: "Cosa dovrei fare oggi?"
{"intent":"advice","payload":{},"message":"Basandomi sui tuoi impegni, ti consiglio di..."}

RISPONDI SEMPRE E SOLO IN JSON. MAI testo libero.`;

/**
 * Send message to external AI via edge function
 */
export async function sendToExternalAI(
  message: string,
  history: AIConversationEntry[] = [],
  options: OpenRouterOptions = {}
): Promise<ParsedAIResponse> {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const retries = options.retries || DEFAULT_RETRIES;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await executeAICall(message, history, timeout);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`AI call attempt ${attempt + 1} failed:`, lastError.message);
      
      if (attempt < retries) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  // All retries failed
  console.error('All AI call attempts failed:', lastError);
  return {
    success: false,
    response: null,
    error: lastError?.message || 'External AI unavailable'
  };
}

/**
 * Execute a single AI call with timeout
 */
async function executeAICall(
  message: string,
  history: AIConversationEntry[],
  timeout: number
): Promise<ParsedAIResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const { data, error } = await supabase.functions.invoke('assistant-ai', {
      body: {
        message,
        history: history.map(h => ({ role: h.role, content: h.content })),
        systemPrompt: SYSTEM_PROMPT,
        forceJson: true
      }
    });

    clearTimeout(timeoutId);

    if (error) {
      throw new Error(error.message || 'Edge function error');
    }

    // Parse the AI response
    const rawText = data?.response || data?.message || '';
    return parseAIResponse(rawText);

  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Check if external AI is available
 */
export async function isExternalAIAvailable(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('assistant-ai', {
      body: { message: 'ping', systemPrompt: 'Respond with {"status":"ok"}' }
    });
    return !error && data;
  } catch {
    return false;
  }
}

/**
 * Format conversation history for AI context
 */
export function formatHistoryForAI(
  messages: Array<{ role: string; content: string }>
): AIConversationEntry[] {
  return messages.slice(-10).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }));
}
