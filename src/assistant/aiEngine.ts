/**
 * AI Engine - Refactored with deterministic intent classification
 * Intent is classified FIRST, then response is generated according to rules
 */

import type { AIEngineResult, AIIntent } from './typesAI';
import { handleUserMessage as localHandleMessage } from './orchestrator';
import { sendToExternalAI, formatHistoryForAI } from './openrouterClient';
import { executeAICommand, requiresExecution, requiresQuery } from './bridge';
import { getFallbackResponse, getErrorRecoveryResponse, getHelpResponse } from './fallback';
import { getConversationHistory, addToConversationHistory, getContext } from './contextStore';
import { resetSessionState, getSessionState, updateSessionState, getDiverseSuggestions } from './conversationIntelligence';
import {
  classifyIntentV2,
  wouldBeRepetition,
  recordResponseHash,
  clearResponseHashes,
  incrementUnknownCount,
  resetUnknownCount,
  getUnknownCount,
  type IntentCategory
} from './intentClassifierV2';
import {
  buildControlledResponse,
  cleanResponse,
  getClarificationQuestion,
  getInformationalResponse,
  type ControlledResponse
} from './responseController';

/**
 * Main AI Engine entry point - SINGLE response per message
 */
export async function processMessage(
  userId: string,
  message: string
): Promise<AIEngineResult> {
  console.log('AI Engine processing:', message);

  // STEP 1: Classify intent FIRST (deterministic)
  const classifiedIntent = classifyIntentV2(message);
  console.log('Classified intent:', classifiedIntent);

  // STEP 2: Handle based on intent category
  let response: AIEngineResult;

  switch (classifiedIntent.category) {
    case 'ACTION':
      resetUnknownCount(userId);
      response = await handleActionIntent(userId, message, classifiedIntent.subtype);
      break;

    case 'SUGGESTION':
      resetUnknownCount(userId);
      response = await handleSuggestionIntent(userId, message);
      break;

    case 'INFORMATIONAL':
      resetUnknownCount(userId);
      response = handleInformationalIntent(message);
      break;

    case 'UNKNOWN':
      response = handleUnknownIntent(userId, message);
      break;

    default:
      response = handleUnknownIntent(userId, message);
  }

  // STEP 3: Loop guard - check for repetition
  if (wouldBeRepetition(userId, response.message)) {
    console.log('Loop guard triggered - generating alternative');
    response = generateAlternativeResponse(userId, classifiedIntent.category);
  }

  // STEP 4: Clean forbidden phrases
  response.message = cleanResponse(response.message);

  // STEP 5: Record response hash
  recordResponseHash(userId, response.message);

  // STEP 6: Save to conversation history
  await saveConversationEntry(userId, message, response.message);

  return response;
}

/**
 * Handle ACTION intent - create, update, query data
 */
async function handleActionIntent(
  userId: string,
  message: string,
  subtype?: string
): Promise<AIEngineResult> {
  // Social subtypes handled directly
  if (subtype === 'greeting' || subtype === 'thanks' || subtype === 'farewell' || subtype === 'small_talk' || subtype === 'help') {
    return handleSocialIntent(userId, message, subtype);
  }

  // Try local orchestrator first
  try {
    const localResponse = await localHandleMessage(userId, message);
    
    // Check if this needs external AI for parsing (create events, expenses)
    if (localResponse.followUp && ['create_event', 'create_expense'].includes(localResponse.followUp)) {
      return await handleExternalCreate(userId, message);
    }

    return {
      message: localResponse.message,
      source: 'local',
      suggestions: localResponse.suggestions,
      intent: subtype as AIIntent,
      // Only include decision/reasoning if present
      ...((localResponse as any).decision && { decision: (localResponse as any).decision }),
      ...((localResponse as any).reasoning && { reasoning: (localResponse as any).reasoning }),
      ...((localResponse as any).focusItems && { focusItems: (localResponse as any).focusItems })
    };
  } catch (error) {
    console.error('Local action handler error:', error);
    return getFallbackResponse({ userMessage: message });
  }
}

/**
 * Handle social intents (greeting, thanks, etc.)
 */
async function handleSocialIntent(
  userId: string,
  message: string,
  subtype: string
): Promise<AIEngineResult> {
  try {
    const localResponse = await localHandleMessage(userId, message);
    return {
      message: localResponse.message,
      source: 'local',
      suggestions: localResponse.suggestions
    };
  } catch {
    return getHelpResponse();
  }
}

/**
 * Handle SUGGESTION intent - user asks what to do
 */
