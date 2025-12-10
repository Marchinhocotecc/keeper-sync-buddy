/**
 * External Assistant - Uses OpenRouter/Lovable AI for complex reasoning
 */

import { supabase } from '@/integrations/supabase/client';

export interface ExternalAssistantResponse {
  text: string;
  success: boolean;
  type?: string;
  payload?: any;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function processExternally(
  message: string,
  userId: string,
  conversationHistory: ConversationMessage[] = []
): Promise<ExternalAssistantResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('assistant-ai', {
      body: {
        prompt: message,
        userId,
        context: conversationHistory,
        isExternalFallback: true
      }
    });

    if (error) {
      console.error('External AI error:', error);
      return {
        text: "Mi dispiace, non sono riuscito a elaborare la richiesta. Riprova tra poco 😊",
        success: false
      };
    }

    return {
      text: data.message || "Non ho una risposta al momento.",
      success: data.success !== false,
      type: data.type,
      payload: data.payload
    };
  } catch (error) {
    console.error('External assistant error:', error);
    return {
      text: "Si è verificato un errore. Riprova tra poco.",
      success: false
    };
  }
}
