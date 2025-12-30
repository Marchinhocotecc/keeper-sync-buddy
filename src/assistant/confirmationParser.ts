/**
 * Confirmation Words Pre-Parser
 * 
 * GLOBAL PRE-PARSER applied BEFORE any intent classification.
 * Ensures confirmation words (no/sì/ok) NEVER create actions.
 * 
 * RULES:
 * - "no", "annulla", "stop" → CANCEL (clear intent, safe message)
 * - "sì", "ok", "va bene" → CONFIRM (only proceeds if active intent exists)
 * 
 * CRITICAL: Also detects QUICK ACTIONS that should never be free text:
 * - "Elimina uno", "Mostra task", "Completa uno" → QUICK_ACTION
 */

export type ConfirmationType = 'CONFIRM' | 'CANCEL' | 'QUICK_ACTION' | 'NEGATIVE_FEEDBACK' | 'NONE';

export interface ConfirmationResult {
  type: ConfirmationType;
  shouldBypass: boolean; // If true, bypass normal intent parsing
  quickAction?: string; // The quick action type if detected
}

// ========== CANCEL PATTERNS ==========
// Pure cancel - standalone words
const CANCEL_PATTERNS_STANDALONE = [
  /^no$/i,
  /^n$/i,
  /^nope$/i,
  /^annulla$/i,
  /^stop$/i,
  /^lascia\s*(?:stare|perdere)$/i,
  /^basta$/i,
  /^niente$/i,
  /^non\s*(?:fa\s*)?niente$/i,
];

// Cancel prefix - "no, consigliami" should cancel pending AND process the rest
// CRITICAL: These MUST be detected to clear pending intent and process remainder
const CANCEL_PREFIX_PATTERNS = [
  /^no\s*,\s*/i,       // "no, consigliami..."
  /^no\s+(?!task|evento|spesa|grazie)/i,  // "no consigliami..." (no comma, but not "no task")
  /^annulla\s*,?\s*/i, // "annulla, fammi vedere..."
  /^lascia\s*(?:stare|perdere)\s*,?\s*/i, // "lascia stare, dimmi..."
  /^niente\s*,?\s*/i,  // "niente, consigliami..."
  /^basta\s*,?\s*/i,   // "basta, dimmi..."
  /^stop\s*,?\s*/i,    // "stop, consigliami..."
];

// ========== CONFIRM PATTERNS ==========
// IMPORTANT: These are PURE confirm words, NOT phrases with actions
const CONFIRM_PATTERNS = [
  /^s[iì]$/i,
  /^si$/i,
  /^yes$/i,
  /^y$/i,
  /^ok$/i,
  /^okay$/i,
  /^va\s*bene$/i,
  /^perfetto$/i,
  /^procedi$/i,
  /^conferm[ao]$/i,
  /^fallo$/i,
  /^certo$/i,
];

