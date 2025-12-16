/**
 * Conversation Intelligence - Context awareness, repetition guard, and mode management
 */

import type { ConversationMessage } from './types';

// Assistant modes
export type AssistantMode = 'analysis' | 'suggestion' | 'coaching';

// Session state for tracking conversation
export interface SessionState {
  mode: AssistantMode;
  lastResponse: string;
  lastIntent: string | null;
  responseCount: number;
  noDataResponseCount: number;
  suggestedCategories: Set<string>;
  userInsistenceLevel: number; // 0-3, increases with rephrasing
}

// In-memory session states (per user)
const sessionStates = new Map<string, SessionState>();

/**
 * Get or create session state for user
 */
export function getSessionState(userId: string): SessionState {
  if (!sessionStates.has(userId)) {
    sessionStates.set(userId, {
      mode: 'analysis',
      lastResponse: '',
      lastIntent: null,
      responseCount: 0,
      noDataResponseCount: 0,
      suggestedCategories: new Set(),
      userInsistenceLevel: 0
    });
  }
  return sessionStates.get(userId)!;
}

/**
 * Update session state after response
 */
export function updateSessionState(
  userId: string,
  updates: Partial<SessionState>
): void {
  const state = getSessionState(userId);
  Object.assign(state, updates);
  sessionStates.set(userId, state);
}

/**
 * Reset session state for user
 */
export function resetSessionState(userId: string): void {
  sessionStates.delete(userId);
}

/**
 * Detect if user is rephrasing a similar question
 */
export function detectRephrasing(
  currentMessage: string,
  history: ConversationMessage[]
): { isRephrasing: boolean; similarity: number } {
  if (history.length === 0) {
    return { isRephrasing: false, similarity: 0 };
  }

  const lastUserMessage = history
    .filter(m => m.role === 'user')
    .slice(-1)[0]?.content?.toLowerCase() || '';
  
  const currentLower = currentMessage.toLowerCase();
  
  // Check for similar keywords
  const lastWords = new Set(lastUserMessage.split(/\s+/).filter(w => w.length > 3));
  const currentWords = currentLower.split(/\s+/).filter(w => w.length > 3);
  
  const matchingWords = currentWords.filter(w => lastWords.has(w)).length;
  const similarity = lastWords.size > 0 
    ? matchingWords / Math.max(lastWords.size, currentWords.length) 
    : 0;

  // Similar intent patterns
  const similarPatterns = [
    [/cosa (dovrei|potrei) fare/i, /sugger|consig|aiut/i],
    [/da dove inizio/i, /cosa faccio/i],
    [/sono confuso/i, /non so cosa fare/i],
    [/ho poco tempo/i, /non ho tempo/i]
  ];

  let patternMatch = false;
  for (const [p1, p2] of similarPatterns) {
    if ((p1.test(lastUserMessage) && p2.test(currentLower)) ||
        (p2.test(lastUserMessage) && p1.test(currentLower)) ||
        (p1.test(lastUserMessage) && p1.test(currentLower))) {
      patternMatch = true;
      break;
    }
  }

  return { 
    isRephrasing: similarity > 0.5 || patternMatch, 
    similarity 
  };
}

/**
 * Determine assistant mode from message
 */
export function detectMode(message: string): AssistantMode {
  const lower = message.toLowerCase();
  
  // Coaching mode triggers
  if (/tu cosa (faresti|consiglieresti)|al mio posto|secondo te/i.test(lower)) {
    return 'coaching';
  }
  
  // Suggestion mode triggers
  if (/sugger|consiglia|cosa (potrei|dovrei)|aiutami|idee/i.test(lower)) {
    return 'suggestion';
  }
  
  // Default to analysis
  return 'analysis';
}

/**
 * Get diverse suggestions based on what was already suggested
 */
export function getDiverseSuggestions(
  userId: string,
  availableCategories: string[] = ['practical', 'wellbeing', 'planning', 'creative', 'social']
): string[] {
  const state = getSessionState(userId);
  
  // Filter out already suggested categories
  const unusedCategories = availableCategories.filter(
    c => !state.suggestedCategories.has(c)
  );
  
  // If all used, reset
  const categoriesToUse = unusedCategories.length > 0 
    ? unusedCategories 
    : availableCategories;

  // Suggestion templates by category
  const templates: Record<string, string[]> = {
    practical: [
      'Organizza la scrivania per 10 minuti',
      'Prepara la lista della spesa',
      'Controlla le email importanti',
      'Pianifica i pasti della settimana'
    ],
    wellbeing: [
      'Fai una passeggiata di 15 minuti',
      'Bevi un bicchiere d\'acqua',
      'Fai 5 minuti di stretching',
      'Prenditi una pausa dalla tecnologia'
    ],
    planning: [
      'Rivedi gli obiettivi della settimana',
      'Prepara l\'agenda per domani',
      'Identifica le 3 priorità del giorno',
      'Blocca il tempo per attività importanti'
    ],
    creative: [
      'Scrivi 3 cose per cui sei grato',
      'Dedica 15 minuti a un hobby',
      'Ascolta della musica che ti piace',
      'Leggi qualcosa di interessante'
    ],
    social: [
      'Scrivi a un amico che non senti da tempo',
      'Organizza una chiamata con qualcuno',
      'Pianifica un\'uscita per il weekend',
      'Condividi un pensiero positivo'
    ]
  };

  const suggestions: string[] = [];
  const usedIndices = new Map<string, Set<number>>();

  for (const category of categoriesToUse.slice(0, 3)) {
    const categoryTemplates = templates[category] || templates.practical;
    if (!usedIndices.has(category)) {
      usedIndices.set(category, new Set());
    }
    
    // Pick random unused suggestion from category
    const available = categoryTemplates.filter((_, i) => !usedIndices.get(category)!.has(i));
    if (available.length > 0) {
      const suggestion = available[Math.floor(Math.random() * available.length)];
      suggestions.push(suggestion);
      state.suggestedCategories.add(category);
    }
  }

  return suggestions;
}

