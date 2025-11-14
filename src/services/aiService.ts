/**
 * AI Service - Gestisce le chiamate all'AI esterna con retry e timeout
 */

import { supabase } from "@/integrations/supabase/client";

const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

export interface AIServiceResponse {
  success: boolean;
  message?: string;
  error?: string;
  cached?: boolean;
}

export async function callExternalAI(
  prompt: string,
  userId: string
): Promise<AIServiceResponse> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const { data, error } = await supabase.functions.invoke('assistant-ai', {
        body: { prompt, userId },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error.message?.includes('API key') || error.message?.includes('401')) {
          return {
            success: false,
            error: 'Errore di configurazione API. Contatta il supporto.'
          };
        }

        // If it's the last attempt, return the error
        if (attempt === MAX_RETRIES) {
          return {
            success: false,
            error: `Errore dopo ${MAX_RETRIES + 1} tentativi: ${error.message}`
          };
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
        continue;
      }

      if (data?.success) {
        return {
          success: true,
          message: data.message,
          cached: data.cached || false
        };
      }

      return {
        success: false,
        error: data?.message || 'Risposta non valida dall\'AI'
      };

    } catch (error: any) {
      lastError = error;

      // Handle timeout
      if (error.name === 'AbortError') {
        if (attempt === MAX_RETRIES) {
          return {
            success: false,
            error: 'Timeout: la richiesta ha impiegato troppo tempo.'
          };
        }
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
        continue;
      }

      // Handle network errors
      if (attempt === MAX_RETRIES) {
        return {
          success: false,
          error: 'Errore di connessione. Verifica la tua rete.'
        };
      }

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Errore sconosciuto'
  };
}

export function shouldUseExternalAI(message: string): boolean {
  const msg = message.toLowerCase();

  // Use external AI for:
  // 1. Complex questions with reasoning words
  const reasoningWords = [
    'perché', 'come mai', 'in che modo', 'come funziona',
    'spiegami', 'cos\'è', 'cosa significa', 'dimmi di più',
    'approfondisci', 'dettagli su', 'parlami di'
  ];

  if (reasoningWords.some(word => msg.includes(word)) && msg.length > 30) {
    return true;
  }

  // 2. General knowledge questions
  const knowledgeIndicators = [
    'chi è', 'dove si trova', 'quando è', 'storia di',
    'definizione di', 'significato di', 'informazioni su'
  ];

  if (knowledgeIndicators.some(indicator => msg.includes(indicator))) {
    return true;
  }

  // 3. Creative requests
  const creativeIndicators = [
    'scrivimi', 'genera', 'crea un testo', 'idea per',
    'suggerisci qualcosa di creativo', 'inventa'
  ];

  if (creativeIndicators.some(indicator => msg.includes(indicator))) {
    return true;
  }

  // Don't use external AI for app-specific tasks
  const appSpecificIndicators = [
    'task', 'evento', 'spesa', 'budget', 'calendario',
    'benessere', 'sonno', 'passi', 'meditazione',
    'ho speso', 'aggiungi', 'crea', 'mostra', 'elenca'
  ];

  if (appSpecificIndicators.some(indicator => msg.includes(indicator))) {
    return false;
  }

  // Default: use local agent if message is short and simple
  return msg.length > 50;
}
