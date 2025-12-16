/**
 * AI Engine - Hybrid local + external AI system with conversation intelligence
 */

import type { AIEngineResult, AIConversationEntry, AIIntent } from './typesAI';
import { handleUserMessage as localHandleMessage } from './orchestrator';
import { sendToExternalAI, formatHistoryForAI } from './openrouterClient';
import { isActionableIntent, isQueryIntent } from './intentParser';
import { executeAICommand, requiresExecution, requiresQuery } from './bridge';
import { 
  getFallbackResponse, 
  getErrorRecoveryResponse, 
  getNeverUnknownResponse,
  getHelpResponse 
} from './fallback';
import { 
  getConversationHistory, 
  addToConversationHistory,
  getContext 
} from './contextStore';
import {
  getSessionState,
  updateSessionState,
  detectRephrasing,
  detectMode,
  isRepetitiveResponse,
  getNoDataAlternativeResponse,
  trackResponse,
  increaseInsistence,
  resetSessionState,
  type AssistantMode,
  type SessionState
} from './conversationIntelligence';

// Threshold for using external AI
const LOCAL_CONFIDENCE_THRESHOLD = 0.6;

// Keywords that suggest complex requests needing external AI
const COMPLEX_KEYWORDS = [
  'perché', 'analizza', 'spiega',
  'qual è il migliore', 'come posso migliorare',
  'ottimizza', 'valuta'
];

// Keywords for suggestions (handled locally with intelligence)
const SUGGESTION_KEYWORDS = [
  'consigliami', 'cosa dovrei', 'suggeriscimi',
  'organizza', 'pianifica', 'cosa potrei'
];

// Keywords that should stay local
const LOCAL_KEYWORDS = [
  'mostra', 'vedi', 'elenca', 'lista', 'quanto', 'quanti',
  'aggiungi', 'crea', 'registra', 'segna', 'fatto'
];

/**
 * Main AI Engine entry point
 */
export async function processMessage(
  userId: string,
  message: string
): Promise<AIEngineResult> {
  console.log('AI Engine processing:', message);

  // Get conversation history for context
  const history = await getConversationHistory(userId);
  const context = await getContext(userId);
  const sessionState = getSessionState(userId);

  // Detect if user is rephrasing
  const { isRephrasing, similarity } = detectRephrasing(message, history);
  if (isRephrasing) {
    increaseInsistence(userId);
    console.log('User rephrasing detected, insistence:', sessionState.userInsistenceLevel + 1);
  }

  // Detect and update assistant mode
  const detectedMode = detectMode(message);
  if (detectedMode !== sessionState.mode) {
    updateSessionState(userId, { mode: detectedMode });
    console.log('Mode changed to:', detectedMode);
  }

  // Save user message to history
  await addToConversationHistory(userId, {
    role: 'user',
    content: message,
    timestamp: new Date().toISOString()
  });

  // Step 1: Try local processing first
  const localResult = await tryLocalProcessing(userId, message, isRephrasing);
  
  if (localResult.shouldUseLocal) {
    // Check for repetitive response
    if (isRepetitiveResponse(userId, localResult.result.message)) {
      console.log('Repetitive response detected, generating alternative');
      const alternative = getNoDataAlternativeResponse(userId, {
        hasEvents: false,
        hasTasks: false,
        hasExpenses: false
      });
      localResult.result.message = alternative.message;
      localResult.result.suggestions = alternative.suggestions;
    }

    trackResponse(userId, localResult.result.message, localResult.result.intent || null, true);
    await saveAssistantResponse(userId, localResult.result.message);
    return localResult.result;
  }

  // Step 2: Use external AI for complex requests
  const externalResult = await tryExternalProcessing(userId, message, history);
  
  if (externalResult.success) {
    trackResponse(userId, externalResult.result.message, externalResult.result.intent || null, true);
    await saveAssistantResponse(userId, externalResult.result.message);
    return externalResult.result;
  }

  // Step 3: Fallback if external AI fails
  const fallbackResult = getFallbackResponse({ wasExternalError: true, userMessage: message });
  trackResponse(userId, fallbackResult.message, null, false);
  await saveAssistantResponse(userId, fallbackResult.message);
  return fallbackResult;
}

/**
 * Try local processing first
 */