/**
 * Check if response would be a repetition
 */
export function isRepetitiveResponse(
  userId: string,
  proposedResponse: string
): boolean {
  const state = getSessionState(userId);
  
  // Normalize responses for comparison
  const normalizeResponse = (r: string) => 
    r.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  
  const normalized = normalizeResponse(proposedResponse);
  const lastNormalized = normalizeResponse(state.lastResponse);
  
  // Check similarity
  if (normalized === lastNormalized) return true;
  
  // Check for key repetitive phrases
  const repetitivePhrases = [
    'nessun task in sospeso',
    'nessuna azione richiesta',
    'non hai task',
    'non ci sono task',
    'giornata libera'
  ];
  
  const hasRepetitivePhrase = repetitivePhrases.some(
    phrase => normalized.includes(phrase) && lastNormalized.includes(phrase)
  );
  
  return hasRepetitivePhrase && state.noDataResponseCount > 0;
}

/**
 * Generate alternative response when data is empty
 */
export function getNoDataAlternativeResponse(
  userId: string,
  context: { hasEvents: boolean; hasTasks: boolean; hasExpenses: boolean }
): { message: string; suggestions: string[] } {
  const state = getSessionState(userId);
  state.noDataResponseCount++;
  
  const suggestions = getDiverseSuggestions(userId);
  
  // Different responses based on how many times we've said "no data"
  const responses = [
    // First time - acknowledge and suggest
    {
      message: 'Hai un po\' di tempo libero! Ecco alcune idee per te:',
      showSuggestions: true
    },
    // Second time - change angle to coaching
    {
      message: 'Vedo che la giornata è tranquilla. Se fossi in te, ne approfitterei per:',
      showSuggestions: true
    },
    // Third time - ask a question
    {
      message: 'Sembra una giornata leggera. C\'è qualcosa di specifico che vorresti fare o pianificare?',
      showSuggestions: false
    },
    // Fourth+ - proactive suggestion
    {
      message: 'Giornata libera da impegni! È il momento perfetto per qualcosa di diverso.',
      showSuggestions: true
    }
  ];

  const responseIndex = Math.min(state.noDataResponseCount - 1, responses.length - 1);
  const response = responses[responseIndex];

  updateSessionState(userId, { noDataResponseCount: state.noDataResponseCount });

  return {
    message: response.showSuggestions 
      ? `${response.message}\n\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      : response.message,
    suggestions: response.showSuggestions ? [] : suggestions.slice(0, 3)
  };
}

/**
 * Format response based on current mode
 */
export function formatResponseByMode(
  mode: AssistantMode,
  content: { 
    analysis?: string; 
    suggestion?: string; 
    reasoning?: string;
  }
): string {
  switch (mode) {
    case 'coaching':
      return `Al tuo posto, io farei così: ${content.suggestion || content.analysis}\n\n${content.reasoning ? `Perché? ${content.reasoning}` : ''}`;
    
    case 'suggestion':
      return `Ti suggerisco: ${content.suggestion || content.analysis}${content.reasoning ? `\n\nMotivo: ${content.reasoning}` : ''}`;
    
    case 'analysis':
    default:
      return content.analysis || content.suggestion || '';
  }
}

/**
 * Track that a response was given
 */
export function trackResponse(
  userId: string,
  response: string,
  intent: string | null,
  hadData: boolean
): void {
  const state = getSessionState(userId);
  
  updateSessionState(userId, {
    lastResponse: response,
    lastIntent: intent,
    responseCount: state.responseCount + 1,
    noDataResponseCount: hadData ? 0 : state.noDataResponseCount,
    userInsistenceLevel: 0 // Reset insistence after response
  });
}

/**
 * Increase user insistence level (for rephrasing detection)
 */
export function increaseInsistence(userId: string): void {
  const state = getSessionState(userId);
  updateSessionState(userId, {
    userInsistenceLevel: Math.min(state.userInsistenceLevel + 1, 3)
  });
}
