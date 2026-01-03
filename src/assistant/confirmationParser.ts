/**
 * Confirmation Words Pre-Parser + Input Kind Classifier
 * 
 * GLOBAL PRE-PARSER applied BEFORE any intent classification.
 * Ensures confirmation words (no/sì/ok) NEVER create actions.
 * 
 * NPC MODE CLASSIFICATION:
 * - CONTROL: Short ack/interj/emoji/single words with no operative content
 * - COMMAND: Operative verbs (crea, elimina, mostra) with fuzzy typo tolerance
 * - DATA: Numbers, times, dates, date+time combinations
 * - CHAT: Everything else (free text)
 * 
 * RULES:
 * - "no", "annulla", "stop" → CANCEL (clear intent, safe message)
 * - "sì", "ok", "va bene" → CONFIRM (only proceeds if active intent exists)
 * 
 * CRITICAL: Also detects QUICK ACTIONS that should never be free text:
 * - "Elimina uno", "Mostra task", "Completa uno" → QUICK_ACTION
 * 
 * UI ACTIONS:
 * - Messages starting with __UI_ACTION__: are structured payloads from UI buttons
 * - These BYPASS all NLP parsing and map directly to actions
 * - Format: __UI_ACTION__:<ACTION_TYPE>
 */

// ========== INPUT KIND CLASSIFIER (NPC MODE) ==========

export type InputKind = 'CONTROL' | 'COMMAND' | 'DATA' | 'CHAT';
export type ControlIntent = 'AFFIRM' | 'NEGATE' | 'CANCEL';

export interface InputKindResult {
  inputKind: InputKind;
  controlIntent?: ControlIntent;
  confidence: number;
  normalized: string;
}

/**
 * Simple Levenshtein distance for typo tolerance
 * Returns edit distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Check if word fuzzy-matches a target with typo tolerance
 * Tolerance: 1 error for words <= 5 chars, 2 errors for longer
 */
function fuzzyMatch(word: string, target: string): boolean {
  if (word === target) return true;
  if (word.startsWith(target.slice(0, 3))) return true; // Prefix match
  
  const maxDistance = target.length <= 5 ? 1 : 2;
  return levenshteinDistance(word, target) <= maxDistance;
}

// Command verb roots for fuzzy matching
const COMMAND_VERBS = [
  'crea', 'aggiungi', 'segna', 'metti', 'inserisci', 'ricordami',
  'elimina', 'cancella', 'rimuovi', 'togli',
  'mostra', 'vedi', 'lista', 'elenco',
  'completa', 'spunta', 'chiudi', 'fatto',
  'nuovo', 'nuova', 'registra'
];

