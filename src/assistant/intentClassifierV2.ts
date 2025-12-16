/**
 * Intent Classifier V2 - Deterministic classification BEFORE any response
 * Categories: ACTION, SUGGESTION, INFORMATIONAL, UNKNOWN
 */

export type IntentCategory = 'ACTION' | 'SUGGESTION' | 'INFORMATIONAL' | 'UNKNOWN';

export interface ClassifiedIntent {
  category: IntentCategory;
  confidence: number;
  subtype?: string;
  requiresData?: string[]; // Fields needed for action
}

// ACTION patterns - User wants to create/modify/schedule
const ACTION_PATTERNS = [
  { pattern: /(?:aggiungi|crea|nuovo|inserisci|registra|programma)\s+(?:un\s+)?(?:task|evento|appuntamento|spesa|nota)/i, subtype: 'create' },
  { pattern: /(?:ricordami|devo)\s+(?:di\s+)?(?:fare|comprare|chiamare)/i, subtype: 'create_task' },
  { pattern: /(?:segna|completa|fatto|finito)\s+(?:il\s+)?task/i, subtype: 'update_task' },
  { pattern: /(?:modifica|sposta|cancella|elimina)\s+(?:l[''])?(?:evento|appuntamento|task)/i, subtype: 'update' },
  { pattern: /(?:imposta|cambia|modifica)\s+(?:il\s+)?budget/i, subtype: 'update_budget' },
  { pattern: /ho speso\s+€?\d/i, subtype: 'create_expense' },
];

