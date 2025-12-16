/**
 * AI Engine - Strict 3-Phase Decision Architecture
 * 
 * Phase 1: Classification (buildDecision)
 * Phase 2: Decision Object validation
 * Phase 3: Execution (executeDecision)
 * 
 * NEVER responds directly to user input
 * ALL responses ONLY after valid Decision Object
 */

import type { AIEngineResult, AIIntent } from './typesAI';
import { buildDecision, resetSession, getCurrentDecision, type DecisionObject } from './decisionEngine';
import { executeDecision, toAIEngineResult } from './executionController';
import { addToConversationHistory, clearConversationHistory } from './contextStore';
import {
  wouldBeRepetition,
  recordResponseHash,
  clearResponseHashes,
  incrementUnknownCount,
  resetUnknownCount
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
  if (!decision.valid) {
    console.error('Invalid decision:', decision.validationError);
    // Return minimal response for invalid decisions
    return {
      message: '',
      source: 'local'
    };
  }

  // Track UNKNOWN intents
  if (decision.intent === 'UNKNOWN') {
    const unknownCount = incrementUnknownCount(userId);
    if (unknownCount >= 2) {
      // Stop responding after 2 UNKNOWN in a row
      return {
        message: '',
        source: 'local'
      };
    }
  } else {
    resetUnknownCount(userId);
  }

  // ========== PHASE 3: EXECUTION ==========
  console.log('=== AI Engine: Phase 3 - Execution ===');
  
  const executionResult = await executeDecision(userId, message, decision);
  
  if (!executionResult) {
    console.error('Execution returned null');
    return {
      message: '',
      source: 'local'
    };
  }

  // Loop guard - check for repetition
  if (wouldBeRepetition(userId, executionResult.message)) {
    console.log('Loop guard triggered');
    const alternative = generateAlternativeResponse(decision);
    executionResult.message = alternative.message;
    executionResult.suggestions = alternative.suggestions;
  }

  // Record response hash for loop detection
  recordResponseHash(userId, executionResult.message);

  // Save conversation
  await saveConversation(userId, message, executionResult.message);

  // Convert to AIEngineResult
  const result = toAIEngineResult(executionResult);
  
  console.log('=== AI Engine: Response ===');
  console.log('Message:', result.message);
  console.log('Source:', result.source);

  return result;
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
        message: 'Cambiamo prospettiva. In quale ambito vuoi concentrarti?',
        suggestions: ['Produttività', 'Benessere', 'Finanze']
      };
    
    case 'ACTION':
      return {
        message: 'Come posso aiutarti in modo diverso?',
        suggestions: ['Mostra task', 'Eventi oggi', 'Budget']
      };
    
    default:
      return {
        message: 'Dimmi cosa vuoi fare.'
      };
  }
}

/**
 * Save conversation entry
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
  resetUnknownCount(userId);
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
