/**
 * AI Engine - Strict 3-Phase Decision Architecture
 * 
 * Phase 1: Classification (buildDecision)
 * Phase 2: Decision Object validation
 * Phase 3: Execution (executeDecision)
 * 
 * PRINCIPLE: The assistant NEVER responds directly to user input.
 * ALL responses ONLY after producing a validated AssistantDecision object.
 */

import type { AIEngineResult } from './typesAI';
import { 
  buildDecision, 
  resetSession, 
  getCurrentDecision, 
  getUnknownCount,
  type DecisionObject 
} from './decisionEngine';
import { executeDecision, toAIEngineResult } from './executionController';
import { addToConversationHistory, clearConversationHistory } from './contextStore';
import {
  wouldBeRepetition,
  recordResponseHash,
  clearResponseHashes
} from './intentClassifierV2';

/**
 * Main entry point - 3-phase strict architecture
 */
export async function processMessage(
  userId: string,
  message: string
): Promise<AIEngineResult> {
  console.log('=== AI Engine: Phase 1 - Classification ===');
  console.log('Input:', message);

  // ========== PHASE 1: CLASSIFICATION ==========
  const decision = buildDecision(userId, message);
  console.log('Decision Object:', JSON.stringify(decision, null, 2));

  // ========== PHASE 2: VALIDATION ==========
  // Check if all required fields are present
  if (!isValidDecision(decision)) {
    console.error('Invalid decision - missing required fields');
    
    // For low confidence actions, ask for clarification
    if (decision.intent === 'ACTION' && decision.validationError === 'missing_data') {
      return {
        message: getClarificationForAction(decision),
        source: 'local'
      };
    }
    
    // For unknown/error intents, handle gracefully
    if (decision.intent === 'UNKNOWN' || decision.intent === 'ERROR') {
      const unknownCount = getUnknownCount(userId);
      if (unknownCount >= 2) {
        // Stop responding after 2 unknowns
        return { message: '', source: 'local' };
      }
      return {
        message: 'Non ho capito. Prova con: "aggiungi task", "cosa ho oggi", o "cosa mi consigli".',
        source: 'local'
      };
    }
    
    return { message: '', source: 'local' };
  }

  // ========== PHASE 3: EXECUTION ==========
  console.log('=== AI Engine: Phase 3 - Execution ===');
  
  const executionResult = await executeDecision(userId, message, decision);
  
  if (!executionResult) {
    console.log('Execution returned null - stopping response');
    return { message: '', source: 'local' };
  }

  // Loop guard - check for repetition
  if (executionResult.message && wouldBeRepetition(userId, executionResult.message)) {
    console.log('Loop guard triggered - generating alternative');
    const alternative = generateAlternativeResponse(decision);
    executionResult.message = alternative.message;
    executionResult.suggestions = alternative.suggestions;
  }

  // Record response hash for loop detection
  if (executionResult.message) {
    recordResponseHash(userId, executionResult.message);
  }

  // Save conversation (only if we have a response)
  if (executionResult.message) {
    await saveConversation(userId, message, executionResult.message);
  }

  // Convert to AIEngineResult
  const result = toAIEngineResult(executionResult);
  
  console.log('=== AI Engine: Response ===');
  console.log('Message:', result.message);
  console.log('Source:', result.source);

  return result;
}

/**
 * Validate that decision has all required fields
 */
function isValidDecision(decision: DecisionObject): boolean {
  // Must have intent
  if (!decision.intent) return false;
  
  // Must have domain
  if (!decision.domain) return false;
  
  // Must have confidence
  if (typeof decision.confidence !== 'number') return false;
  
  // For ACTION with requires_action, need sufficient confidence
  if (decision.intent === 'ACTION' && decision.requires_action) {
    if (decision.confidence < 0.5) return false;
  }
  
  // Check explicit valid flag
  return decision.valid;
}

/**
 * Get clarification message for incomplete action
 */
function getClarificationForAction(decision: DecisionObject): string {
  const data = decision.extracted_data || {};
  
  switch (decision.domain) {
    case 'task':
      if (!data.title) return 'Cosa vuoi aggiungere come task?';
      break;
    case 'calendar':
      if (!data.title) return 'Come si chiama l\'evento?';
      if (!data.date) return 'Quando vuoi programmare l\'evento?';
      if (!data.startTime) return 'A che ora inizia?';
      break;
    case 'expense':
      if (!data.amount) return 'Qual è l\'importo della spesa?';
      break;
  }
  
  return 'Puoi darmi più dettagli?';
}

/**
 * Generate alternative when loop detected
 */
function generateAlternativeResponse(decision: DecisionObject): {
  message: string;
  suggestions?: string[];
} {
  switch (decision.intent) {
    case 'SUGGESTION':
      return {
        message: 'Proviamo un altro approccio. Vuoi concentrarti su produttività, benessere o finanze?',
        suggestions: ['Produttività', 'Benessere', 'Finanze']
      };
    
    case 'QUERY':
      return {
        message: 'Vuoi vedere altri dati? Task, eventi o spese?',
        suggestions: ['Task', 'Eventi', 'Spese']
      };
    
    case 'ACTION':
      return {
        message: 'Cos\'altro posso fare per te?'
      };
    
    case 'CHAT':
      return {
        message: 'Dimmi come posso aiutarti!'
      };
    
    default:
      return {
        message: 'Come posso aiutarti?'
      };
  }
}

/**
 * Save conversation entry (limited to last 5 messages)
 */
async function saveConversation(
  userId: string,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  if (!assistantMessage) return;

  await addToConversationHistory(userId, {
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString()
  });

  await addToConversationHistory(userId, {
    role: 'assistant',
    content: assistantMessage,
    timestamp: new Date().toISOString()
  });
}

/**
 * Get smart greeting based on context
 */
export async function getSmartGreeting(userId: string): Promise<AIEngineResult> {
  return processMessage(userId, 'ciao');
}

/**
 * Reset conversation and all state
 */
export async function resetConversation(userId: string): Promise<void> {
  await clearConversationHistory(userId);
  resetSession(userId);
  clearResponseHashes(userId);
  console.log('Conversation reset for user:', userId);
}

/**
 * Get current decision for debugging
 */
export function getDecision(userId: string): DecisionObject | null {
  return getCurrentDecision(userId);
}

// Re-exports
export { executeAICommand } from './bridge';
export type { AIEngineResult, AIIntent } from './typesAI';