// SUGGESTION patterns - User asks what to do
const SUGGESTION_PATTERNS = [
  /cosa\s+(?:potrei|dovrei|posso)\s+fare/i,
  /cosa\s+mi\s+(?:consigli|suggerisci)/i,
  /(?:suggeriscimi|consigliami|dammi)\s+(?:qualcosa|un'?idea|suggerimenti)/i,
  /(?:aiutami|help)\s+(?:a\s+)?(?:decidere|organizzare|pianificare)/i,
  /(?:tu\s+)?cosa\s+faresti/i,
  /da\s+dove\s+(?:inizio|comincio)/i,
  /(?:non\s+so|sono\s+indeciso)\s+(?:cosa|su\s+cosa)/i,
  /hai\s+(?:suggerimenti|consigli|idee)/i,
];

// INFORMATIONAL patterns - General knowledge/curiosity
const INFORMATIONAL_PATTERNS = [
  /(?:che\s+)?(?:cos['']?è|cosa\s+significa)\s+/i,
  /(?:perch[eé]|come\s+mai)\s+/i,
  /(?:spiegami|dimmi)\s+(?:cos['']?è|perch[eé]|come)/i,
  /(?:chi|dove|quando)\s+(?:è|era|sarà)/i,
  /(?:di\s+che\s+colore|quanto\s+è|che\s+ore\s+sono)/i,
  /(?:qual\s+è|quali\s+sono)\s+(?:il|la|i|le)\s+/i,
  /(?:come\s+funziona|come\s+si\s+fa)\s+/i,
  /\?\s*$/,  // Ends with question mark (weak signal)
];

// Query patterns - Read data (handled as ACTION but read-only)
const QUERY_PATTERNS = [
  { pattern: /(?:mostra|vedi|elenca|lista)\s+(?:i\s+miei\s+)?(?:task|eventi|spese|calendario|budget)/i, subtype: 'query' },
  { pattern: /(?:quanti|quanto)\s+(?:task|eventi|spese|ho\s+speso)/i, subtype: 'query' },
  { pattern: /cosa\s+ho\s+(?:in\s+programma|oggi|domani|da\s+fare)/i, subtype: 'query' },
  { pattern: /(?:i\s+miei|le\s+mie)\s+(?:task|spese|eventi)/i, subtype: 'query' },
];

// Greeting/thanks patterns (handle locally, not as UNKNOWN)
const SOCIAL_PATTERNS = [
  { pattern: /^(?:ciao|salve|buongiorno|buonasera|hey|hi|hello)/i, subtype: 'greeting' },
  { pattern: /^(?:grazie|thanks|ok|perfetto|ottimo)/i, subtype: 'thanks' },
  { pattern: /^(?:arrivederci|a\s+dopo|bye|addio)/i, subtype: 'farewell' },
  { pattern: /(?:come\s+stai|tutto\s+bene|che\s+fai)/i, subtype: 'small_talk' },
  { pattern: /(?:aiuto|help|cosa\s+(?:puoi|sai)\s+fare)/i, subtype: 'help' },
];

/**
 * Classify intent BEFORE any response generation
 * This is the SINGLE source of truth for intent
 */
export function classifyIntentV2(message: string): ClassifiedIntent {
  const normalizedMessage = message.toLowerCase().trim();
  
  // 1. Check ACTION patterns first (highest priority)
  for (const { pattern, subtype } of ACTION_PATTERNS) {
    if (pattern.test(normalizedMessage)) {
      return {
        category: 'ACTION',
        confidence: 0.9,
        subtype
      };
    }
  }
  
  // 2. Check QUERY patterns (read-only actions)
  for (const { pattern, subtype } of QUERY_PATTERNS) {
    if (pattern.test(normalizedMessage)) {
      return {
        category: 'ACTION',
        confidence: 0.85,
        subtype
      };
    }
  }
  
  // 3. Check SOCIAL patterns (greetings, thanks)
  for (const { pattern, subtype } of SOCIAL_PATTERNS) {
    if (pattern.test(normalizedMessage)) {
      return {
        category: 'ACTION', // Treat as actionable (we respond)
        confidence: 0.95,
        subtype
      };
    }
  }
  
  // 4. Check SUGGESTION patterns
  for (const pattern of SUGGESTION_PATTERNS) {
    if (pattern.test(normalizedMessage)) {
      return {
        category: 'SUGGESTION',
        confidence: 0.85
      };
    }
  }
  
  // 5. Check INFORMATIONAL patterns
  let infoScore = 0;
  for (const pattern of INFORMATIONAL_PATTERNS) {
    if (pattern.test(normalizedMessage)) {
      infoScore++;
    }
  }
  
  if (infoScore >= 1) {
    // Check it's NOT about the app's data
    const appDataKeywords = /task|evento|spesa|budget|calendario|appuntamento/i;
    if (!appDataKeywords.test(normalizedMessage)) {
      return {
        category: 'INFORMATIONAL',
        confidence: 0.7 + (infoScore * 0.1)
      };
    }
  }
  
  // 6. Default to UNKNOWN
  return {
    category: 'UNKNOWN',
    confidence: 0.3
  };
}

/**
 * Loop guard - tracks response hashes to prevent repetition
 */
const responseHashes = new Map<string, string[]>();
const MAX_HASH_HISTORY = 5;

/**
 * Generate a simple hash for response comparison
 */
function hashResponse(response: string): string {
  // Normalize and create a simple hash
  const normalized = response
    .toLowerCase()
    .replace(/[^\\w\\s]/g, '')
    .replace(/\\s+/g, ' ')
    .trim()
    .substring(0, 100); // Only compare first 100 chars
  
  // Simple string hash
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Check if response would be a repetition (loop guard)
 */
export function wouldBeRepetition(userId: string, proposedResponse: string): boolean {
  const userHashes = responseHashes.get(userId) || [];
  const newHash = hashResponse(proposedResponse);
  
  return userHashes.includes(newHash);
}

/**
 * Record a response hash
 */
export function recordResponseHash(userId: string, response: string): void {
  const userHashes = responseHashes.get(userId) || [];
  const newHash = hashResponse(response);
  
  // Add to front, keep only last N
  userHashes.unshift(newHash);
  if (userHashes.length > MAX_HASH_HISTORY) {
    userHashes.pop();
  }
  
  responseHashes.set(userId, userHashes);
}

/**
 * Clear response hashes for user (on conversation reset)
 */
export function clearResponseHashes(userId: string): void {
  responseHashes.delete(userId);
}

/**
 * Track consecutive UNKNOWN intents
 */
const unknownCounts = new Map<string, number>();

export function incrementUnknownCount(userId: string): number {
  const current = unknownCounts.get(userId) || 0;
  const newCount = current + 1;
  unknownCounts.set(userId, newCount);
  return newCount;
}

export function resetUnknownCount(userId: string): void {
  unknownCounts.set(userId, 0);
}

export function getUnknownCount(userId: string): number {
  return unknownCounts.get(userId) || 0;
}