// ========== QUICK ACTIONS (buttons that should never be free text) ==========
const QUICK_ACTION_PATTERNS: Array<{ pattern: RegExp; action: string }> = [
  // BULK ACTIONS - must come FIRST (higher priority)
  { pattern: /^(?:elimina|cancella|rimuovi)\s*tutt[ieoa]$/i, action: 'DELETE_ALL' },
  { pattern: /^(?:elimina|cancella|rimuovi)\s*tutt[ieoa]\s*(?:i\s*)?(?:task|le\s*task)?$/i, action: 'DELETE_ALL_TASKS' },
  { pattern: /^(?:elimina|cancella|rimuovi)\s*tutt[ieoa]\s*(?:gli\s*)?eventi?$/i, action: 'DELETE_ALL_EVENTS' },
  { pattern: /^(?:elimina|cancella|rimuovi)\s*tutt[ieoa]\s*(?:le\s*)?spese?$/i, action: 'DELETE_ALL_EXPENSES' },
  { pattern: /^(?:completa|spunta|chiudi)\s*tutt[ieoa]$/i, action: 'COMPLETE_ALL' },
  { pattern: /^(?:completa|spunta|chiudi)\s*tutt[ieoa]\s*(?:i\s*)?(?:task|le\s*task)?$/i, action: 'COMPLETE_ALL_TASKS' },
  // SINGULAR ACTIONS
  { pattern: /^elimina\s*(?:uno|una|il\s*primo|la\s*prima)?$/i, action: 'DELETE_ONE' },
  { pattern: /^cancella\s*(?:uno|una|il\s*primo|la\s*prima)?$/i, action: 'DELETE_ONE' },
  { pattern: /^rimuovi\s*(?:uno|una|il\s*primo|la\s*prima)?$/i, action: 'DELETE_ONE' },
  { pattern: /^mostra\s*(?:i\s*)?task$/i, action: 'SHOW_TASKS' },
  { pattern: /^mostra\s*(?:gli\s*)?eventi$/i, action: 'SHOW_EVENTS' },
  { pattern: /^mostra\s*(?:le\s*)?spese$/i, action: 'SHOW_EXPENSES' },
  { pattern: /^completa\s*(?:uno|una|il\s*primo|la\s*prima)?$/i, action: 'COMPLETE_ONE' },
  { pattern: /^nuovo\s*task$/i, action: 'CREATE_TASK' },
  { pattern: /^nuovo\s*evento$/i, action: 'CREATE_EVENT' },
  { pattern: /^aggiungi\s*task$/i, action: 'CREATE_TASK' },
  { pattern: /^aggiungi\s*evento$/i, action: 'CREATE_EVENT' },
  // "eliminali" with context
  { pattern: /^eliminali$/i, action: 'DELETE_THESE' },
  { pattern: /^eliminali\s*tutt[ieoa]?$/i, action: 'DELETE_ALL' },
  { pattern: /^cancellali$/i, action: 'DELETE_THESE' },
  { pattern: /^cancellali\s*tutt[ieoa]?$/i, action: 'DELETE_ALL' },
];

// ========== NEGATIVE FEEDBACK PATTERNS ==========
const NEGATIVE_FEEDBACK_PATTERNS = [
  /(?:hai\s+sbagliato|stai\s+sbagliando)/i,
  /(?:mi\s+stai\s+)?prendendo\s+in\s+giro/i,
  /non\s+così/i,
  /non\s+era\s+questo/i,
  /non\s+volevo\s+(?:questo|quello)/i,
  /sbagliato/i,
  /errore/i,
];

// ========== SAFETY WORDS ==========
// These words should NEVER become CREATE_GENERIC, CREATE_TASK, CREATE_EVENT, RECORD_EXPENSE
// UNIFIED LIST - used by both confirmationParser and intentParser
export const SAFETY_WORDS = [
  // Cancel words
  'no', 'n', 'nope', 'annulla', 'stop', 'basta', 'niente',
  // Confirm words
  'sì', 'si', 'yes', 'y', 'ok', 'okay', 'perfetto', 'procedi', 'conferma', 'confermo', 'certo', 'fallo',
  // Vague words
  'va bene', 'lascia stare', 'lascia perdere', 'non fa niente',
];

// Cancel safety words - these should return "Ok, annullato"
export const CANCEL_SAFETY_WORDS = ['no', 'n', 'nope', 'annulla', 'stop', 'basta', 'niente', 'lascia stare', 'lascia perdere'];

// Confirm safety words - these should return "Ok. Dimmi cosa vuoi fare"
export const CONFIRM_SAFETY_WORDS = ['sì', 'si', 'yes', 'y', 'ok', 'okay', 'perfetto', 'procedi', 'conferma', 'confermo', 'certo', 'fallo', 'va bene'];

// ========== DELETE COMMAND DETECTION ==========
// These phrases contain a delete action, so even with "perfetto" prefix they should be delete commands
const DELETE_COMMAND_PATTERNS = [
  /(?:elimina|cancella|rimuovi|togli)\s+(?:tutt[eio]?\s+)?(?:i\s+|le\s+|gli\s+)?(?:task|eventi?|spese?)/i,
  /(?:elimina|cancella|rimuovi|togli)l[aie]/i,
];

