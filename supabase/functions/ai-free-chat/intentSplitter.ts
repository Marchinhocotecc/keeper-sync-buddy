/**
 * Intent Splitter Module - Multi-Intent Extraction Engine
 * Splits a single user message into multiple independent intents
 */

import { ParsedIntent, IntentType, MultiIntentResult } from "./types.ts";
import { parseDateTime, parseExpense, normalizeTitle, isForbiddenTitle, normalizeUserText } from "./parser.ts";

// ============================================================================
// PATTERN-BASED SPLITTERS
// ============================================================================

const CONJUNCTION_PATTERNS = [
  /\s+e\s+(?=(?:ricordami|devo|compra|paga|chiamare|fare|comprare|pagare))/gi,
  /\s+e\s+(?=spesa|€|\d+\s*euro)/gi,
  /\s+poi\s+/gi,
  /\s+inoltre\s+/gi,
  /\s+anche\s+/gi,
  /,\s*(?=(?:ricordami|devo|compra|paga|chiamare|fare|comprare|pagare))/gi,
];

const TASK_TRIGGERS = [
  /^ricordami\s+(?:di\s+)?/i,
  /^devo\s+/i,
  /^compra(?:re)?\s+/i,
  /^paga(?:re)?\s+/i,
  /^chiama(?:re)?\s+/i,
  /^fai?\s+/i,
  /^prendi(?:ere)?\s+/i,
];

const EVENT_TRIGGERS = [
  /\b(evento|appuntamento|meeting|riunione|cena|pranzo|colazione)\b/i,
  /\balle\s+\d+/i,
  /\bore\s+\d+/i,
];

const EXPENSE_PATTERNS = [
  /€\s*[\d,]+/,
  /[\d,]+\s*€/,
  /[\d,]+\s*euro\b/i,
  /^[\d,]+\s+[a-zA-ZàèéìòùÀÈÉÌÒÙ]+$/i,
  /^[a-zA-ZàèéìòùÀÈÉÌÒÙ]+\s+[\d,]+$/i,
];

// ============================================================================
// INTENT DETECTION
// ============================================================================

function detectIntentType(segment: string): IntentType {
  const lower = segment.toLowerCase().trim();
  const normalized = normalizeUserText(segment);
  
  // Check for expense first (most specific)
  if (EXPENSE_PATTERNS.some(p => p.test(normalized))) {
    const { amount } = parseExpense(segment);
    if (amount && amount > 0) {
      return 'EXPENSE';
    }
  }
  
  // Check for event triggers
  if (EVENT_TRIGGERS.some(p => p.test(lower))) {
    return 'EVENT';
  }
  
  // Check for task/reminder triggers
  if (TASK_TRIGGERS.some(p => p.test(lower))) {
    return 'TASK';
  }
  
  // Check for natural task patterns
  if (/^(comprare|pagare|chiamare|fare|prendere|portare)\s+/i.test(lower)) {
    return 'TASK';
  }
  
  // Default to task for action verbs
  if (/^[a-zàèéìòù]+are\s+/i.test(lower)) {
    return 'TASK';
  }
  
  return 'UNKNOWN';
}

