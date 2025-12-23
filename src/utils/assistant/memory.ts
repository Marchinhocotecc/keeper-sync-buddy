/**
 * Memory Manager - Handles conversation memory in Supabase
 */

import { supabase } from '@/integrations/supabase/client';

export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  source?: 'local' | 'external';
}

export interface AssistantMemory {
  id: string;
  user_id: string;
  messages: ConversationEntry[];
  updated_at: string;
}

const MAX_CONVERSATIONS = 5; // Store last 5 conversation pairs (10 messages)
const MAX_MESSAGES = MAX_CONVERSATIONS * 2;

/**
 * Load conversation memory for a user
 */
export async function loadMemory(userId: string): Promise<ConversationEntry[]> {
  try {
    const { data, error } = await supabase
      .from('assistant_memory')
      .select('messages')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error loading memory:', error);
      return [];
    }

    // No record found, return empty array (no error, just missing)
    if (!data) {
      return [];
    }

    // Parse messages if they're stored as JSON
    const messages = data?.messages;
    if (Array.isArray(messages)) {
      return messages as unknown as ConversationEntry[];
    }
    
    return [];
  } catch (error) {
    console.error('Error loading memory:', error);
    return [];
  }
}

/**
 * Save a new conversation pair to memory
 */
export async function saveToMemory(
  userId: string,
  userMessage: string,
  assistantMessage: string,
  source: 'local' | 'external' = 'local'
): Promise<boolean> {
  try {
    // Load existing memory
    const existingMessages = await loadMemory(userId);
    
    // Create new entries
    const newEntries: ConversationEntry[] = [
      {
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString()
      },
      {
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date().toISOString(),
        source
      }
    ];
    
    // Combine and trim to max messages
    const updatedMessages = [...existingMessages, ...newEntries].slice(-MAX_MESSAGES);
    
    // Upsert to database
    const { error } = await supabase
      .from('assistant_memory')
      .upsert({
        user_id: userId,
        messages: updatedMessages as unknown as any,
        updated_at: new Date().toISOString()
      } as any, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error saving memory:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error saving memory:', error);
    return false;
  }
}

/**
 * Clear all memory for a user
 */
export async function clearMemory(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('assistant_memory')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error clearing memory:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error clearing memory:', error);
    return false;
  }
}

/**
 * Get formatted context for AI calls
 */
export function formatMemoryForContext(messages: ConversationEntry[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}
