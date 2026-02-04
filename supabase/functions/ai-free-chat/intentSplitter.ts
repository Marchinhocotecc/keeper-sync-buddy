/**
 * AYVO Cognitive Core - Intent Splitter Module
 * Semantic analysis engine that understands and extracts structured information
 * WITHOUT executing actions - pure understanding layer
 */

import { ParsedIntent, IntentType, MultiIntentResult, ExtractedEntities } from "./types.ts";
import { parseDateTime, parseExpense, normalizeTitle, isForbiddenTitle, normalizeUserText } from "./parser.ts";

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

function detectLanguage(text: string): string {
  const lower = text.toLowerCase();
  
  // Italian indicators
  if (/\b(devo|fare|comprare|ricordami|domani|oggi|alle|evento|spesa|ciao|grazie)\b/.test(lower)) {
    return 'it';
  }
  // Spanish indicators
  if (/\b(tengo que|hacer|comprar|recuérdame|mañana|hoy|evento|gasto|hola|gracias)\b/.test(lower)) {
    return 'es';
  }
  // Default to English
  return 'en';
}

// ============================================================================
// ENTITY EXTRACTION
// ============================================================================

function extractPeople(text: string): string[] {
  const people: string[] = [];
  
  // Pattern: "con [Name]", "chiamare [Name]", "a [Name]"
  const patterns = [
    /\bcon\s+([A-Z][a-zàèéìòù]+)/g,
    /\bchiama(?:re)?\s+([A-Z][a-zàèéìòù]+)/g,
    /\ba\s+([A-Z][a-zàèéìòù]+)(?:\s|$)/g,
    /\bcall\s+([A-Z][a-z]+)/gi,
    /\bwith\s+([A-Z][a-z]+)/gi,
    /\bmeet(?:ing)?\s+(?:with\s+)?([A-Z][a-z]+)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1];
      if (name && name.length > 1 && !people.includes(name)) {
        people.push(name);
      }
    }
  }
  
  return people;
}

function extractLocations(text: string): string[] {
  const locations: string[] = [];
  
  // Pattern: "a/in/presso [Location]"
  const patterns = [
    /\b(?:a|in|presso|at|near)\s+([A-Z][a-zàèéìòù]+(?:\s+[A-Z][a-zàèéìòù]+)?)/g,
  ];
  
  // Common location words to exclude
  const excludeWords = ['che', 'cosa', 'ora', 'alle', 'luca', 'marco', 'anna'];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const loc = match[1];
      if (loc && !excludeWords.includes(loc.toLowerCase()) && !locations.includes(loc)) {
        locations.push(loc);
      }
    }
  }
  
  return locations;
}

function extractAllEntities(text: string): ExtractedEntities {
  const { date, time } = parseDateTime(text);
  const { amount } = parseExpense(text);
  
  return {
    people: extractPeople(text),
    locations: extractLocations(text),
    dates: date ? [date] : [],
    times: time ? [time] : [],
    amounts: amount ? [{ value: amount, currency: 'EUR' }] : [],
  };
}

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
  // English patterns
  /\s+and\s+(?=(?:remind|need to|buy|pay|call|do))/gi,
  /,\s*(?=(?:remind|need to|buy|pay|call))/gi,
];

const TASK_TRIGGERS = [
  /^ricordami\s+(?:di\s+)?/i,
  /^devo\s+/i,
  /^compra(?:re)?\s+/i,
  /^paga(?:re)?\s+/i,
  /^chiama(?:re)?\s+/i,
  /^fai?\s+/i,
  /^prendi(?:ere)?\s+/i,
  // English
  /^remind\s+(?:me\s+)?(?:to\s+)?/i,
  /^(?:i\s+)?need\s+to\s+/i,
  /^buy\s+/i,
  /^pay\s+/i,
  /^call\s+/i,
];

const EVENT_TRIGGERS = [
  /\b(evento|appuntamento|meeting|riunione|cena|pranzo|colazione)\b/i,
  /\balle\s+\d+/i,
  /\bore\s+\d+/i,
  /\b(event|appointment|dinner|lunch|breakfast)\b/i,
  /\bat\s+\d+/i,
];