function extractIntentData(segment: string, type: IntentType): ParsedIntent {
  const { date, time } = parseDateTime(segment);
  
  const intent: ParsedIntent = {
    type,
    raw: segment.trim(),
  };
  
  if (type === 'EXPENSE') {
    const { amount, category } = parseExpense(segment);
    intent.amount = amount ?? undefined;
    intent.category = category ?? undefined;
    return intent;
  }
  
  // Extract title for TASK/REMINDER/EVENT
  let title = segment;
  
  // Remove triggers
  TASK_TRIGGERS.forEach(p => {
    title = title.replace(p, '');
  });
  
  // Remove temporal references
  title = title.replace(/\b(oggi|domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/gi, '');
  title = title.replace(/\b(alle|ore)\s*\d{1,2}(:\d{2})?\b/gi, '');
  title = title.replace(/\b\d{1,2}:\d{2}\b/g, '');
  
  title = normalizeTitle(title);
  
  if (title && !isForbiddenTitle(title)) {
    intent.title = title;
  }
  
  if (date) intent.date = date;
  if (time) intent.time = time;
  
  return intent;
}

// ============================================================================
// SPLITTING LOGIC
// ============================================================================

function splitByPatterns(message: string): string[] {
  let segments = [message];
  
  // Apply each conjunction pattern
  for (const pattern of CONJUNCTION_PATTERNS) {
    const newSegments: string[] = [];
    for (const seg of segments) {
      const parts = seg.split(pattern).map(s => s.trim()).filter(s => s.length > 2);
      newSegments.push(...parts);
    }
    segments = newSegments;
  }
  
  // If no split occurred, return original
  if (segments.length === 1 && segments[0] === message) {
    return [message];
  }
  
  return segments.filter(s => s.length > 2);
}

function hasMultipleIntentSignals(message: string): boolean {
  const lower = message.toLowerCase();
  
  // Check for explicit conjunctions with action words
  const actionConjunctions = [
    /\be\s+(ricordami|devo|compra|paga|chiama)/i,
    /\be\s+(spesa|€|\d+\s*euro)/i,
    /,\s*(ricordami|devo|compra|paga|chiama)/i,
    /\s+poi\s+(ricordami|devo|compra|paga|chiama)/i,
  ];
  
  if (actionConjunctions.some(p => p.test(lower))) {
    return true;
  }
  
  // Count distinct action verbs
  const actionVerbs = [
    /\bricordami\b/i,
    /\bdevo\b/i,
    /\bcompra(?:re)?\b/i,
    /\bpaga(?:re)?\b/i,
    /\bchiama(?:re)?\b/i,
  ];
  
  const verbCount = actionVerbs.filter(v => v.test(lower)).length;
  if (verbCount >= 2) {
    return true;
  }
  
  // Check for mixed intent signals (task + expense)
  const hasTaskSignal = /\b(ricordami|devo|compra|paga|chiama)\b/i.test(lower);
  const hasExpenseSignal = /€|\d+\s*euro|\d+\s+[a-z]+$/i.test(lower);
  
  if (hasTaskSignal && hasExpenseSignal) {
    // Only if they seem separate
    if (/\be\s+/i.test(lower) || /,\s+/i.test(lower)) {
      return true;
    }
  }
  
  return false;
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function splitIntents(message: string): MultiIntentResult {
  const trimmed = message.trim();
  
  console.log(`[IntentSplitter] Analyzing: "${trimmed.substring(0, 80)}"`);
  
  // Quick check: does this message look like it has multiple intents?
  if (!hasMultipleIntentSignals(trimmed)) {
    console.log(`[IntentSplitter] Single intent detected`);
    return {
      success: true,
      intents: [],
      originalMessage: trimmed,
      splitMethod: 'single',
    };
  }
  
  // Try pattern-based splitting
  const segments = splitByPatterns(trimmed);
  
  if (segments.length <= 1) {
    console.log(`[IntentSplitter] Could not split, falling back to single`);
    return {
      success: true,
      intents: [],
      originalMessage: trimmed,
      splitMethod: 'single',
    };
  }
  
  console.log(`[IntentSplitter] Split into ${segments.length} segments: ${JSON.stringify(segments)}`);
  
  // Parse each segment
  const intents: ParsedIntent[] = [];
  
  for (const segment of segments) {
    const type = detectIntentType(segment);
    
    if (type === 'UNKNOWN') {
      // Try to infer from context
      const inferredType: IntentType = 'TASK'; // Default to task
      const intent = extractIntentData(segment, inferredType);
      if (intent.title || intent.amount) {
        intents.push(intent);
      }
    } else {
      const intent = extractIntentData(segment, type);
      if (intent.title || intent.amount) {
        intents.push(intent);
      }
    }
  }
  
  if (intents.length === 0) {
    console.log(`[IntentSplitter] No valid intents extracted, falling back`);
    return {
      success: false,
      intents: [],
      originalMessage: trimmed,
      splitMethod: 'single',
    };
  }
  
  console.log(`[IntentSplitter] Parsed ${intents.length} intents`);
  
  return {
    success: true,
    intents,
    originalMessage: trimmed,
    splitMethod: 'pattern',
  };
}

// ============================================================================
// INTENT TO ACTION CONVERTER
// ============================================================================

export function convertIntentToRouterResult(intent: ParsedIntent): {
  actionType: string;
  payload: any;
  confirmMessage: string;
} {
  switch (intent.type) {
    case 'TASK':
    case 'REMINDER':
      return {
        actionType: 'CREATE_TASK',
        payload: {
          title: intent.title,
          due_date: intent.date,
        },
        confirmMessage: intent.date 
          ? `Creo task "${intent.title}" per ${intent.date}?`
          : `Creo task "${intent.title}"?`,
      };
    
    case 'EVENT':
      return {
        actionType: 'CREATE_EVENT',
        payload: {
          title: intent.title,
          start_at: intent.date && intent.time 
            ? `${intent.date}T${intent.time}:00`
            : undefined,
        },
        confirmMessage: intent.date && intent.time
          ? `Creo evento "${intent.title}" per ${intent.date} alle ${intent.time}?`
          : `Creo evento "${intent.title}"?`,
      };
    
    case 'EXPENSE':
      return {
        actionType: 'RECORD_EXPENSE',
        payload: {
          amount: intent.amount,
          category: intent.category || 'altro',
        },
        confirmMessage: `Registro €${intent.amount?.toFixed(2)} in ${intent.category || 'altro'}?`,
      };
    
    default:
      return {
        actionType: 'NONE',
        payload: {},
        confirmMessage: '',
      };
  }
}
