/**
 * Execution Controller - Phase 3 of Decision Engine
 * 
 * Rules:
 * - NEVER respond without valid Decision Object
 * - External AI ONLY if requires_ai = true
 * - External AI can NEVER claim to perform actions
 * - Quick actions ONLY for ACTION intent
 */

import type { DecisionObject, ExecutionResult } from './decisionEngine';
import { getUIControls } from './decisionEngine';
import { getSuggestionsForDecision, buildSuggestionResponse } from './suggestionEngine';
import { handleUserMessage as localOrchestrator } from './orchestrator';
import { sendToExternalAI, formatHistoryForAI } from './openrouterClient';
import { executeAICommand } from './bridge';
import { getConversationHistory } from './contextStore';
import type { AIEngineResult } from './typesAI';

/**
 * Execute based on validated Decision Object
 * Returns null if decision is invalid
 */
export async function executeDecision(
  userId: string,
  message: string,
  decision: DecisionObject
): Promise<ExecutionResult | null> {
  // STRICT: No response without valid decision
  if (!decision.valid) {
    console.error('Invalid decision, cannot respond:', decision.validationError);
    return null;
  }

  const controls = getUIControls(decision);

  switch (decision.intent) {
    case 'ACTION':
      return await executeAction(userId, message, decision, controls);
    
    case 'SUGGESTION':
      return executeSuggestion(userId, decision, controls);
    
    case 'INFORMATIONAL':
      return await executeInformational(userId, message, decision, controls);
    
    case 'UNKNOWN':
      return executeUnknown(userId, decision, controls);
    
    default:
      return null;
  }
}

async function executeAction(
  userId: string,
  message: string,
  decision: DecisionObject,
  controls: { showQuickActions: boolean; maxSuggestions: number }
): Promise<ExecutionResult> {
  // Social responses
  if (decision.action === 'respond') {
    const localResult = await localOrchestrator(userId, message);
    return {
      shouldRespond: true,
      message: localResult.message,
      suggestions: localResult.suggestions?.slice(0, controls.maxSuggestions),
      showQuickActions: false, // No quick actions for social
      source: 'local',
      decision
    };
  }

  // Query actions
  if (decision.action === 'query') {
    const localResult = await localOrchestrator(userId, message);
    return {
      shouldRespond: true,
      message: localResult.message,
      suggestions: localResult.suggestions?.slice(0, controls.maxSuggestions),
      showQuickActions: controls.showQuickActions,
      source: 'local',
      decision
    };
  }

  // Create/Update actions - may need external AI
  if (decision.requires_ai) {
    return await executeWithExternalAI(userId, message, decision, controls);
  }

  // Local execution
  const localResult = await localOrchestrator(userId, message);
  return {
    shouldRespond: true,
    message: localResult.message,
    suggestions: localResult.suggestions?.slice(0, controls.maxSuggestions),
    showQuickActions: controls.showQuickActions,
    source: 'local',
    decision
  };
}

function executeSuggestion(
  userId: string,
  decision: DecisionObject,
  controls: { showQuickActions: boolean; maxSuggestions: number }
): ExecutionResult {
  const suggestions = getSuggestionsForDecision(userId, decision);
  const message = buildSuggestionResponse(suggestions, decision.domain);

  return {
    shouldRespond: true,
    message,
    suggestions,
    showQuickActions: false, // NEVER for suggestions
    source: 'local',
    decision
  };
}

async function executeInformational(
  userId: string,
  message: string,
  decision: DecisionObject,
  controls: { showQuickActions: boolean; maxSuggestions: number }
): Promise<ExecutionResult> {
  if (decision.requires_ai) {
    // External AI for knowledge questions
    try {
      const history = await getConversationHistory(userId);
      const formattedHistory = formatHistoryForAI(history);
      const aiResponse = await sendToExternalAI(message, formattedHistory);

      if (aiResponse.success && aiResponse.response) {
        // Clean any action claims
        let cleanMessage = aiResponse.response.message || '';
        cleanMessage = cleanActionClaims(cleanMessage);

        return {
          shouldRespond: true,
          message: cleanMessage,
          showQuickActions: false,
          source: 'external',
          decision
        };
      }
    } catch (error) {
      console.error('External AI error for informational:', error);
    }
  }

  // Fallback for informational
  return {
    shouldRespond: true,
    message: 'Questa è una domanda interessante, ma non ho accesso a informazioni generali. Posso aiutarti con i tuoi task, eventi o spese!',
    showQuickActions: false,
    source: 'local',
    decision
  };
}