// Patterns for DATA classification
const TIME_PATTERN = /\b\d{1,2}[:.]\d{2}\b/;
const HOUR_ONLY_PATTERN = /^(?:alle?\s*)?\d{1,2}$/i;
const DATE_FORMAT_PATTERN = /\b\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?\b/;
const ITALIAN_WEEKDAYS = /\b(?:luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\b/i;
const ITALIAN_RELATIVE = /\b(?:oggi|domani|dopodomani|ieri)\b/i;
const PURE_NUMBER_PATTERN = /^\d+(?:[.,]\d+)?$/;

/**
 * Classify input kind - NPC MODE deterministic classifier
 * 
 * NO hardcoded "if message === 'ok'" - uses general heuristics:
 * - CONTROL: very short, no verbs/objects, interj/ack/emoji
 * - COMMAND: operative patterns with fuzzy verb matching
 * - DATA: numbers, times, dates
 * - CHAT: everything else
 */
export function classifyInputKind(message: string): InputKindResult {
  const original = message.trim();
  const normalized = original.toLowerCase()
    .replace(/[ìí]/g, 'i')
    .replace(/[àá]/g, 'a')
    .replace(/[èé]/g, 'e')
    .replace(/[òó]/g, 'o')
    .replace(/[ùú]/g, 'u');
  
  const tokens = normalized.split(/\s+/).filter(t => t.length > 0);
  const wordCount = tokens.length;
  
  // ========== DATA DETECTION (HIGHEST PRIORITY) ==========
  // If message contains clear date/time patterns, it's DATA
  const hasTime = TIME_PATTERN.test(original);
  const hasWeekday = ITALIAN_WEEKDAYS.test(normalized);
  const hasRelativeDay = ITALIAN_RELATIVE.test(normalized);
  const hasDateFormat = DATE_FORMAT_PATTERN.test(original);
  const isPureNumber = PURE_NUMBER_PATTERN.test(normalized);
  const isHourOnly = HOUR_ONLY_PATTERN.test(normalized);
  
  // Pure number (could be amount, hour, or day)
  if (isPureNumber) {
    const num = parseFloat(normalized.replace(',', '.'));
    // Numbers 1-31 could be days, 0-23 could be hours
    // We classify as DATA and let context decide meaning
    return {
      inputKind: 'DATA',
      confidence: 0.8,
      normalized
    };
  }
  
  // Time pattern
  if (hasTime) {
    return {
      inputKind: 'DATA',
      confidence: 0.95,
      normalized
    };
  }
  
  // Weekday or relative day
  if (hasWeekday || hasRelativeDay) {
    // Could also have time: "venerdì alle 8:30"
    return {
      inputKind: 'DATA',
      confidence: 0.9,
      normalized
    };
  }
  
  // Date format
  if (hasDateFormat) {
    return {
      inputKind: 'DATA',
      confidence: 0.9,
      normalized
    };
  }
  
  // Hour only ("alle 8", "20")
  if (isHourOnly) {
    return {
      inputKind: 'DATA',
      confidence: 0.8,
      normalized
    };
  }
  
  // ========== CONTROL DETECTION ==========
  // Heuristics: very short, no operative verbs, common ack/interj patterns
  
  // Emoji-only or very short ack patterns
  const emojiOnly = /^[\p{Emoji}\s]+$/u.test(original);
  if (emojiOnly && original.length <= 4) {
    return {
      inputKind: 'CONTROL',
      controlIntent: 'AFFIRM',
      confidence: 0.9,
      normalized
    };
  }
  
  // Single word checks
  if (wordCount === 1) {
    // Affirmation patterns
    if (/^(?:si|ok|okay|y|yes|va|bene|perfetto|certo|esatto|giusto|vero|top|grande|ottimo|figo|bello|bravo|dai|fallo|fai|conferma|confermo|procedi)$/.test(normalized)) {
      return {
        inputKind: 'CONTROL',
        controlIntent: 'AFFIRM',
        confidence: 0.95,
        normalized
      };
    }
    
    // Negation patterns
    if (/^(?:no|n|nope|nah|mai|niente|basta|stop)$/.test(normalized)) {
      return {
        inputKind: 'CONTROL',
        controlIntent: 'NEGATE',
        confidence: 0.95,
        normalized
      };
    }
    
    // Cancel patterns
    if (/^(?:annulla|cancella|lascia|dimentica)$/.test(normalized)) {
      return {
        inputKind: 'CONTROL',
        controlIntent: 'CANCEL',
        confidence: 0.95,
        normalized
      };
    }
  }
  
  // Short phrases that are still CONTROL
  if (wordCount <= 3) {
    // "va bene", "ok perfetto", "lascia stare", "lascia perdere"
    if (/^(?:va\s*bene|ok\s*(?:perfetto|grazie|va\s*bene)?|lascia\s*(?:stare|perdere)|non\s*(?:fa\s*)?niente|no\s*grazie)$/.test(normalized)) {
      const isNeg = /^(?:lascia|no|non)/.test(normalized);
      return {
        inputKind: 'CONTROL',
        controlIntent: isNeg ? 'NEGATE' : 'AFFIRM',
        confidence: 0.9,
        normalized
      };
    }
  }
  
  // ========== COMMAND DETECTION ==========
  // Look for operative verbs with fuzzy matching
  const firstWord = tokens[0] || '';
  
  for (const verb of COMMAND_VERBS) {
    if (fuzzyMatch(firstWord, verb)) {
      return {
        inputKind: 'COMMAND',
        confidence: firstWord === verb ? 0.95 : 0.8,
        normalized
      };
    }
  }
  
  // Also check for commands anywhere in short messages
  if (wordCount <= 4) {
    for (const token of tokens) {
      for (const verb of COMMAND_VERBS) {
        if (fuzzyMatch(token, verb)) {
          return {
            inputKind: 'COMMAND',
            confidence: 0.75,
            normalized
          };
        }
      }
    }
  }
  
  // ========== DEFAULT: CHAT ==========
  return {
    inputKind: 'CHAT',
    confidence: 0.6,
    normalized
  };
}

// ========== ORIGINAL CONFIRMATION TYPES ==========

export type ConfirmationType = 'CONFIRM' | 'CANCEL' | 'QUICK_ACTION' | 'UI_ACTION' | 'NEGATIVE_FEEDBACK' | 'NONE';

export interface ConfirmationResult {
  type: ConfirmationType;
  shouldBypass: boolean; // If true, bypass normal intent parsing
  quickAction?: string; // The quick action type if detected
}

/**
 * UI_ACTION_PREFIX: Identifies structured payloads from UI buttons.
 * These bypass all NLP parsing and execute directly.
 */
export const UI_ACTION_PREFIX = '__UI_ACTION__:';

/**
 * Parse UI action payload into action type
 * Returns the action type if valid, null otherwise
 * 
 * VALID UI ACTIONS:
 * - SHOW_TASKS, SHOW_EVENTS, SHOW_EXPENSES: Query and display items
 * - ADD_TASK, CREATE_EVENT, ADD_EXPENSE: Start creation flows (set active intent)
 * - DELETE_ALL_*: Bulk delete operations
 * - COMPLETE_ALL_*: Bulk complete operations
 */
export function parseUIAction(message: string): string | null {
  if (!message.startsWith(UI_ACTION_PREFIX)) {
    return null;
  }
  const action = message.slice(UI_ACTION_PREFIX.length).trim().toUpperCase();
  // Valid UI actions - extended with conversation gate actions
  const validActions = [
    // Query/display actions
    'SHOW_TASKS', 'SHOW_EVENTS', 'SHOW_EXPENSES',
    // Creation flow starters (from Conversation Gate)
    'ADD_TASK', 'CREATE_EVENT', 'ADD_EXPENSE',
    // Legacy creation actions
    'CREATE_TASK',
    // Bulk operations
    'DELETE_ALL', 'DELETE_ALL_TASKS', 'DELETE_ALL_EVENTS', 'DELETE_ALL_EXPENSES',
    'COMPLETE_ALL_TASKS', 'COMPLETE_ALL',
  ];
  return validActions.includes(action) ? action : null;
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
  
  // ========== UI ACTION CHECK (HIGHEST PRIORITY) ==========
  // UI actions from buttons bypass ALL NLP parsing
  const uiAction = parseUIAction(message);
  if (uiAction) {
    console.log('[ConfirmationParser] UI_ACTION detected:', uiAction);
    return { type: 'UI_ACTION', shouldBypass: true, quickAction: uiAction };
  }
  
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
 * Removes common verbs, filler words, and cleans up the text
 * 
 * NPC MODE: Uses general patterns, NOT hardcoded phrases
 */
export function normalizeTitle(text: string): { title: string; valid: boolean } {
  // Remove common action verbs at the start (general pattern)
  // Pattern: verb + optional article
  const cleaned = text
    .replace(/^(?:crea(?:re)?|segna(?:re)?|fa(?:i|re)?|aggiungi(?:ere)?|inserisci(?:re)?|metti(?:ere)?|nuovo|nuova|ricordami\s*(?:di)?)\s*/i, '')
    .replace(/^(?:un|una|il|la|lo|gli|le|i)\s+/i, '')
    .trim();
  
  // Capitalize first letter
  const title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  
  // Check if valid: at least 3 characters AND not a safety/control word
  const normalized = title.toLowerCase();
  
  // Use inputKind to check if it's a CONTROL word
  const inputCheck = classifyInputKind(title);
  const isControl = inputCheck.inputKind === 'CONTROL';
  
  const valid = title.length >= 3 && !isControl && !isSafetyWord(title);
  
  return { title, valid };
}