const EXPENSE_PATTERNS = [
  /€\s*[\d,]+/,
  /[\d,]+\s*€/,
  /[\d,]+\s*euro\b/i,
  /\$\s*[\d.]+/,
  /[\d.]+\s*(?:dollars?|usd)\b/i,
];

const NOTE_TRIGGERS = [
  /^nota(?:\s+che)?[:.]?\s*/i,
  /^appunto[:.]?\s*/i,
  /^note[:.]?\s*/i,
  /^annota(?:re)?[:.]?\s*/i,
];

const GOAL_TRIGGERS = [
  /^obiettivo[:.]?\s*/i,
  /^goal[:.]?\s*/i,
  /^voglio\s+(?:riuscire\s+a\s+)?/i,
  /^i\s+want\s+to\s+/i,
];

const QUESTION_TRIGGERS = [
  /^(?:cosa|come|quando|dove|perché|chi|quale)\s+/i,
  /^(?:what|how|when|where|why|who|which)\s+/i,
  /\?$/,
];

// ============================================================================
// INTENT DETECTION
// ============================================================================

function detectIntentType(segment: string): { type: IntentType; confidence: number } {
  const lower = segment.toLowerCase().trim();
  const normalized = normalizeUserText(segment);
  
  // Check for question (high priority)
  if (QUESTION_TRIGGERS.some(p => p.test(lower))) {
    return { type: 'QUESTION', confidence: 0.9 };
  }
  
  // Check for note
  if (NOTE_TRIGGERS.some(p => p.test(lower))) {
    return { type: 'NOTE', confidence: 0.85 };
  }
  
  // Check for goal
  if (GOAL_TRIGGERS.some(p => p.test(lower))) {
    return { type: 'GOAL', confidence: 0.8 };
  }
  
  // Check for expense (most specific pattern)
  if (EXPENSE_PATTERNS.some(p => p.test(normalized))) {
    const { amount } = parseExpense(segment);
    if (amount && amount > 0) {
      return { type: 'EXPENSE', confidence: 0.95 };
    }
  }
  
  // Check for event triggers
  if (EVENT_TRIGGERS.some(p => p.test(lower))) {
    return { type: 'EVENT', confidence: 0.85 };
  }
  
  // Check for task/reminder triggers
  if (TASK_TRIGGERS.some(p => p.test(lower))) {
    // "ricordami" = REMINDER, others = TASK
    if (/^ricordami|^remind/i.test(lower)) {
      return { type: 'REMINDER', confidence: 0.9 };
    }
    return { type: 'TASK', confidence: 0.85 };
  }
  
  // Check for natural task patterns (infinitive verbs)
  if (/^(comprare|pagare|chiamare|fare|prendere|portare)\s+/i.test(lower)) {
    return { type: 'TASK', confidence: 0.7 };
  }
  
  // Default to task for action verbs ending in -are/-ere/-ire
  if (/^[a-zàèéìòù]+(?:are|ere|ire)\s+/i.test(lower)) {
    return { type: 'TASK', confidence: 0.5 };
  }
  
  return { type: 'UNKNOWN', confidence: 0.3 };
}