// ========== BULK DELETE DETECTION (HIGH PRIORITY) ==========
// These patterns MUST be detected before asking "task/eventi/spese?"
const BULK_DELETE_WITH_TARGET_PATTERNS = [
  { pattern: /(?:elimina|cancella|rimuovi)\s*tutt[eio]?\s*(?:i\s*|le\s*)?task/i, type: 'tasks' as const },
  { pattern: /(?:elimina|cancella|rimuovi)\s*tutt[eio]?\s*(?:gli\s*)?eventi?/i, type: 'events' as const },
  { pattern: /(?:elimina|cancella|rimuovi)\s*tutt[eio]?\s*(?:le\s*)?spese?/i, type: 'expenses' as const },
  { pattern: /(?:completa|spunta|chiudi)\s*tutt[eio]?\s*(?:i\s*|le\s*)?task/i, type: 'complete_tasks' as const },
  // "tutte le task" patterns (without explicit action verb, implies query or last action)
  { pattern: /^tutt[eio]?\s*(?:i\s*|le\s*)?task$/i, type: 'tasks_context' as const },
];

/**
 * Check if message is a bulk delete with explicit target
 * Returns the target type if detected, null otherwise
 */
export function detectBulkDeleteTarget(message: string): { type: 'tasks' | 'events' | 'expenses' | 'complete_tasks' | 'tasks_context'; action: 'delete' | 'complete' | 'query' } | null {
  const trimmed = message.trim().toLowerCase();
  
  for (const { pattern, type } of BULK_DELETE_WITH_TARGET_PATTERNS) {
    if (pattern.test(trimmed)) {
      if (type === 'complete_tasks') {
        return { type: 'tasks', action: 'complete' };
      }
      if (type === 'tasks_context') {
        return { type: 'tasks', action: 'query' };
      }
      return { type: type as 'tasks' | 'events' | 'expenses', action: 'delete' };
    }
  }
  
  return null;
}

export type ConfirmationWithContinuation = ConfirmationResult & {
  // If cancel had continuation (e.g., "no, consigliami..."), this is the rest
  continuation?: string;
};

/**
 * Check if message is a pure confirmation/cancel word
 * Returns ConfirmationResult with type and bypass flag
 * 
 * CRITICAL: For "no, consigliami cosa fare" we return CANCEL with continuation
 */
export function parseConfirmation(message: string): ConfirmationWithContinuation {
  const trimmed = message.trim().toLowerCase();
  const original = message.trim();
  
  // Check for negative feedback FIRST
  if (NEGATIVE_FEEDBACK_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'NEGATIVE_FEEDBACK', shouldBypass: true };
  }
  
  // Check if message contains a DELETE command - DON'T treat as confirm even if starts with "perfetto"
  if (DELETE_COMMAND_PATTERNS.some(p => p.test(trimmed))) {
    // This is a delete command, not a pure confirmation
    return { type: 'NONE', shouldBypass: false };
  }
  
  // Check for CANCEL PREFIX (e.g., "no, consigliami...")
  // This is CRITICAL: must clear pending intent AND process the rest
  for (const pattern of CANCEL_PREFIX_PATTERNS) {
    if (pattern.test(trimmed)) {
      const continuation = original.replace(pattern, '').trim();
      if (continuation.length > 2) {
        // There's meaningful content after "no, " - return cancel with continuation
        console.log('[ConfirmationParser] CANCEL with continuation detected:', continuation);
        return { type: 'CANCEL', shouldBypass: true, continuation };
      }
      // Short continuation (e.g., "no, ok") - still CANCEL but no continuation
      console.log('[ConfirmationParser] CANCEL prefix detected, no meaningful continuation');
      return { type: 'CANCEL', shouldBypass: true };
    }
  }
  
  // Check standalone cancel patterns
  if (CANCEL_PATTERNS_STANDALONE.some(p => p.test(trimmed))) {
    console.log('[ConfirmationParser] Standalone CANCEL detected');
    return { type: 'CANCEL', shouldBypass: true };
  }
  
  // Check quick action patterns BEFORE confirm patterns
  for (const { pattern, action } of QUICK_ACTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { type: 'QUICK_ACTION', shouldBypass: true, quickAction: action };
    }
  }
  
  // Check confirm patterns (PURE confirms only, not phrases with actions)
  if (CONFIRM_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'CONFIRM', shouldBypass: true };
  }
  
  // Check for confirm word at START followed by action - DON'T bypass, let the action be processed
  // e.g., "perfetto, elimina tutte le task" should process the delete command
  const startsWithConfirm = /^(?:perfetto|ok|okay|sì|si|va bene),?\s+/i.test(trimmed);
  if (startsWithConfirm) {
    // Extract the action part and check if it's a meaningful command
    const actionPart = trimmed.replace(/^(?:perfetto|ok|okay|sì|si|va bene),?\s+/i, '');
    if (actionPart.length > 2) {
      // There's a real action after the confirm word - don't bypass
      return { type: 'NONE', shouldBypass: false };
    }
  }
  
  return { type: 'NONE', shouldBypass: false };
}