async function tryLocalProcessing(
  userId: string,
  message: string,
  isRephrasing: boolean
): Promise<{ shouldUseLocal: boolean; result: AIEngineResult }> {
  const lowerMessage = message.toLowerCase();
  const sessionState = getSessionState(userId);

  // Check for help request
  if (/aiuto|help|cosa (puoi|sai) fare/i.test(message)) {
    return { shouldUseLocal: true, result: getHelpResponse() };
  }

  // Check if message has local keywords
  const hasLocalKeyword = LOCAL_KEYWORDS.some(kw => lowerMessage.includes(kw));
  const hasComplexKeyword = COMPLEX_KEYWORDS.some(kw => lowerMessage.includes(kw));
  const hasSuggestionKeyword = SUGGESTION_KEYWORDS.some(kw => lowerMessage.includes(kw));

  // Suggestion keywords are handled locally with intelligence
  if (hasSuggestionKeyword && !hasComplexKeyword) {
    try {
      const localResponse = await localHandleMessage(userId, message);
      
      // If local response is repetitive due to no data, enhance it
      if (isRepetitiveResponse(userId, localResponse.message) || 
          (isRephrasing && sessionState.userInsistenceLevel > 0)) {
        const alternative = getNoDataAlternativeResponse(userId, {
          hasEvents: false,
          hasTasks: false,
          hasExpenses: false
        });
        return {
          shouldUseLocal: true,
          result: {
            message: alternative.message,
            source: 'local',
            suggestions: alternative.suggestions
          }
        };
      }

      return {
        shouldUseLocal: true,
        result: {
          message: localResponse.message,
          source: localResponse.source === 'focus' ? 'local' : 'local',
          suggestions: localResponse.suggestions,
          ...(localResponse as any).decision && { decision: (localResponse as any).decision },
          ...(localResponse as any).reasoning && { reasoning: (localResponse as any).reasoning },
          ...(localResponse as any).focusItems && { focusItems: (localResponse as any).focusItems }
        } as AIEngineResult & { decision?: string; reasoning?: string; focusItems?: any[] }
      };
    } catch (error) {
      console.error('Local processing error:', error);
    }
  }

  // Force local for simple requests
  if (hasLocalKeyword && !hasComplexKeyword) {
    try {
      const localResponse = await localHandleMessage(userId, message);
      return {
        shouldUseLocal: true,
        result: {
          message: localResponse.message,
          source: localResponse.source === 'focus' ? 'local' : 'local',
          suggestions: localResponse.suggestions,
          ...(localResponse as any).decision && { decision: (localResponse as any).decision },
          ...(localResponse as any).reasoning && { reasoning: (localResponse as any).reasoning },
          ...(localResponse as any).focusItems && { focusItems: (localResponse as any).focusItems }
        } as AIEngineResult & { decision?: string; reasoning?: string; focusItems?: any[] }
      };
    } catch (error) {
      console.error('Local processing error:', error);
    }
  }

  // Try local orchestrator
  try {
    const localResponse = await localHandleMessage(userId, message);
    
    // Check if local response indicates need for external AI
    const needsExternal = shouldEscalateToExternal(localResponse, message, isRephrasing, sessionState);
    
    if (!needsExternal) {
      return {
        shouldUseLocal: true,
        result: {
          message: localResponse.message,
          source: localResponse.source === 'focus' ? 'local' : 'local',
          suggestions: localResponse.suggestions,
          ...(localResponse as any).decision && { decision: (localResponse as any).decision },
          ...(localResponse as any).reasoning && { reasoning: (localResponse as any).reasoning },
          ...(localResponse as any).focusItems && { focusItems: (localResponse as any).focusItems }
        } as AIEngineResult & { decision?: string; reasoning?: string; focusItems?: any[] }
      };
    }
  } catch (error) {
    console.error('Local processing error:', error);
  }

  // Default: escalate to external
  return {
    shouldUseLocal: false,
    result: { message: '', source: 'local' }
  };
}

/**
 * Check if we should escalate to external AI
 */
function shouldEscalateToExternal(
  localResponse: any, 
  message: string,
  isRephrasing: boolean,
  sessionState: SessionState
): boolean {
  // Never escalate focus responses - they're handled by the Daily Focus Engine
  if (localResponse.source === 'focus') {
    return false;
  }

  const lowerMessage = message.toLowerCase();
  
  // Complex keywords always escalate (but not suggestion keywords)
  if (COMPLEX_KEYWORDS.some(kw => lowerMessage.includes(kw))) {
    return true;
  }

  // Long messages might need more context (but higher threshold)
  if (message.length > 150) {
    return true;
  }

  // Check if local response indicates uncertainty
  const uncertaintyPhrases = [
    'non sono sicuro',
    'potresti riformulare'
  ];

  // "non ho capito" should NOT trigger external AI - use local fallback instead
  if (uncertaintyPhrases.some(phrase => 
    localResponse.message?.toLowerCase().includes(phrase)
  )) {
    return true;
  }

  // Check for followUp indicating action request that needs parsing
  if (localResponse.followUp && [
    'create_event', 'create_expense'
  ].includes(localResponse.followUp)) {
    return true;
  }

  return false;
}

/**
 * Try external AI processing
 */
