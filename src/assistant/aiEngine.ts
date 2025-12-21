/**
 * AI Engine - Main Entry Point
 * 
 * STRICT PIPELINE (NON-NEGOTIABLE):
 * 
 * INPUT → PENDING CHECK → INTENT PARSER → CONTEXT LOADER → DECISION ROUTER → RESPONSE
 * 
 * Rules:
 * 1. NEVER respond without going through the pipeline
 * 2. NEVER skip context loading
 * 3. NEVER claim actions without DB confirmation
 * 4. External AI can ONLY advise, never execute
 * 5. Follow-up messages complete pending intents
 * 6. NO generic fallback responses
 */

import { format, addDays } from 'date-fns';
import type { AIEngineResult } from './typesAI';
import { parseIntent, type ParsedIntent, type ExtractedData } from './intentParser';
import { loadUserContext, type UserContext } from './contextLoader';
import { routeDecision, resetUnknownCount, type RouterResponse } from './decisionRouter';
import { 
  addToConversationHistory, 
  clearConversationHistory,
  getPendingIntent,
  clearPendingIntent
} from './contextStore';

// Response hash tracking for loop prevention
const responseHashes = new Map<string, Set<string>>();
const MAX_HASH_HISTORY = 10;

/**
 * Process user message through the strict pipeline
 */
export async function processMessage(
  userId: string,
  message: string
): Promise<AIEngineResult> {
  console.log('=== AI Engine Pipeline Start ===');
  console.log('User:', userId);
  console.log('Message:', message);
  
  // ========== PHASE 0: CHECK PENDING INTENT FIRST (ABSOLUTE PRIORITY) ==========
  console.log('--- Phase 0: Pending Intent Check ---');
  const pendingIntent = getPendingIntent(userId);
  let parsedIntent: ParsedIntent;
  
  if (pendingIntent) {
    // PRIORITY: If pending intent exists, ALWAYS continue it
    console.log('Found pending intent:', pendingIntent.intent);
    console.log('Pending data:', JSON.stringify(pendingIntent.extractedData));
    
    // Merge new message data with pending intent
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

/**
 * Merge new message with pending intent to complete the action
 * Handles: CREATE_EVENT, CREATE_TASK, RECORD_EXPENSE, CREATE_GENERIC
 */
function mergeWithPendingIntent(
  newMessage: string,
  pending: { intent: any; extractedData: Partial<ExtractedData>; clarificationQuestion: string }
): ParsedIntent {
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
      return {
        intent: 'CREATE_TASK',
        confidence: 0.95,
        extractedData: mergedData,
        requiresClarification: false
      };
    }
    if (/evento/i.test(lower)) {
      console.log('User chose EVENT');
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
 * Generate alternative response when loop detected - NO GENERIC FALLBACKS
 */
function getAlternativeResponse(
  parsedIntent: ParsedIntent,
  context: UserContext
): { message: string; suggestions?: string[] } {
  const { intent } = parsedIntent;
  
  // Context-specific responses only - no generic fallbacks
  switch (intent) {
    case 'ADVICE_CONTEXTUAL':
      if (context.pendingTasks.length > 0) {
        return {
          message: `Hai ${context.pendingTasks.length} task in sospeso. Vuoi che ti aiuti a organizzarli?`,
          suggestions: ['Mostra i task', 'Priorità del giorno']
        };
      }
      if (context.todayEvents.length > 0) {
        return {
          message: `Hai ${context.todayEvents.length} eventi oggi. Vuoi vedere il programma?`,
          suggestions: ['Eventi di oggi']
        };
      }
      return {
        message: 'Giornata libera! Aggiungi un task o un evento.',
        suggestions: ['Aggiungi task', 'Aggiungi evento']
      };
    
    case 'QUERY_TASKS':
    case 'QUERY_EVENTS':
      return {
        message: 'Vuoi vedere il budget o le spese?',
        suggestions: ['Budget', 'Spese']
      };
    
    default:
      // Return empty to avoid generic response
      return {
        message: '',
        suggestions: []
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
