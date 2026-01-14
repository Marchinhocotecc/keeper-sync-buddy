/**
 * Legacy Exports - Backwards compatibility for functions still used elsewhere
 */

import { format, addDays } from 'date-fns';
import { loadUserContext } from './contextLoader';
import { clearActiveIntent } from '@/services/assistantStateService';
import { clearPendingIntent } from './contextStore';

/**
 * Get a smart greeting based on time of day
 */
export function getSmartGreeting(): string {
  const hour = new Date().getHours();
  
  if (hour < 6) {
    return 'Buonanotte! 🌙 Cosa posso fare per te?';
  } else if (hour < 12) {
    return 'Buongiorno! ☀️ Cosa posso fare per te?';
  } else if (hour < 18) {
    return 'Buon pomeriggio! 🌤️ Cosa posso fare per te?';
  } else if (hour < 22) {
    return 'Buonasera! 🌆 Cosa posso fare per te?';
  } else {
    return 'Buonanotte! 🌙 Cosa posso fare per te?';
  }
}

/**
 * Reset conversation state for user
 */
export async function resetConversation(userId: string): Promise<void> {
  console.log('[Legacy] Resetting conversation for:', userId);
  
  try {
    // Clear Supabase state
    await clearActiveIntent(userId);
    
    // Clear in-memory pending intent
    clearPendingIntent(userId);
    
    console.log('[Legacy] Conversation reset complete');
  } catch (error) {
    console.error('[Legacy] Error resetting conversation:', error);
  }
}