async function tryExternalProcessing(
  userId: string,
  message: string,
  history: any[]
): Promise<{ success: boolean; result: AIEngineResult }> {
  try {
    // Format history for AI
    const formattedHistory = formatHistoryForAI(history);
    
    // Call external AI
    const aiResponse = await sendToExternalAI(message, formattedHistory);
    
    if (!aiResponse.success || !aiResponse.response) {
      console.warn('External AI failed:', aiResponse.error);
      return {
        success: false,
        result: getErrorRecoveryResponse('network')
      };
    }

    const { intent, payload, message: aiMessage } = aiResponse.response;
    console.log('External AI response:', { intent, payload });

    // Handle different intent types
    let result: AIEngineResult;

    if (requiresExecution(intent)) {
      // Execute the command - ONLY here do we confirm action
      const execResult = await executeAICommand(userId, intent, payload);
      
      // CRITICAL: Only claim success if actually executed
      if (execResult.success) {
        result = {
          message: execResult.message, // This message confirms the action
          source: 'external',
          intent,
          actionExecuted: true,
          actionResult: {
            success: true,
            data: execResult.data
          }
        };
      } else {
        // Execution failed - say so honestly
        result = {
          message: execResult.message || 'Non sono riuscito a completare l\'azione. Riprova.',
          source: 'external',
          intent,
          actionExecuted: false,
          actionResult: {
            success: false,
            error: execResult.error
          }
        };
      }
    } else if (requiresQuery(intent)) {
      // Execute query
      const queryResult = await executeAICommand(userId, intent, payload);
      
      result = {
        message: queryResult.message,
        source: 'external',
        intent
      };
    } else {
      // Advice, greeting, etc - just return the message
      // Clean any false action claims from AI message
      let cleanMessage = aiMessage || 'Come posso aiutarti?';
      const falseClaimPatterns = [
        /ho (aggiunto|creato|registrato|inserito)/gi,
        /fatto!|completato!/gi,
        /è stato (aggiunto|creato)/gi
      ];
      
      for (const pattern of falseClaimPatterns) {
        if (pattern.test(cleanMessage)) {
          // Replace with proposal language
          cleanMessage = cleanMessage
            .replace(/ho aggiunto/gi, 'posso aggiungere')
            .replace(/ho creato/gi, 'posso creare')
            .replace(/ho registrato/gi, 'posso registrare')
            .replace(/ho inserito/gi, 'posso inserire');
        }
      }

      result = {
        message: cleanMessage,
        source: 'external',
        intent
      };
    }

    // Add suggestions if not present
    if (!result.suggestions) {
      result.suggestions = generateFollowUpSuggestions(intent);
    }

    return { success: true, result };

  } catch (error) {
    console.error('External AI processing error:', error);
    return {
      success: false,
      result: getErrorRecoveryResponse('unknown')
    };
  }
}

/**
 * Generate follow-up suggestions based on intent
 */
function generateFollowUpSuggestions(intent: AIIntent): string[] {
  const suggestions: Record<string, string[]> = {
    create_event: ['Mostra calendario', 'Aggiungi altro evento', 'I miei task'],
    create_task: ['Mostra task', 'Aggiungi altro task', 'Eventi oggi'],
    create_expense: ['Vedi spese', 'Controlla budget', 'Aggiungi spesa'],
    query_tasks: ['Segna come fatto', 'Aggiungi task', 'Eventi oggi'],
    query_events: ['Aggiungi evento', 'Task da fare', 'Budget'],
    query_expenses: ['Controlla budget', 'Registra spesa', 'Task'],
    query_budget: ['Vedi spese', 'Modifica budget', 'Task'],
    advice: ['Mostra task', 'Eventi oggi', 'Budget'],
    suggestion: ['Cosa ho oggi?', 'I miei task', 'Pianifica domani'],
    greeting: ['Cosa ho oggi?', 'I miei task', 'Suggerimenti'],
    default: ['Mostra task', 'Eventi oggi', 'Spese del mese']
  };

  return suggestions[intent] || suggestions.default;
}

/**
 * Save assistant response to history
 */
async function saveAssistantResponse(userId: string, message: string): Promise<void> {
  await addToConversationHistory(userId, {
    role: 'assistant',
    content: message,
    timestamp: new Date().toISOString()
  });
}

/**
 * Get a smart greeting based on context
 */
export async function getSmartGreeting(userId: string): Promise<AIEngineResult> {
  try {
    const localResponse = await localHandleMessage(userId, 'ciao');
    return {
      message: localResponse.message,
      source: 'local',
      suggestions: localResponse.suggestions
    };
  } catch {
    return getFallbackResponse();
  }
}

/**
 * Clear conversation and start fresh
 */
export async function resetConversation(userId: string): Promise<void> {
  const { clearConversationHistory } = await import('./contextStore');
  await clearConversationHistory(userId);
  resetSessionState(userId); // Also reset session intelligence
}

// Re-export for convenience
export { executeAICommand } from './bridge';
export type { AIEngineResult, AIIntent } from './typesAI';
