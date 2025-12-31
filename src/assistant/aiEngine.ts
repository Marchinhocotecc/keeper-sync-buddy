/**
 * AI Engine - Main Entry Point
 * 
 * STRICT PIPELINE (NON-NEGOTIABLE):
 * 
 * INPUT → SUPABASE STATE CHECK → STATEFUL HANDLER OR LEGACY PIPELINE
 * 
 * Rules:
 * 1. ALWAYS check Supabase state first
 * 2. If active intent in Supabase → use stateful handler
 * 3. If stateful handler handles it → return its response
 * 4. Otherwise fall back to legacy pipeline
 * 5. NO generic fallback responses
 */

import { format, addDays } from 'date-fns';
import type { AIEngineResult } from './typesAI';
import { parseIntent, type ParsedIntent, type ExtractedData, type AssistantIntent } from './intentParser';
import { loadUserContext, type UserContext } from './contextLoader';
import { routeDecision, resetUnknownCount, type RouterResponse } from './decisionRouter';
import { 
  addToConversationHistory, 
  clearConversationHistory,
  getPendingIntent,
  clearPendingIntent,
  setPendingIntent,
  type PendingIntent
} from './contextStore';
import {
  handleStatefulMessage,
  userHasActiveIntent,
  shouldUseStatefulHandler,
  clearAllAssistantState
} from '@/services/statefulHandler';
import { 
  isSafetyWord, 
  isCancelSafetyWord, 
  isCancelPattern,
  parseConfirmation,
  getCancelResponse, 
  getConfirmNoIntentResponse 
} from '@/assistant/confirmationParser';
import { SAFE_FALLBACK_MESSAGE } from './constants';

// Response hash tracking for loop prevention
const responseHashes = new Map<string, Set<string>>();
const MAX_HASH_HISTORY = 10;

/**
 * Process user message through the strict pipeline
 * 
 * CRITICAL INVARIANT:
 * - If stateful handler is chosen, NEVER fall back to legacy pipeline
 * - Stateful handler ALWAYS returns non-empty (has SAFE_FALLBACK_MESSAGE)
 */
