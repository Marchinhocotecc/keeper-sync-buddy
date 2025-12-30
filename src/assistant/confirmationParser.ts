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
const CANCEL_PATTERNS = [
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
const SAFETY_WORDS = [
  // Cancel words
  'no', 'n', 'nope', 'annulla', 'stop', 'basta', 'niente',
  // Confirm words
  'sì', 'si', 'yes', 'y', 'ok', 'okay', 'perfetto', 'procedi', 'conferma', 'confermo', 'certo', 'fallo',
  // Vague words
  'va bene', 'lascia stare', 'lascia perdere', 'non fa niente',
];

// ========== DELETE COMMAND DETECTION ==========
// These phrases contain a delete action, so even with "perfetto" prefix they should be delete commands
const DELETE_COMMAND_PATTERNS = [
  /(?:elimina|cancella|rimuovi|togli)\s+(?:tutt[eio]?\s+)?(?:i\s+|le\s+|gli\s+)?(?:task|eventi?|spese?)/i,
  /(?:elimina|cancella|rimuovi|togli)l[aie]/i,
];

/**
 * Check if message is a pure confirmation/cancel word
 * Returns ConfirmationResult with type and bypass flag
 */
export function parseConfirmation(message: string): ConfirmationResult {
  const trimmed = message.trim().toLowerCase();
  
  // Check for negative feedback FIRST
  if (NEGATIVE_FEEDBACK_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'NEGATIVE_FEEDBACK', shouldBypass: true };
  }
  
  // Check if message contains a DELETE command - DON'T treat as confirm even if starts with "perfetto"
  if (DELETE_COMMAND_PATTERNS.some(p => p.test(trimmed))) {
    // This is a delete command, not a pure confirmation
    return { type: 'NONE', shouldBypass: false };
  }
  
  // Check cancel patterns
  if (CANCEL_PATTERNS.some(p => p.test(trimmed))) {
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
 * Get safe response for cancel
 */
export function getCancelResponse(): string {
  return '✅ Ok, annullato.';
}

/**
 * Get safe response for confirm without active intent
 */
export function getConfirmNoIntentResponse(): string {
  return '✅ Ok. Dimmi cosa vuoi fare (task, evento, spesa o elimina).';
}

/**
 * Get response for negative feedback
 */
export function getNegativeFeedbackResponse(): string {
  return '😔 Hai ragione, scusa. Dimmi cosa vuoi fare adesso.';
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
