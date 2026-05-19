/**
 * AI Engine - Main Entry Point
 * 
 * NEW ARCHITECTURE (v2):
 * 
 * FREE PLAN → AI FREE Orchestrator (ONLY brain)
 *   - NO statefulHandler
 *   - NO decisionRouter
 *   - NO legacy pipeline
 *   - Uses DeepSeek R1 Free via Lovable AI
 * 
 * PREMIUM PLAN → Premium Coach (stub, not implemented)
 */

import type { AIEngineResult } from './typesAI';
import { isFreeUser } from './planRouter';
import { processAIFreeMessage } from './aiFreeOrchestrator';
import { clearActiveIntent } from '@/services/assistantStateService';
import { SAFE_FALLBACK_MESSAGE } from './constants';

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
  // console.log('[AIEngine] Resetting conversation for:', userId);
  
  try {
    await clearActiveIntent(userId);
    // console.log('[AIEngine] Conversation reset complete');
  } catch (error) {
    console.error('[AIEngine] Error resetting conversation:', error);
  }
}

/**
 * Process user message
 * 
 * ROUTING:
 * - FREE users → AI FREE Orchestrator (ONLY)
 * - PREMIUM users → Premium Coach (stub)
 * 
 * NO LEGACY CODE for FREE users:
 * - NO statefulHandler
 * - NO decisionRouter
 * - NO mergeWithPendingIntent
 */
export async function processMessage(
  userId: string,
  message: string
): Promise<AIEngineResult> {
  // console.log('=== AI Engine v2 ===');
  // console.log('User:', userId);
  // console.log('Message:', message);
  
  // Determine user plan
  const isFree = await isFreeUser(userId);
  // console.log('[AIEngine] User plan:', isFree ? 'FREE' : 'PREMIUM');
  
  // ========== FREE PLAN: AI FREE ONLY ==========
  if (isFree) {
    // console.log('[AIEngine] Routing to AI FREE Orchestrator (ONLY brain for FREE)');
    
    try {
      const response = await processAIFreeMessage(userId, message);
      
      return {
        message: response.message,
        source: response.source === 'ai_free' ? 'local' : response.source,
        suggestions: response.suggestions,
        actionExecuted: response.actionExecuted,
      };
    } catch (error) {
      console.error('[AIEngine] AI FREE error:', error);
      
      // Clear state and return safe fallback
      await clearActiveIntent(userId);
      
      return {
        message: '⚠️ Errore temporaneo. Riprova. 🙂',
        source: 'local',
        actionExecuted: false
      };
    }
  }
  
  // ========== PREMIUM PLAN: Premium Coach (stub) ==========
  // console.log('[AIEngine] Premium path - not implemented');
  
  // For now, premium users also use AI FREE
  try {
    const response = await processAIFreeMessage(userId, message);
    
    return {
      message: response.message,
      source: 'local',
      suggestions: response.suggestions,
      actionExecuted: response.actionExecuted,
    };
  } catch (error) {
    console.error('[AIEngine] Premium error:', error);
    
    return {
      message: SAFE_FALLBACK_MESSAGE,
      source: 'local',
      actionExecuted: false
    };
  }
}