export async function processMessage(
  userId: string,
  message: string
): Promise<AIEngineResult> {
  console.log('=== AI Engine Pipeline Start ===');
  console.log('User:', userId);
  console.log('Message:', message);
  
  // Use centralized constant
  const SAFE_FALLBACK = SAFE_FALLBACK_MESSAGE;
  
  // ========== PHASE -1: CONFIRM/SAFETY PRE-CHECK ==========
  // PRIORITY RULE (CRITICAL): CONFIRM > SAFETY
  // When user writes a pure confirm word (si/sì/ok) we MUST forward it to the stateful handler,
  // because it may be confirming an in-progress action (e.g. CONFIRM_BULK_DELETE).
  // Cancel stays cancel.
  const confirmParse = parseConfirmation(message);
  if (confirmParse.type === 'CONFIRM') {
    console.log('[AIEngine] Confirm word detected - forwarding to stateful handler (no safety clear)');
    try {
      const statefulResponse = await handleStatefulMessage(userId, message);
      const responseMessage = statefulResponse.message && statefulResponse.message.trim() !== ''
        ? statefulResponse.message
        : SAFE_FALLBACK;
      await saveConversation(userId, message, responseMessage);
      return {
        message: responseMessage,
        source: statefulResponse.source === 'stateful' ? 'local' : statefulResponse.source,
        suggestions: statefulResponse.suggestions,
        actionExecuted: statefulResponse.actionExecuted,
        actionResult: statefulResponse.actionResult,
      };
    } catch (error) {
      console.error('[AIEngine] Error forwarding CONFIRM to stateful handler:', error);
      const safeMessage = getConfirmNoIntentResponse();
      await saveConversation(userId, message, safeMessage);
      return { message: safeMessage, source: 'local' };
    }
  }

  // ========== SAFETY WORD PRE-CHECK ==========
  // Cancel/vague safety words should clear state early.
  // NOTE: Pure confirm words are handled above and MUST NOT reach this branch.
  if (isSafetyWord(message)) {
    console.log('[AIEngine] Safety word detected - clearing state and returning safe response');
    await clearAllAssistantState(userId);

    const response = isCancelSafetyWord(message) ? getCancelResponse() : getConfirmNoIntentResponse();
    await saveConversation(userId, message, response);
    return { message: response, source: 'local' };
  }

  // ========== PHASE 0: CHECK SUPABASE STATE FIRST (ABSOLUTE PRIORITY) ==========
  console.log('--- Phase 0: Supabase State Check ---');
  
  let hasActiveIntentFlag = false;
  let useStatefulHandler = false;
  
  try {
    // Check if user has active intent in Supabase
    hasActiveIntentFlag = await userHasActiveIntent(userId);
    useStatefulHandler = hasActiveIntentFlag || shouldUseStatefulHandler(message);
    
    if (useStatefulHandler) {
      console.log('[AIEngine] Using stateful handler (hasActiveIntent:', hasActiveIntentFlag, ')');
      const statefulResponse = await handleStatefulMessage(userId, message);
      
      // INVARIANT: stateful handler should NEVER return empty (it has SAFE_FALLBACK_MESSAGE)
      const responseMessage = statefulResponse.message && statefulResponse.message.trim() !== ''
        ? statefulResponse.message
        : SAFE_FALLBACK;
      
      console.log('[AIEngine] Stateful response:', responseMessage.substring(0, 50));
      
      // Save to conversation history
      await saveConversation(userId, message, responseMessage);
      
      // CRITICAL: Return here - NEVER proceed to legacy pipeline
      return {
        message: responseMessage,
        source: statefulResponse.source === 'stateful' ? 'local' : statefulResponse.source,
        suggestions: statefulResponse.suggestions,
        actionExecuted: statefulResponse.actionExecuted,
        actionResult: statefulResponse.actionResult
      };
    }
  } catch (error) {
    console.error('[AIEngine] Stateful handler error:', error);
    
    // CRITICAL: If stateful handler was chosen, DO NOT use legacy pipeline
    if (useStatefulHandler || hasActiveIntentFlag) {
      console.log('[AIEngine] Stateful was chosen but errored - returning safe message, NOT using legacy');
      const safeMessage = '⚠️ Problema tecnico. Riprova.';
      await saveConversation(userId, message, safeMessage);
      return { message: safeMessage, source: 'local' };
    }
    // Only fall through to legacy if stateful wasn't chosen
  }
  
  // ========== LEGACY PIPELINE (when stateful doesn't handle it) ==========
  console.log('--- Legacy Pipeline ---');
  
  // CRITICAL: Block legacy pipeline for messages that look like delete commands
  // These should ONLY be handled by stateful handler
  const isDeleteCommand = /(?:elimina|cancella|rimuovi|togli)/i.test(message);
  if (isDeleteCommand) {
    console.log('[AIEngine] Delete command in legacy - clearing state, returning safe message');
    await clearAllAssistantState(userId);
    return {
      message: '❓ Cosa vuoi eliminare: task, eventi o spese?',
      source: 'local'
    };
  }
  
  // CRITICAL: Check for CANCEL patterns - must clear ALL state AND return immediately
  // Use centralized isCancelPattern() from confirmationParser
  if (isCancelPattern(message)) {
    console.log('[AIEngine] Cancel pattern in legacy - clearing ALL state');
    await clearAllAssistantState(userId);
    return {
      message: getCancelResponse(),
      source: 'local'
    };
  }
  
  // NOTE: Safety words are already handled at PHASE -1 before this point
  // This is a redundant guardrail just in case
  if (isSafetyWord(message)) {
    console.log('[AIEngine] Safety word in legacy (guardrail) - clearing state');
    await clearAllAssistantState(userId);
    return {
      message: getConfirmNoIntentResponse(),
      source: 'local'
    };
  }
  
  // Check in-memory pending intent
  const pendingIntent = getPendingIntent(userId);
  let parsedIntent: ParsedIntent;
  
  if (pendingIntent) {
    console.log('Found legacy pending intent:', pendingIntent.intent);
    console.log('Pending data:', JSON.stringify(pendingIntent.extractedData));
    
    pendingToUserMap.set(pendingIntent, userId);
    
    parsedIntent = mergeWithPendingIntent(message, pendingIntent);
    console.log('Merged intent:', parsedIntent.intent);
    console.log('Merged confidence:', parsedIntent.confidence);
    console.log('Merged data:', JSON.stringify(parsedIntent.extractedData));
    
    // Clear pending if we now have enough data (>=0.8 confidence)
    if (parsedIntent.confidence >= 0.8) {
      console.log('Sufficient data - clearing pending intent');
      clearPendingIntent(userId);
    }
  } else {
    // ========== PHASE 1: INTENT PARSING (only if no pending intent) ==========
    console.log('--- Phase 1: Intent Parsing ---');
    parsedIntent = parseIntent(message);
  }
  
  console.log('Final Intent:', parsedIntent.intent);
  console.log('Confidence:', parsedIntent.confidence);
  console.log('Extracted Data:', JSON.stringify(parsedIntent.extractedData, null, 2));
  
  // ========== PHASE 2: CONTEXT LOADING ==========
  console.log('--- Phase 2: Context Loading ---');
  const context = await loadUserContext(userId);
  console.log('Context loaded:', {
    pendingTasks: context.pendingTasks.length,
    todayEvents: context.todayEvents.length,
    budgetPercentage: context.budgetPercentage.toFixed(0) + '%'
  });
  
  // ========== PHASE 3: DECISION ROUTING ==========
  console.log('--- Phase 3: Decision Routing ---');
  const routerResponse = await routeDecision(userId, parsedIntent, context);
  console.log('Router Response:', {
    source: routerResponse.source,
    actionPerformed: routerResponse.actionPerformed,
    requiresClarification: routerResponse.requiresClarification,
    message: routerResponse.message?.substring(0, 50)
  });
  
  // ========== PHASE 4: LOOP PREVENTION ==========
  if (routerResponse.message) {
    const hash = simpleHash(routerResponse.message);

    if (isRepetition(userId, hash)) {
      console.log('Loop detected - generating alternative');
      const alternative = getAlternativeResponse(parsedIntent, context);

      // Never allow empty final message
      if (alternative.message && alternative.message.trim().length > 0) {
        routerResponse.message = alternative.message;
        routerResponse.suggestions = alternative.suggestions;
      } else {
        console.log('Alternative was empty - keeping original message');
      }
    }

    recordHash(userId, hash);
  }
  
  // ========== PHASE 5: SAVE CONVERSATION ==========
  if (routerResponse.message) {
    await saveConversation(userId, message, routerResponse.message);
  }
  
  // ========== PHASE 6: FORMAT RESULT ==========
  const result: AIEngineResult = {
    message: routerResponse.message,
    source: routerResponse.source === 'ai_advisor' ? 'external' : 'local',
    suggestions: routerResponse.suggestions
  };
  
  console.log('=== AI Engine Pipeline End ===');
  console.log('Final message:', result.message?.substring(0, 100));
  
  return result;
}