/**
 * Check if message is a safety word that should never create actions
 * Used as additional guard in intent parser
 */
export function isSafetyWord(message: string): boolean {
  const trimmed = message.trim().toLowerCase();
  return SAFETY_WORDS.some(w => trimmed === w || trimmed === w.replace(' ', ''));
}

/**
 * Check if message is a CANCEL safety word
 */
export function isCancelSafetyWord(message: string): boolean {
  const trimmed = message.trim().toLowerCase();
  return CANCEL_SAFETY_WORDS.some(w => trimmed === w || trimmed === w.replace(' ', ''));
}

/**
 * Check if message is a CONFIRM safety word (but no active intent)
 */
export function isConfirmSafetyWord(message: string): boolean {
  const trimmed = message.trim().toLowerCase();
  return CONFIRM_SAFETY_WORDS.some(w => trimmed === w || trimmed === w.replace(' ', ''));
}

/**
 * Get safe response for cancel
 */
// Import from centralized constants
import { 
  CANCEL_RESPONSE, 
  CONFIRM_NO_INTENT_RESPONSE, 
  NEGATIVE_FEEDBACK_RESPONSE 
} from './constants';

/**
 * Get safe response for cancel
 */
export function getCancelResponse(): string {
  return CANCEL_RESPONSE;
}

/**
 * Get safe response for confirm without active intent
 */
export function getConfirmNoIntentResponse(): string {
  return CONFIRM_NO_INTENT_RESPONSE;
}

/**
 * Get response for negative feedback
 */
export function getNegativeFeedbackResponse(): string {
  return NEGATIVE_FEEDBACK_RESPONSE;
}

/**
 * Check if message starts with or is a cancel pattern
 * SINGLE SOURCE OF TRUTH for cancel detection
 * Used by: aiEngine.ts, statefulHandler.ts
 */
export function isCancelPattern(message: string): boolean {
  const trimmed = message.trim().toLowerCase();
  
  // Check standalone cancel patterns
  if (CANCEL_PATTERNS_STANDALONE.some(p => p.test(trimmed))) {
    return true;
  }
  
  // Check cancel prefix patterns (e.g., "no, consigliami...")
  if (CANCEL_PREFIX_PATTERNS.some(p => p.test(trimmed))) {
    return true;
  }
  
  return false;
}

/**
 * Normalize a title before creating task/event
 * Removes common verbs and cleans up the text
 */
export function normalizeTitle(text: string): { title: string; valid: boolean } {
  // Remove common action verbs at the start
  const cleaned = text
    .replace(/^(?:crea|segna|fai|aggiungi|inserisci|metti|nuovo|nuova)\s+/i, '')
    .replace(/^(?:un|una|il|la|lo)\s+/i, '')
    .trim();
  
  // Capitalize first letter
  const title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  
  // Check if valid (at least 3 characters of meaningful content)
  const valid = title.length >= 3 && !isSafetyWord(title);
  
  return { title, valid };
}
