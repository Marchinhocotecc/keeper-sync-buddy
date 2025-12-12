/**
 * External AI Service - Connects to OpenRouter API via Edge Function
 */

import { supabase } from '@/integrations/supabase/client';

export interface ExternalAIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ExternalAIResponse {
  response: string;
  success: boolean;
  error?: string;
}

/**
 * Send message to External AI via edge function
 */
export async function sendToExternalAI(
  message: string,
  history: ExternalAIMessage[] = [],
  userId?: string
): Promise<ExternalAIResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('assistant-ai', {
      body: {
        prompt: message,
        userId,
        context: history.slice(-10), // Last 10 messages for context
        useXMLFormat: true
      }
    });

    if (error) {
      console.error('External AI error:', error);
      return {
        response: 'Mi dispiace, non sono riuscito a elaborare la richiesta.',
        success: false,
        error: error.message
      };
    }

    // The edge function returns { success, message, type, payload }
    return {
      response: data.message || 'Nessuna risposta disponibile.',
      success: data.success !== false
    };
  } catch (error: any) {
    console.error('External AI fetch error:', error);
    return {
      response: 'Si è verificato un errore di connessione.',
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if local assistant response indicates it needs external help
 */
export function needsExternalAI(localResponse: string): boolean {
  const triggers = [
    'non capisco',
    'non ho abbastanza informazioni',
    'posso chiedere all\'assistente esterno',
    'non sono sicuro',
    'non riesco a',
    'ho bisogno di più contesto',
    'potresti spiegarmi meglio'
  ];
  
  const normalizedResponse = localResponse.toLowerCase();
  return triggers.some(trigger => normalizedResponse.includes(trigger));
}