// Helper to find userId from pending (stored in map key)
const pendingToUserMap = new Map<PendingIntent, string>();

function findUserIdForPending(pending: PendingIntent): string | null {
  return pendingToUserMap.get(pending) || null;
}

/**
 * Merge new message with pending intent to complete the action
 * Handles: CREATE_EVENT, CREATE_TASK, RECORD_EXPENSE, CREATE_GENERIC
 */
function mergeWithPendingIntent(
  newMessage: string,
  pending: PendingIntent
): ParsedIntent {
  const userId = findUserIdForPending(pending);
  const mergedData: ExtractedData = {
    ...pending.extractedData,
    rawText: newMessage
  } as ExtractedData;
  
  const lower = newMessage.toLowerCase().trim();
  console.log('Merging with pending intent:', pending.intent);
  console.log('New message:', newMessage);
  
  // ========== HANDLE CREATE_GENERIC RESPONSE ==========
  if (pending.intent === 'CREATE_GENERIC') {
    // User responding to "task o evento?"
    if (/task/i.test(lower)) {
      console.log('User chose TASK');
      // CRITICAL: Update pending intent to CREATE_TASK so next message continues correctly
      if (userId) setPendingIntent(userId, 'CREATE_TASK', mergedData, 'Cosa vuoi aggiungere?');
      return {
        intent: 'CREATE_TASK',
        confidence: 0.95,
        extractedData: mergedData,
        requiresClarification: false
      };
    }
    if (/evento/i.test(lower)) {
      console.log('User chose EVENT');
      // CRITICAL: Update pending intent to CREATE_EVENT (NOT CREATE_GENERIC anymore)
      if (userId) setPendingIntent(userId, 'CREATE_EVENT', mergedData, 'Quando?');
      // For event we need more data (date, time)
      return {
        intent: 'CREATE_EVENT',
        confidence: 0.6,
        extractedData: mergedData,
        requiresClarification: true,
        clarificationQuestion: 'Quando?'
      };
    }
    // If neither, treat the new message as the choice (default to task)
    console.log('Default to TASK');
    if (userId) setPendingIntent(userId, 'CREATE_TASK', mergedData, 'Cosa vuoi aggiungere?');
    return {
      intent: 'CREATE_TASK',
      confidence: 0.95,
      extractedData: mergedData,
      requiresClarification: false
    };
  }
  
  // ========== HANDLE RECORD_EXPENSE FOLLOW-UP ==========
  if (pending.intent === 'RECORD_EXPENSE') {
    // Extract amount from follow-up
    if (!mergedData.amount) {
      const numMatch = newMessage.match(/€?\s*(\d+(?:[.,]\d+)?)/);
      if (numMatch) {
        mergedData.amount = parseFloat(numMatch[1].replace(',', '.'));
        console.log('Extracted amount:', mergedData.amount);
      }
    }
    
    // If still no amount but message has no number, it's the category
    if (!mergedData.amount && !/\d/.test(newMessage)) {
      if (!mergedData.category) {
        mergedData.category = newMessage.trim();
        console.log('Set category:', mergedData.category);
      }
    }
    
    // If we have amount but no category, use message as category
    if (mergedData.amount && !mergedData.category && !/\d/.test(newMessage)) {
      mergedData.category = newMessage.trim();
    }
    
    const hasAmount = mergedData.amount !== undefined && mergedData.amount > 0;
    const hasCategory = mergedData.category && mergedData.category.length > 1;
    
    if (hasAmount && hasCategory) {
      return {
        intent: 'RECORD_EXPENSE',
        confidence: 0.95,
        extractedData: mergedData,
        requiresClarification: false
      };
    }
    
    return {
      intent: 'RECORD_EXPENSE',
      confidence: 0.6,
      extractedData: mergedData,
      requiresClarification: true,
      clarificationQuestion: !hasAmount ? 'Quanto hai speso?' : 'Per cosa?'
    };
  }
  
  // ========== HANDLE CREATE_EVENT FOLLOW-UP ==========
  if (pending.intent === 'CREATE_EVENT') {
    // Extract time
    if (!mergedData.startTime) {
      let timeMatch = newMessage.match(/alle?\s*(\d{1,2})(?:[:.:](\d{2}))?/i);
      if (!timeMatch) timeMatch = newMessage.match(/^(\d{1,2})(?:[:.:](\d{2}))?$/);
      if (!timeMatch) timeMatch = newMessage.match(/ore\s*(\d{1,2})(?:[:.:](\d{2}))?/i);
      
      if (timeMatch) {
        mergedData.startTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}`;
        console.log('Extracted time:', mergedData.startTime);
      }
    }
    
    // Extract date
    if (!mergedData.date) {
      if (/oggi/i.test(lower)) {
        mergedData.date = format(new Date(), 'yyyy-MM-dd');
      } else if (/domani/i.test(lower)) {
        mergedData.date = format(addDays(new Date(), 1), 'yyyy-MM-dd');
      }
    }
    
    let confidence = 0.5;
    if (mergedData.title) confidence += 0.2;
    if (mergedData.date) confidence += 0.2;
    if (mergedData.startTime) confidence += 0.2;
    
    return {
      intent: 'CREATE_EVENT',
      confidence: Math.min(confidence, 1),
      extractedData: mergedData,
      requiresClarification: confidence < 0.8,
      clarificationQuestion: confidence < 0.8 ? getMissingDataQuestion('CREATE_EVENT', mergedData) : undefined
    };
  }
  
  // ========== HANDLE CREATE_TASK FOLLOW-UP ==========
  if (pending.intent === 'CREATE_TASK') {
    if (!mergedData.title) {
      mergedData.title = newMessage.trim();
    }
    
    return {
      intent: 'CREATE_TASK',
      confidence: mergedData.title ? 0.95 : 0.6,
      extractedData: mergedData,
      requiresClarification: !mergedData.title,
      clarificationQuestion: !mergedData.title ? 'Cosa vuoi aggiungere?' : undefined
    };
  }
  
  // Default: return with current intent
  return {
    intent: pending.intent,
    confidence: 0.6,
    extractedData: mergedData,
    requiresClarification: true,
    clarificationQuestion: pending.clarificationQuestion
  };
}

/**
 * Get specific question for missing data
 */
function getMissingDataQuestion(intent: string, data: Partial<ExtractedData>): string {
  if (intent === 'CREATE_EVENT') {
    if (!data.title) return 'Come si chiama l\'evento?';
    if (!data.date) return 'Quando?';
    if (!data.startTime) return 'A che ora?';
  }
  if (intent === 'CREATE_TASK') {
    if (!data.title) return 'Cosa devi fare?';
  }
  if (intent === 'CREATE_EXPENSE') {
    if (!data.amount) return 'Quanto hai speso?';
  }
  return 'Mi servono più dettagli.';
}

/**
 * Generate alternative response when loop detected - DETERMINISTIC, CONTEXT-SPECIFIC
 * 
 * RULE: Alternatives must be related to the current intent context.
 * NEVER suggest budget/expenses when talking about tasks.
 */
function getAlternativeResponse(
  parsedIntent: ParsedIntent,
  context: UserContext
): { message: string; suggestions?: string[] } {
  const { intent } = parsedIntent;
  
  // Context-specific responses - NEVER cross-pollinate
  switch (intent) {
    case 'CREATE_TASK':
    case 'QUERY_TASKS':
      // Stay in task context
      if (context.pendingTasks.length > 0) {
        return {
          message: `Hai ${context.pendingTasks.length} task in sospeso. Quale vuoi gestire?`,
          suggestions: ['Mostra task', 'Completa uno', 'Elimina uno']
        };
      }
      return {
        message: 'Non hai task in sospeso. Vuoi aggiungerne uno?',
        suggestions: ['Aggiungi task']
      };
    
    case 'CREATE_EVENT':
    case 'QUERY_EVENTS':
      // Stay in events context
      if (context.todayEvents.length > 0) {
        return {
          message: `Hai ${context.todayEvents.length} eventi oggi. Vuoi vederne i dettagli?`,
          suggestions: ['Mostra eventi']
        };
      }
      return {
        message: 'Nessun evento in programma. Vuoi aggiungerne uno?',
        suggestions: ['Aggiungi evento']
      };
    
    case 'RECORD_EXPENSE':
    case 'QUERY_EXPENSES':
    case 'QUERY_BUDGET':
      // Stay in expenses/budget context
      return {
        message: 'Per registrare una spesa, dimmi importo e descrizione (es: "50€ pranzo").',
        suggestions: ['Vedi spese', 'Vedi budget']
      };
    
    case 'ADVICE_CONTEXTUAL':
    case 'ADVICE_GENERAL':
      // Stay in advice context
      return {
        message: 'Posso aiutarti a organizzare la giornata. Cosa vuoi fare?',
        suggestions: ['Cosa fare oggi', 'Priorità', 'Aiutami a decidere']
      };
    
    case 'CREATE_GENERIC':
      // Generic - ask for clarification
      return {
        message: 'Non ho capito bene. Vuoi creare un task, un evento o registrare una spesa?',
        suggestions: ['Task', 'Evento', 'Spesa']
      };
    
    default:
      // Safe fallback - but NEVER suggest unrelated topics
      return {
        message: '❓ Cosa vorresti fare? (task, evento, spesa o elimina)',
        suggestions: ['Nuovo task', 'Nuovo evento', 'Registra spesa']
      };
  }
}

/**
 * Save conversation to history
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
 * Simple hash function for response comparison
 */
function simpleHash(str: string): string {
  // Normalize: lowercase, remove punctuation, trim
  const normalized = str.toLowerCase().replace(/[^\w\s]/g, '').trim();
  return normalized.substring(0, 50);
}

/**
 * Check if response would be a repetition
 */
function isRepetition(userId: string, hash: string): boolean {
  const hashes = responseHashes.get(userId);
  return hashes ? hashes.has(hash) : false;
}

/**
 * Record response hash
 */
function recordHash(userId: string, hash: string): void {
  if (!responseHashes.has(userId)) {
    responseHashes.set(userId, new Set());
  }
  
  const hashes = responseHashes.get(userId)!;
  hashes.add(hash);
  
  // Limit history
  if (hashes.size > MAX_HASH_HISTORY) {
    const first = hashes.values().next().value;
    hashes.delete(first);
  }
}

/**
 * Clear response hashes for user
 */
export function clearResponseHashes(userId: string): void {
  responseHashes.delete(userId);
}

/**
 * Get smart greeting
 */
export async function getSmartGreeting(userId: string): Promise<AIEngineResult> {
  return processMessage(userId, 'ciao');
}

/**
 * Reset conversation state
 */
export async function resetConversation(userId: string): Promise<void> {
  await clearConversationHistory(userId);
  resetUnknownCount(userId);
  clearResponseHashes(userId);
  console.log('Conversation reset for user:', userId);
}

// Re-exports
export { executeAICommand } from './bridge';
export type { AIEngineResult, AIIntent } from './typesAI';
