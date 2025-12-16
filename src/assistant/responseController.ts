/**
 * Response Controller - Enforces response rules per intent category
 * Ensures ONE response per message, proper UI controls
 */

import type { IntentCategory, ClassifiedIntent } from './intentClassifierV2';

export interface ControlledResponse {
  message: string;
  suggestions?: string[];
  showQuickActions: boolean;
  showDecision: boolean;
  decision?: string;
  reasoning?: string;
  followUp?: string;
  source: 'local' | 'external';
}

/**
 * Determine what UI elements should be shown based on intent
 */
export function getResponseControls(intent: ClassifiedIntent): {
  showQuickActions: boolean;
  showDecision: boolean;
  maxSuggestions: number;
} {
  switch (intent.category) {
    case 'ACTION':
      // Show quick actions only for certain subtypes
      const actionSubtypes = ['create', 'create_task', 'update_task', 'update', 'query'];
      return {
        showQuickActions: intent.subtype ? actionSubtypes.includes(intent.subtype) : true,
        showDecision: intent.subtype === 'create' || intent.subtype === 'create_task',
        maxSuggestions: 3
      };
    
    case 'SUGGESTION':
      return {
        showQuickActions: true,
        showDecision: false,
        maxSuggestions: 3
      };
    
    case 'INFORMATIONAL':
      // NO actions, NO decisions, NO task language
      return {
        showQuickActions: false,
        showDecision: false,
        maxSuggestions: 0
      };
    
    case 'UNKNOWN':
      return {
        showQuickActions: false,
        showDecision: false,
        maxSuggestions: 0
      };
    
    default:
      return {
        showQuickActions: false,
        showDecision: false,
        maxSuggestions: 0
      };
  }
}

/**
 * Build controlled response with proper UI flags
 */
export function buildControlledResponse(
  intent: ClassifiedIntent,
  message: string,
  options: {
    suggestions?: string[];
    decision?: string;
    reasoning?: string;
    followUp?: string;
    source?: 'local' | 'external';
  } = {}
): ControlledResponse {
  const controls = getResponseControls(intent);
  
  return {
    message,
    suggestions: controls.maxSuggestions > 0 
      ? (options.suggestions || []).slice(0, controls.maxSuggestions)
      : undefined,
    showQuickActions: controls.showQuickActions,
    showDecision: controls.showDecision && !!options.decision,
    decision: controls.showDecision ? options.decision : undefined,
    reasoning: controls.showDecision ? options.reasoning : undefined,
    followUp: options.followUp,
    source: options.source || 'local'
  };
}

/**
 * Forbidden phrases that should never appear in responses
 */
const FORBIDDEN_PHRASES = [
  'tutto tranquillo per oggi',
  'nessuna azione richiesta',
  'non ho capito cosa vuoi',
];

/**
 * Clean response of forbidden phrases
 */
export function cleanResponse(response: string): string {
  let cleaned = response;
  
  for (const phrase of FORBIDDEN_PHRASES) {
    const regex = new RegExp(phrase, 'gi');
    cleaned = cleaned.replace(regex, '');
  }
  
  return cleaned.trim();
}

/**
 * Get clarification question for UNKNOWN intent
 */
export function getClarificationQuestion(attemptCount: number): string | null {
  if (attemptCount >= 2) {
    // Stop responding after 2 UNKNOWN in a row
    return null;
  }
  
  const questions = [
    'Puoi darmi più dettagli su cosa vorresti fare?',
    'Non sono sicuro di aver capito. Vuoi creare qualcosa, vedere i tuoi dati, o stai cercando suggerimenti?',
  ];
  
  return questions[Math.min(attemptCount, questions.length - 1)];
}

/**
 * Generate informational response (no actions, no tasks)
 */
export function getInformationalResponse(message: string): string {
  // For now, acknowledge we can't help with general questions
  // In future, could integrate with external AI for knowledge
  return 'Questa è una domanda interessante, ma non ho accesso a informazioni generali. Posso aiutarti con i tuoi task, eventi, spese o darti suggerimenti per organizzarti!';
}
