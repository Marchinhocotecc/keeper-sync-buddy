/**
 * Context Store - Persistent storage for user context and conversations
 */

import { supabase } from '@/integrations/supabase/client';
import type { 
  UserContext, 
  UserPreferences, 
  ConversationMessage, 
  ConversationSession 
} from './types';

const MAX_CONVERSATIONS = 5;
const MAX_MESSAGES_PER_CONVERSATION = 15;

// Default context
const defaultContext: Omit<UserContext, 'userId'> = {
  preferences: {
    workingHours: { start: '09:00', end: '18:00' },
    preferredTaskTime: 'morning',
    budgetAlertThreshold: 80,
    reminderFrequency: 'medium',
    language: 'it'
  },
  routines: [],
  goals: [],
  lastUpdated: new Date().toISOString()
};

/**
 * Get user context from Supabase
 */
export async function getContext(userId: string): Promise<UserContext> {
  try {
    const { data, error } = await supabase
      .from('user_context')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      // Return default context if not found
      return { userId, ...defaultContext };
    }

    // Parse stored data
    const lastAction = data.last_action as Record<string, any> | null;
    const suggestionHistory = data.suggestion_history as any[] | null;

    return {
      userId,
      preferences: lastAction?.preferences || defaultContext.preferences,
      routines: lastAction?.routines || [],
      goals: lastAction?.goals || [],
      lastUpdated: data.updated_at || new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting context:', error);
    return { userId, ...defaultContext };
  }
}

/**
 * Update user context in Supabase
 */
export async function updateContext(
  userId: string, 
  updates: Partial<Omit<UserContext, 'userId'>>
): Promise<boolean> {
  try {
    const currentContext = await getContext(userId);
    
    const newContext = {
      ...currentContext,
      ...updates,
      lastUpdated: new Date().toISOString()
    };

    const { error } = await supabase
      .from('user_context')
      .upsert([{
        user_id: userId,
        last_action: {
          preferences: newContext.preferences,
          routines: newContext.routines,
          goals: newContext.goals
        } as any,
        updated_at: newContext.lastUpdated
      }], {
        onConflict: 'user_id'
      })

    if (error) {
      console.error('Error updating context:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating context:', error);
    return false;
  }
}

/**
 * Update user preferences
 */
export async function updatePreferences(
  userId: string,
  preferences: Partial<UserPreferences>
): Promise<boolean> {
  const context = await getContext(userId);
  return updateContext(userId, {
    preferences: { ...context.preferences, ...preferences }
  });
}

/**
 * Get conversation history from assistant_memory table
 */
export async function getConversationHistory(userId: string): Promise<ConversationMessage[]> {
  try {
    const { data, error } = await supabase
      .from('assistant_memory')
      .select('messages')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return [];
    }

    const messages = data.messages as any[];
    if (!Array.isArray(messages)) {
      return [];
    }

    // Return last MAX_MESSAGES_PER_CONVERSATION messages
    return messages.slice(-MAX_MESSAGES_PER_CONVERSATION).map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      intent: msg.intent,
      entities: msg.entities
    }));
  } catch (error) {
    console.error('Error getting conversation history:', error);
    return [];
  }
}

/**
 * Add message to conversation history
 */
export async function addToConversationHistory(
  userId: string,
  message: ConversationMessage
): Promise<boolean> {
  try {
    const existingMessages = await getConversationHistory(userId);
    
    // Add new message and trim to max
    const updatedMessages = [...existingMessages, message].slice(-MAX_MESSAGES_PER_CONVERSATION);

    const { error } = await supabase
      .from('assistant_memory')
      .upsert([{
        user_id: userId,
        messages: updatedMessages as any,
        updated_at: new Date().toISOString()
      }], {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error adding to conversation history:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error adding to conversation history:', error);
    return false;
  }
}

/**
 * Clear conversation history for user
 */
export async function clearConversationHistory(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('assistant_memory')
      .update({ messages: [], updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) {
      console.error('Error clearing conversation history:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error clearing conversation history:', error);
    return false;
  }
}

/**
 * Get last N messages for context building
 */
export async function getRecentMessages(userId: string, count: number = 5): Promise<ConversationMessage[]> {
  const history = await getConversationHistory(userId);
  return history.slice(-count);
}

/**
 * Extract entities from conversation history for context
 */
export function extractConversationContext(messages: ConversationMessage[]): Record<string, any> {
  const context: Record<string, any> = {
    topics: new Set<string>(),
    mentionedDates: new Set<string>(),
    mentionedCategories: new Set<string>(),
    lastIntent: null
  };

  for (const msg of messages) {
    if (msg.intent) {
      context.lastIntent = msg.intent;
    }
    if (msg.entities) {
      if (msg.entities.date) context.mentionedDates.add(msg.entities.date);
      if (msg.entities.category) context.mentionedCategories.add(msg.entities.category);
      if (msg.entities.topic) context.topics.add(msg.entities.topic);
    }
  }

  return {
    ...context,
    topics: Array.from(context.topics),
    mentionedDates: Array.from(context.mentionedDates),
    mentionedCategories: Array.from(context.mentionedCategories)
  };
}
