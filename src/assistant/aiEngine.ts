/**
 * AI Engine - Main Entry Point
 * 
 * STRICT PIPELINE (NON-NEGOTIABLE):
 * 
 * INPUT → INTENT PARSER → CONTEXT LOADER → DECISION ROUTER → RESPONSE
 * 
 * Rules:
 * 1. NEVER respond without going through the pipeline
 * 2. NEVER skip context loading
 * 3. NEVER claim actions without DB confirmation
 * 4. External AI can ONLY advise, never execute
 */

import type { AIEngineResult } from './typesAI';
import { parseIntent, type ParsedIntent } from './intentParser';
import { loadUserContext, type UserContext } from './contextLoader';
import { routeDecision, resetUnknownCount, type RouterResponse } from './decisionRouter';
import { addToConversationHistory, clearConversationHistory } from './contextStore';

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
  
  // ========== PHASE 1: INTENT PARSING ==========
  console.log('--- Phase 1: Intent Parsing ---');
  const parsedIntent = parseIntent(message);
  console.log('Parsed Intent:', parsedIntent.intent);
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
    requiresClarification: routerResponse.requiresClarification
  });
  
  // ========== PHASE 4: LOOP PREVENTION ==========
  if (routerResponse.message) {
    const hash = simpleHash(routerResponse.message);
    
    if (isRepetition(userId, hash)) {
      console.log('Loop detected - generating alternative');
      const alternative = getAlternativeResponse(parsedIntent, context);
      routerResponse.message = alternative.message;
      routerResponse.suggestions = alternative.suggestions;
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
  console.log('Final message:', result.message?.substring(0, 100) + '...');
  
  return result;
}

/**
 * Generate alternative response when loop detected
 */
function getAlternativeResponse(
  parsedIntent: ParsedIntent,
  context: UserContext
): { message: string; suggestions?: string[] } {
  const { intent } = parsedIntent;
  
  switch (intent) {
    case 'ADVICE_CONTEXTUAL':
      // Provide different suggestions based on context
      if (context.pendingTasks.length > 0) {
        return {
          message: `Hai ${context.pendingTasks.length} task in sospeso. Vuoi che ti aiuti a organizzarli?`,
          suggestions: ['Mostra i task', 'Priorità del giorno']
        };
      }
      if (context.todayEvents.length > 0) {
        return {
          message: `Hai ${context.todayEvents.length} eventi oggi. Vuoi vedere il programma?`,
          suggestions: ['Eventi di oggi', 'Suggerimenti']
        };
      }
      return {
        message: 'Giornata libera! Cosa vorresti fare?',
        suggestions: ['Aggiungi task', 'Aggiungi evento', 'Controlla budget']
      };
    
    case 'QUERY_TASKS':
    case 'QUERY_EVENTS':
      return {
        message: 'C\'è altro che posso aiutarti a trovare?',
        suggestions: ['Budget', 'Spese', 'Suggerimenti']
      };
    
    case 'SMALL_TALK':
      return {
        message: 'Dimmi come posso esserti utile!',
        suggestions: ['Task', 'Eventi', 'Spese']
      };
    
    default:
      return {
        message: 'Come posso aiutarti?',
        suggestions: ['Mostra i task', 'Eventi di oggi', 'Suggerimenti']
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
