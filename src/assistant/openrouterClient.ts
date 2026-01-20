/**
 * OpenRouter Client - Wrapper for external AI calls
 * 
 * CLEANED: Removed legacy intentParser dependency
 */

import { supabase } from '@/integrations/supabase/client';
import type { AIConversationEntry, OpenRouterOptions, ParsedAIResponse } from './typesAI';

const DEFAULT_TIMEOUT = 12000; // 12 seconds
const DEFAULT_RETRIES = 2;

// System prompt for the external AI - CRITICAL: Never claim to execute actions
const SYSTEM_PROMPT = `Sei un assistente AI di supporto. Il tuo ruolo è SOLO:
1. Comprendere l'intento dell'utente
2. Estrarre dati strutturati
3. Suggerire azioni (MAI eseguirle)

REGOLE CRITICHE:
- NON DIRE MAI "Ho aggiunto", "Ho creato", "Ho registrato" - tu NON esegui azioni
- Usa SOLO frasi come "Vuoi che aggiunga...?", "Posso creare...?", "Registro...?"
- Se l'utente chiede di fare qualcosa, PROPONI l'azione, non confermarla come fatta

Formato JSON richiesto:
{
  "intent": "create_event|create_task|create_expense|advice|suggestion|question|unknown",
  "payload": { dati strutturati },
  "message": "Messaggio naturale - MAI confermare azioni come eseguite"
}

ESEMPI CORRETTI:
Utente: "Aggiungi meeting domani alle 10"
{"intent":"create_event","payload":{"title":"Meeting","date":"2025-12-17","startTime":"10:00","endTime":"11:00"},"message":"Creo l'evento 'Meeting' per domani alle 10:00?"}

Utente: "Ho speso 50 euro"
{"intent":"create_expense","payload":{"amount":50},"message":"Registro una spesa di €50?"}

Utente: "Cosa potrei fare?"
{"intent":"suggestion","payload":{},"message":"Ecco alcune idee per te..."}

ESEMPI SBAGLIATI (DA NON FARE):
❌ "Ho aggiunto l'evento" 
❌ "Task creato!"
❌ "Spesa registrata"

Rispondi SOLO in JSON valido.`;

/**
 * Parse AI response from raw text
 */
function parseAIResponse(rawText: string): ParsedAIResponse {
  if (!rawText || typeof rawText !== 'string') {
    return { success: false, response: null, error: 'Empty response' };
  }

  try {
    // Try to extract JSON from the response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { success: true, response: parsed };
    }
    
    // If no JSON, return the raw text as message
    return { 
      success: true, 
      response: { 
        intent: 'unknown', 
        message: rawText,
        payload: {}
      } 
    };
  } catch (error) {
    console.error('Error parsing AI response:', error);
    return { success: false, response: null, error: 'Parse error' };
  }
}

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