function executeUnknown(
  userId: string,
  decision: DecisionObject,
  controls: { showQuickActions: boolean; maxSuggestions: number }
): ExecutionResult {
  return {
    shouldRespond: true,
    message: 'Puoi dirmi cosa vuoi fare? Posso aiutarti con task, eventi, spese o darti suggerimenti.',
    showQuickActions: false,
    source: 'local',
    decision
  };
}

async function executeWithExternalAI(
  userId: string,
  message: string,
  decision: DecisionObject,
  controls: { showQuickActions: boolean; maxSuggestions: number }
): Promise<ExecutionResult> {
  try {
    const history = await getConversationHistory(userId);
    const formattedHistory = formatHistoryForAI(history);
    const aiResponse = await sendToExternalAI(message, formattedHistory);

    if (!aiResponse.success || !aiResponse.response) {
      return {
        shouldRespond: true,
        message: 'Dimmi più dettagli: cosa vuoi creare e quando?',
        showQuickActions: controls.showQuickActions,
        source: 'local',
        decision
      };
    }

    const { intent, payload, message: aiMessage } = aiResponse.response;

    // Execute action locally if parsed
    if (intent && payload) {
      const execResult = await executeAICommand(userId, intent, payload);

      if (execResult.success) {
        return {
          shouldRespond: true,
          message: execResult.message,
          showQuickActions: false, // Action done, no quick actions
          source: 'external',
          decision
        };
      } else {
        return {
          shouldRespond: true,
          message: execResult.message || 'Non sono riuscito a completare l\'azione.',
          showQuickActions: controls.showQuickActions,
          source: 'external',
          decision
        };
      }
    }

    // AI provided suggestion/clarification, not execution
    let cleanMessage = aiMessage || 'Come posso aiutarti?';
    cleanMessage = cleanActionClaims(cleanMessage);

    return {
      shouldRespond: true,
      message: cleanMessage,
      showQuickActions: controls.showQuickActions,
      source: 'external',
      decision
    };
  } catch (error) {
    console.error('External AI execution error:', error);
    return {
      shouldRespond: true,
      message: 'Si è verificato un errore. Riprova con più dettagli.',
      showQuickActions: false,
      source: 'local',
      decision
    };
  }
}

/**
 * CRITICAL: Remove any action claims from external AI
 * External AI can NEVER claim to have performed actions
 */
function cleanActionClaims(message: string): string {
  return message
    .replace(/ho aggiunto/gi, 'posso aggiungere')
    .replace(/ho creato/gi, 'posso creare')
    .replace(/ho registrato/gi, 'posso registrare')
    .replace(/ho modificato/gi, 'posso modificare')
    .replace(/ho cancellato/gi, 'posso cancellare')
    .replace(/ho eliminato/gi, 'posso eliminare')
    .replace(/ho completato/gi, 'posso completare')
    .replace(/fatto!/gi, 'posso farlo!')
    .replace(/evento creato/gi, 'posso creare l\'evento')
    .replace(/task creato/gi, 'posso creare il task')
    .replace(/spesa registrata/gi, 'posso registrare la spesa');
}

/**
 * Convert ExecutionResult to AIEngineResult for compatibility
 */
export function toAIEngineResult(result: ExecutionResult): AIEngineResult {
  return {
    message: result.message,
    source: result.source,
    suggestions: result.suggestions,
    // Only include UI controls for ACTION intent
    ...(result.decision.intent === 'ACTION' && result.showQuickActions && {
      followUp: result.decision.action === 'create' ? 'confirm' : undefined
    })
  };
}