function extractIntentData(segment: string, typeResult: { type: IntentType; confidence: number }): ParsedIntent {
  const { date, time } = parseDateTime(segment);
  const people = extractPeople(segment);
  const locations = extractLocations(segment);
  
  const intent: ParsedIntent = {
    type: typeResult.type,
    raw: segment.trim(),
    confidence: typeResult.confidence,
  };
  
  // Add extracted entities
  if (people.length > 0) intent.people = people;
  if (locations.length > 0) intent.location = locations[0];
  
  if (typeResult.type === 'EXPENSE') {
    const { amount, category } = parseExpense(segment);
    intent.amount = amount ?? undefined;
    intent.category = category ?? undefined;
    intent.confidence = amount ? 0.95 : 0.5;
    return intent;
  }
  
  if (typeResult.type === 'QUESTION' || typeResult.type === 'REFLECTION') {
    intent.title = segment.trim();
    return intent;
  }
  
  // Extract title for TASK/REMINDER/EVENT/NOTE/GOAL
  let title = segment;
  
  // Remove triggers
  [...TASK_TRIGGERS, ...NOTE_TRIGGERS, ...GOAL_TRIGGERS].forEach(p => {
    title = title.replace(p, '');
  });
  
  // Remove temporal references
  title = title.replace(/\b(oggi|domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/gi, '');
  title = title.replace(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '');
  title = title.replace(/\b(alle|ore|at)\s*\d{1,2}(:\d{2})?\b/gi, '');
  title = title.replace(/\b\d{1,2}:\d{2}\b/g, '');
  
  title = normalizeTitle(title);
  
  if (title && !isForbiddenTitle(title)) {
    intent.title = title;
    // Boost confidence if we extracted a good title
    intent.confidence = Math.min(intent.confidence + 0.1, 1.0);
  } else {
    // Lower confidence if no title extracted
    intent.confidence = Math.max(intent.confidence - 0.2, 0.3);
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
  const language = detectLanguage(trimmed);
  const globalEntities = extractAllEntities(trimmed);
  const uncertainties: string[] = [];
  
  console.log(`[CognitiveCore] Analyzing: "${trimmed.substring(0, 80)}" (lang=${language})`);
  
  // Quick check: does this message look like it has multiple intents?
  if (!hasMultipleIntentSignals(trimmed)) {
    console.log(`[CognitiveCore] Single intent detected`);
    
    // Still extract the single intent for consistency
    const typeResult = detectIntentType(trimmed);
    const singleIntent = extractIntentData(trimmed, typeResult);
    
    return {
      success: true,
      intents: (singleIntent.title || singleIntent.amount) ? [singleIntent] : [],
      originalMessage: trimmed,
      splitMethod: 'single',
      language,
      entities: globalEntities,
      uncertainties,
      understanding: `Single ${typeResult.type.toLowerCase()} detected with ${Math.round(typeResult.confidence * 100)}% confidence`,
    };
  }
  
  // Try pattern-based splitting
  const segments = splitByPatterns(trimmed);
  
  if (segments.length <= 1) {
    console.log(`[CognitiveCore] Could not split, falling back to single`);
    const typeResult = detectIntentType(trimmed);
    const singleIntent = extractIntentData(trimmed, typeResult);
    
    uncertainties.push("Message appeared to have multiple intents but could not be split");
    
    return {
      success: true,
      intents: (singleIntent.title || singleIntent.amount) ? [singleIntent] : [],
      originalMessage: trimmed,
      splitMethod: 'single',
      language,
      entities: globalEntities,
      uncertainties,
    };
  }
  
  console.log(`[CognitiveCore] Split into ${segments.length} segments: ${JSON.stringify(segments)}`);
  
  // Parse each segment
  const intents: ParsedIntent[] = [];
  
  for (const segment of segments) {
    const typeResult = detectIntentType(segment);
    
    if (typeResult.type === 'UNKNOWN') {
      // Try to infer from context - default to task
      const inferredResult = { type: 'TASK' as IntentType, confidence: 0.4 };
      const intent = extractIntentData(segment, inferredResult);
      if (intent.title || intent.amount) {
        intents.push(intent);
        uncertainties.push(`Inferred "${segment.substring(0, 20)}..." as task (low confidence)`);
      }
    } else {
      const intent = extractIntentData(segment, typeResult);
      if (intent.title || intent.amount) {
        intents.push(intent);
      }
    }
  }
  
  if (intents.length === 0) {
    console.log(`[CognitiveCore] No valid intents extracted, falling back`);
    return {
      success: false,
      intents: [],
      originalMessage: trimmed,
      splitMethod: 'single',
      language,
      entities: globalEntities,
      uncertainties: ["Could not extract any valid intents from segments"],
    };
  }
  
  const avgConfidence = intents.reduce((sum, i) => sum + i.confidence, 0) / intents.length;
  console.log(`[CognitiveCore] Parsed ${intents.length} intents (avg confidence: ${Math.round(avgConfidence * 100)}%)`);
  
  return {
    success: true,
    intents,
    originalMessage: trimmed,
    splitMethod: 'pattern',
    language,
    entities: globalEntities,
    uncertainties,
    understanding: `Extracted ${intents.length} items: ${intents.map(i => i.type.toLowerCase()).join(', ')}`,
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
