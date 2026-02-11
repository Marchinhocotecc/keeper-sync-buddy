/**
 * LAYER 0 — INPUT NORMALIZATION (deterministic)
 * 
 * RESPONSIBILITY: Clean and prepare input. NO interpretation.
 * - Detect greetings (skip LLM)
 * - Normalize comma decimals
 * - Extract temporal/amount hints for context
 * - Detect UI actions
 * - Detect cancel/confirm
 */

// ============================================================================
// TYPES
// ============================================================================

export interface NormalizedInput {
  normalizedText: string;
  isGreeting: boolean;
  isCancel: boolean;
  isConfirm: boolean;
  isUIAction: boolean;
  uiAction: string | null;
  cancelContinuation: string | null;
  timeHints: string[];
  amountHints: number[];
}

// ============================================================================
// PATTERNS
// ============================================================================

const GREETING_PATTERNS = [
  /^ciao\s*[!.]?$/i,
  /^salve\s*[!.]?$/i,
  /^buongiorno\s*[!.]?$/i,
  /^buonasera\s*[!.]?$/i,
  /^hey\s*[!.]?$/i,
  /^ehi\s*[!.]?$/i,
  /^hi\s*[!.]?$/i,
  /^hello\s*[!.]?$/i,
  /^hola\s*[!.]?$/i,
  /^come va\s*[?!.]?$/i,
  /^come stai\s*[?!.]?$/i,
  /^tutto bene\s*[?!.]?$/i,
  /^grazie\s*[!.]?$/i,
  /^thanks?\s*[!.]?$/i,
];

const CANCEL_STANDALONE = [
  "no", "annulla", "lascia stare", "stop", "niente", "cambia idea",
  "non importa", "lascia perdere", "basta", "chiudi"
];

const CANCEL_PREFIX_PATTERNS = [
  /^no\s*,\s*(.+)$/i,
  /^no\s+(?!task|evento|spesa|grazie)(.{3,})$/i,
  /^annulla\s*,?\s*(.+)$/i,
  /^lascia\s*(?:stare|perdere)\s*,?\s*(.+)$/i,
  /^niente\s*,?\s*(.+)$/i,
  /^basta\s*,?\s*(.+)$/i,
  /^stop\s*,?\s*(.+)$/i,
];

const CONFIRM_WORDS = [
  "sì", "si", "yes", "ok", "confermo", "conferma", "va bene",
  "procedi", "fatto", "perfetto", "certo", "dai"
];

const TEMPORAL_HINTS_PATTERNS = [
  /\b(oggi|domani|dopodomani|stasera|stamattina)\b/gi,
  /\b(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/gi,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
  /\b(tomorrow|today|tonight)\b/gi,
];

const AMOUNT_PATTERNS = [
  /€\s*(\d+(?:[.,]\d{1,2})?)/g,
  /(\d+(?:[.,]\d{1,2})?)\s*€/g,
  /(\d+(?:[.,]\d{1,2})?)\s*euro/gi,
];

const UI_ACTION_PREFIX = '__UI_ACTION__:';

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export function normalizeInput(rawMessage: string): NormalizedInput {
  const trimmed = rawMessage.trim();
  
  // Normalize comma decimals in text: "5,50" → "5.50"
  const normalizedText = trimmed.replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');
  
  // UI Action detection
  const isUIAction = trimmed.startsWith(UI_ACTION_PREFIX);
  const uiAction = isUIAction ? trimmed.slice(UI_ACTION_PREFIX.length) : null;
  
  // Greeting detection
  const isGreeting = !isUIAction && GREETING_PATTERNS.some(p => p.test(trimmed));
  
  // Cancel detection (with continuation)
  let isCancel = false;
  let cancelContinuation: string | null = null;
  
  if (!isUIAction) {
    const lower = trimmed.toLowerCase();
    
    // Don't cancel if contains delete words
    if (!/\b(elimina|rimuovi|cancella)\b/i.test(lower)) {
      if (CANCEL_STANDALONE.some(p => lower === p)) {
        isCancel = true;
      } else {
        for (const pattern of CANCEL_PREFIX_PATTERNS) {
          const match = trimmed.match(pattern);
          if (match && match[1] && match[1].trim().length > 2) {
            isCancel = true;
            cancelContinuation = match[1].trim();
            break;
          }
        }
      }
    }
  }
  
  // Confirm detection
  const isConfirm = !isUIAction && !isCancel && CONFIRM_WORDS.includes(trimmed.toLowerCase());
  
  // Extract temporal hints
  const timeHints: string[] = [];
  for (const pattern of TEMPORAL_HINTS_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(normalizedText)) !== null) {
      timeHints.push(match[1].toLowerCase());
    }
  }
  
  // Extract amount hints
  const amountHints: number[] = [];
  for (const pattern of AMOUNT_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(normalizedText)) !== null) {
      const val = parseFloat(match[1].replace(',', '.'));
      if (val > 0) amountHints.push(val);
    }
  }
  
  return {
    normalizedText,
    isGreeting,
    isCancel,
    isConfirm,
    isUIAction,
    uiAction,
    cancelContinuation,
    timeHints,
    amountHints,
  };
}
