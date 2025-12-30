/**
 * Confirmation Words Pre-Parser
 * 
 * GLOBAL PRE-PARSER applied BEFORE any intent classification.
 * Ensures confirmation words (no/sì/ok) NEVER create actions.
 * 
 * RULES:
 * - "no", "annulla", "stop" → CANCEL (clear intent, safe message)
 * - "sì", "ok", "va bene" → CONFIRM (only proceeds if active intent exists)
 */

export type ConfirmationType = 'CONFIRM' | 'CANCEL' | 'NONE';

export interface ConfirmationResult {
  type: ConfirmationType;
  shouldBypass: boolean; // If true, bypass normal intent parsing
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

/**
 * Check if message is a pure confirmation/cancel word
 * Returns ConfirmationResult with type and bypass flag
 */
export function parseConfirmation(message: string): ConfirmationResult {
  const trimmed = message.trim().toLowerCase();
  
  // Check cancel patterns
  if (CANCEL_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'CANCEL', shouldBypass: true };
  }
  
  // Check confirm patterns
  if (CONFIRM_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'CONFIRM', shouldBypass: true };
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
