/**
 * AI Service - Simplified service for AI calls via ai-free-chat
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

      const { data, error } = await supabase.functions.invoke('ai-free-chat', {
        body: { userMessage: prompt, userId },
      });

      clearTimeout(timeoutId);

      if (error) {
        lastError = error;
        
        if (attempt === MAX_RETRIES) {
          return {
            success: false,
            error: `Errore dopo ${MAX_RETRIES + 1} tentativi: ${error.message}`
          };
        }

        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
        continue;
      }

      if (data?.reply) {
        return {
          success: true,
          message: data.reply,
          cached: false
        };
      }

      return {
        success: false,
        error: data?.error || 'Risposta non valida dall\'AI'
      };

    } catch (error: any) {
      lastError = error;

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
