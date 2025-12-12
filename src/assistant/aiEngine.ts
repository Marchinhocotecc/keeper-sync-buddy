/**
 * AI Engine - Hybrid local + external AI system
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

// Threshold for using external AI
const LOCAL_CONFIDENCE_THRESHOLD = 0.6;

// Keywords that suggest complex requests needing external AI
const COMPLEX_KEYWORDS = [
  'perché', 'consigliami', 'cosa dovrei', 'analizza', 'spiega',
  'qual è il migliore', 'come posso migliorare', 'suggeriscimi',
  'organizza', 'pianifica', 'ottimizza', 'valuta'
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

  // Save user message to history
  await addToConversationHistory(userId, {
    role: 'user',
    content: message,
    timestamp: new Date().toISOString()
  });

  // Step 1: Try local processing first
  const localResult = await tryLocalProcessing(userId, message);
  
  if (localResult.shouldUseLocal) {
    // Local processing was sufficient
    await saveAssistantResponse(userId, localResult.result.message);
    return localResult.result;
  }

  // Step 2: Use external AI for complex requests
  const externalResult = await tryExternalProcessing(userId, message, history);
  
  if (externalResult.success) {
    await saveAssistantResponse(userId, externalResult.result.message);
    return externalResult.result;
  }

  // Step 3: Fallback if external AI fails
  const fallbackResult = getFallbackResponse({ wasExternalError: true, userMessage: message });
  await saveAssistantResponse(userId, fallbackResult.message);
  return fallbackResult;
}

/**
 * Try local processing first
 */
async function tryLocalProcessing(
  userId: string,
  message: string
): Promise<{ shouldUseLocal: boolean; result: AIEngineResult }> {
  const lowerMessage = message.toLowerCase();

  // Check for help request
  if (/aiuto|help|cosa (puoi|sai) fare/i.test(message)) {
    return { shouldUseLocal: true, result: getHelpResponse() };
  }

  // Check if message has local keywords
  const hasLocalKeyword = LOCAL_KEYWORDS.some(kw => lowerMessage.includes(kw));
  const hasComplexKeyword = COMPLEX_KEYWORDS.some(kw => lowerMessage.includes(kw));

  // Force local for simple requests
  if (hasLocalKeyword && !hasComplexKeyword) {
    try {
      const localResponse = await localHandleMessage(userId, message);
      return {
        shouldUseLocal: true,
        result: {
          message: localResponse.message,
          source: 'local',
          suggestions: localResponse.suggestions
        }
      };
    } catch (error) {
      console.error('Local processing error:', error);
    }
  }

  // Try local orchestrator
  try {
    const localResponse = await localHandleMessage(userId, message);
    
    // Check if local response indicates need for external AI
    const needsExternal = shouldEscalateToExternal(localResponse, message);
    
    if (!needsExternal) {
      return {
        shouldUseLocal: true,
        result: {
          message: localResponse.message,
          source: 'local',
          suggestions: localResponse.suggestions
        }
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
function shouldEscalateToExternal(localResponse: any, message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  // Complex keywords always escalate
  if (COMPLEX_KEYWORDS.some(kw => lowerMessage.includes(kw))) {
    return true;
  }

  // Long messages might need more context
  if (message.length > 100) {
    return true;
  }

  // Check if local response indicates uncertainty
  const uncertaintyPhrases = [
    'non sono sicuro',
    'non ho capito',
    'potresti riformulare',
    'hmm'
  ];

  if (uncertaintyPhrases.some(phrase => 
    localResponse.message?.toLowerCase().includes(phrase)
  )) {
    return true;
  }

  // Check for followUp indicating action request
  if (localResponse.followUp && [
    'create_task', 'create_event', 'create_expense'
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
      // Execute the command
      const execResult = await executeAICommand(userId, intent, payload);
      
      result = {
        message: execResult.success 
          ? execResult.message 
          : (aiMessage || execResult.message),
        source: 'external',
        intent,
        actionExecuted: execResult.success,
        actionResult: {
          success: execResult.success,
          data: execResult.data,
          error: execResult.error
        }
      };
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
      result = {
        message: aiMessage || 'Come posso aiutarti?',
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
}

// Re-export for convenience
export { executeAICommand } from './bridge';
export type { AIEngineResult, AIIntent } from './typesAI';