async function handleSuggestionIntent(
  userId: string,
  message: string
): Promise<AIEngineResult> {
  const sessionState = getSessionState(userId);
  
  try {
    // Get diverse suggestions based on conversation history
    const suggestions = getDiverseSuggestions(userId);
    
    // Vary the intro based on how many times asked
    const intros = [
      'Ecco alcune idee per te:',
      'Prova una di queste:',
      'Che ne dici di:',
      'Ti propongo:'
    ];
    
    const introIndex = sessionState.responseCount % intros.length;
    const intro = intros[introIndex];
    
    const suggestionList = suggestions
      .slice(0, 3)
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n');

    updateSessionState(userId, { responseCount: sessionState.responseCount + 1 });

    return {
      message: `${intro}\n\n${suggestionList}`,
      source: 'local',
      suggestions: suggestions.slice(0, 3),
      intent: 'suggestion'
    };
  } catch (error) {
    console.error('Suggestion handler error:', error);
    return {
      message: 'Ecco un\'idea: prenditi 10 minuti per organizzare la giornata.',
      source: 'local',
      suggestions: ['Mostra i task', 'Eventi oggi', 'Budget'],
      intent: 'suggestion'
    };
  }
}

/**
 * Handle INFORMATIONAL intent - general knowledge questions
 */
function handleInformationalIntent(message: string): AIEngineResult {
  // NO actions, NO decisions, NO task language
  return {
    message: getInformationalResponse(message),
    source: 'local',
    // No suggestions for informational queries
    intent: 'advice'
  };
}

/**
 * Handle UNKNOWN intent
 */
function handleUnknownIntent(userId: string, message: string): AIEngineResult {
  const unknownCount = incrementUnknownCount(userId);
  
  const clarification = getClarificationQuestion(unknownCount - 1);
  
  if (!clarification) {
    // Stop responding after 2 UNKNOWN in a row
    return {
      message: '',
      source: 'local'
    };
  }

  return {
    message: clarification,
    source: 'local',
    // No suggestions for unknown - just clarify
    intent: 'unknown'
  };
}

/**
 * Generate alternative when loop detected
 */
function generateAlternativeResponse(userId: string, category: IntentCategory): AIEngineResult {
  const sessionState = getSessionState(userId);
  updateSessionState(userId, { noDataResponseCount: sessionState.noDataResponseCount + 1 });
  
  const alternatives = [
    {
      message: 'Cambiamo prospettiva. Hai qualcosa di specifico in mente?',
      suggestions: ['Aggiungi task', 'Crea evento', 'Registra spesa']
    },
    {
      message: 'Vuoi che ti aiuti con qualcosa di concreto?',
      suggestions: ['Mostra task', 'Eventi oggi', 'Vedi budget']
    },
    {
      message: 'Posso aiutarti a organizzare, pianificare o registrare qualcosa.',
      suggestions: ['Pianifica giornata', 'Analisi settimanale']
    }
  ];

  const altIndex = sessionState.noDataResponseCount % alternatives.length;
  const alt = alternatives[altIndex];

  return {
    message: alt.message,
    source: 'local',
    suggestions: alt.suggestions
  };
}

/**
 * Handle external AI for complex creates (events, expenses with parsing)
 */
async function handleExternalCreate(
  userId: string,
  message: string
): Promise<AIEngineResult> {
  try {
    const history = await getConversationHistory(userId);
    const formattedHistory = formatHistoryForAI(history);
    
    const aiResponse = await sendToExternalAI(message, formattedHistory);
    
    if (!aiResponse.success || !aiResponse.response) {
      return {
        message: 'Dimmi più dettagli: cosa vuoi creare e quando?',
        source: 'local',
        followUp: 'create_event'
      };
    }

    const { intent, payload, message: aiMessage } = aiResponse.response;

    if (requiresExecution(intent)) {
      const execResult = await executeAICommand(userId, intent, payload);
      
      if (execResult.success) {
        return {
          message: execResult.message,
          source: 'external',
          intent,
          actionExecuted: true,
          actionResult: { success: true, data: execResult.data }
        };
      } else {
        return {
          message: execResult.message || 'Non sono riuscito a completare l\'azione. Riprova con più dettagli.',
          source: 'external',
          intent,
          actionExecuted: false
        };
      }
    }

    // Clean any false action claims
    let cleanMessage = aiMessage || 'Come posso aiutarti?';
    cleanMessage = cleanMessage
      .replace(/ho aggiunto/gi, 'posso aggiungere')
      .replace(/ho creato/gi, 'posso creare')
      .replace(/ho registrato/gi, 'posso registrare');

    return {
      message: cleanMessage,
      source: 'external',
      intent
    };
  } catch (error) {
    console.error('External AI error:', error);
    return getErrorRecoveryResponse('network');
  }
}

/**
 * Save conversation entries
 */
async function saveConversationEntry(
  userId: string,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  await addToConversationHistory(userId, {
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString()
  });
  
  if (assistantMessage) {
    await addToConversationHistory(userId, {
      role: 'assistant',
      content: assistantMessage,
      timestamp: new Date().toISOString()
    });
  }
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
  resetSessionState(userId);
  clearResponseHashes(userId);
  resetUnknownCount(userId);
}

// Re-export for convenience
export { executeAICommand } from './bridge';
export type { AIEngineResult, AIIntent } from './typesAI';
