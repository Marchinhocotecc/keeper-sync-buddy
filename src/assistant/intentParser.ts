/**
 * Intent Parser - Deterministic, rule-based + fuzzy matching
 * PHASE 1 of the Assistant Pipeline
 */

import { format, addDays, isValid } from 'date-fns';

export type AssistantIntent = 
  | 'CREATE_EVENT' | 'CREATE_TASK' | 'CREATE_EXPENSE'
  | 'QUERY_DAY' | 'QUERY_TASKS' | 'QUERY_EVENTS' | 'QUERY_EXPENSES' | 'QUERY_BUDGET'
  | 'ADVICE_CONTEXTUAL' | 'ADVICE_GENERAL' | 'SMALL_TALK' | 'UNKNOWN';

export interface ParsedIntent {
  intent: AssistantIntent;
  confidence: number;
  extractedData: ExtractedData;
  requiresClarification: boolean;
  clarificationQuestion?: string;
}

export interface ExtractedData {
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  amount?: number;
  category?: string;
  priority?: 'low' | 'medium' | 'high';
  timeRange?: 'today' | 'tomorrow' | 'week' | 'month';
  rawText: string;
}

// Also export for openrouterClient compatibility
export type AIIntent = AssistantIntent | 'create_event' | 'create_task' | 'create_expense' | 'create_note' | 'update_task' | 'delete_task' | 'query_tasks' | 'query_events' | 'query_expenses' | 'query_budget' | 'advice' | 'greeting' | 'unknown';

// Parse AI response from external AI (JSON format)
export function parseAIResponse(rawText: string): { success: boolean; response: any; error?: string } {
  try {
    // Try direct JSON parse
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { success: true, response: { intent: parsed.intent, payload: parsed.payload, message: parsed.message } };
    }
    // Fallback: treat as plain message
    return { success: true, response: { intent: 'unknown', payload: {}, message: rawText } };
  } catch {
    return { success: false, response: null, error: 'Failed to parse AI response' };
  }
}

// ============ MANDATORY EVENT KEYWORDS ============
// If message contains ANY of these words → intent MUST be CREATE_EVENT
const EVENT_KEYWORDS = [
  'riunione', 'evento', 'appuntamento', 'incontro', 'call', 'meeting',
  'conferenza', 'colloquio', 'visita', 'dentista', 'dottore', 'medico'
];

// Italian weekdays for date extraction
const WEEKDAYS: Record<string, number> = {
  'lunedì': 1, 'lunedi': 1,
  'martedì': 2, 'martedi': 2,
  'mercoledì': 3, 'mercoledi': 3,
  'giovedì': 4, 'giovedi': 4,
  'venerdì': 5, 'venerdi': 5,
  'sabato': 6,
  'domenica': 0
};

const CREATE_EVENT_PATTERNS = [
  /(?:lavoro|lavorare)\s+(?:domani|oggi|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)/i,
  /(?:dentista|dottore|medico|veterinario)\s+(?:domani|oggi|alle?)/i,
  /(?:domani|oggi).*(?:alle?\s*\d|ore\s*\d)/i,
  /(?:aggiungi|crea|programma|fissa|metti)\s+(?:un[ao]?\s+)?(?:evento|appuntamento|riunione|meeting|call|incontro)/i,
  /(?:alle?\s*\d{1,2}[:.]\d{0,2})/i,
];

const CREATE_TASK_PATTERNS = [
  /(?:aggiungi|crea|nuovo)\s+(?:un\s+)?task/i,
  /(?:devo|ricordami\s+di)\s+(?!.*(?:alle?\s*\d))/i,
  /(?:portare|comprare|chiamare|fare)\s+\w+/i,
];

const CREATE_EXPENSE_PATTERNS = [
  /(?:ho\s+speso|spesa\s+di|pagato)\s*€?\s*\d+/i,
  /(?:registra|aggiungi)\s+(?:una\s+)?spesa/i,
  /€\s*\d+/,
];

const QUERY_PATTERNS = {
  QUERY_DAY: [/(?:cosa\s+ho|com'è)\s+(?:oggi|domani)/i, /(?:giornata|programma)\s+(?:di\s+)?(?:oggi|domani)/i],
  QUERY_TASKS: [/(?:mostra|vedi|lista)\s+(?:i\s+)?task/i, /(?:i\s+miei\s+)?task/i],
  QUERY_EVENTS: [/(?:mostra|vedi)\s+(?:gli\s+)?eventi/i, /calendario/i],
  QUERY_EXPENSES: [/(?:mostra|vedi)\s+(?:le\s+)?spese/i, /quanto\s+ho\s+speso/i],
  QUERY_BUDGET: [/(?:come\s+va|stato)\s+(?:il\s+)?budget/i, /quanto\s+mi\s+resta/i],
};

const ADVICE_CONTEXTUAL_PATTERNS = [/(?:cosa\s+(?:potrei|dovrei|mi\s+consigli)\s+fare)/i, /(?:suggerisci|consiglia)/i];
const ADVICE_GENERAL_PATTERNS = [/(?:cos['']?è|perch[eé]|spiegami)/i, /(?:di\s+che\s+colore)/i];
const SMALL_TALK_PATTERNS = [/^(?:ciao|salve|buongiorno|grazie|come\s+stai)/i];

export function parseIntent(message: string): ParsedIntent {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();
  const extractedData = extractData(normalized);
  
  // Small talk first (only very short messages)
  if (SMALL_TALK_PATTERNS.some(p => p.test(lower)) && normalized.length < 30) {
    return { intent: 'SMALL_TALK', confidence: 0.95, extractedData, requiresClarification: false };
  }
  
  // ============ MANDATORY: CHECK EVENT KEYWORDS FIRST ============
  // If message contains event keywords, FORCE CREATE_EVENT intent
  const hasEventKeyword = EVENT_KEYWORDS.some(keyword => lower.includes(keyword));
  
  if (hasEventKeyword) {
    // Calculate confidence based on available data
    let conf = 0.6; // Base confidence for keyword match
    if (extractedData.title) conf += 0.15;
    if (extractedData.date) conf += 0.15;
    if (extractedData.startTime) conf += 0.1;
    
    const requiresClarification = !extractedData.startTime;
    const question = !extractedData.startTime ? 'A che ora?' : undefined;
    
    return { 
      intent: 'CREATE_EVENT', 
      confidence: Math.min(conf, 1), 
      extractedData, 
      requiresClarification, 
      clarificationQuestion: question 
    };
  }
  
  // Check pattern-based event detection
  if (CREATE_EVENT_PATTERNS.some(p => p.test(lower)) || (extractedData.date && extractedData.startTime)) {
    const conf = (extractedData.title ? 0.3 : 0) + (extractedData.date ? 0.3 : 0) + (extractedData.startTime ? 0.3 : 0) + 0.1;
    return { 
      intent: 'CREATE_EVENT', 
      confidence: Math.min(conf, 1), 
      extractedData, 
      requiresClarification: conf < 0.8, 
      clarificationQuestion: !extractedData.startTime ? 'A che ora?' : (!extractedData.title ? 'Come si chiama l\'evento?' : undefined) 
    };
  }
  
  if (CREATE_EXPENSE_PATTERNS.some(p => p.test(lower)) || extractedData.amount) {
    return { intent: 'CREATE_EXPENSE', confidence: extractedData.amount ? 0.9 : 0.7, extractedData, requiresClarification: !extractedData.amount, clarificationQuestion: 'Qual è l\'importo?' };
  }
  
  if (CREATE_TASK_PATTERNS.some(p => p.test(lower))) {
    return { intent: 'CREATE_TASK', confidence: extractedData.title ? 0.9 : 0.7, extractedData, requiresClarification: !extractedData.title, clarificationQuestion: 'Cosa vuoi aggiungere?' };
  }
  
  for (const [intent, patterns] of Object.entries(QUERY_PATTERNS)) {
    if (patterns.some(p => p.test(lower))) {
      return { intent: intent as AssistantIntent, confidence: 0.9, extractedData, requiresClarification: false };
    }
  }
  
  if (ADVICE_CONTEXTUAL_PATTERNS.some(p => p.test(lower))) {
    return { intent: 'ADVICE_CONTEXTUAL', confidence: 0.85, extractedData, requiresClarification: false };
  }
  
  if (ADVICE_GENERAL_PATTERNS.some(p => p.test(lower))) {
    return { intent: 'ADVICE_GENERAL', confidence: 0.8, extractedData, requiresClarification: false };
  }
  
  // UNKNOWN - but NO generic clarification question
  return { intent: 'UNKNOWN', confidence: 0.3, extractedData, requiresClarification: false };
}

function extractData(message: string): ExtractedData {
  const data: ExtractedData = { rawText: message };
  const lower = message.toLowerCase();
  const today = new Date();
  
  // Today/tomorrow
  if (/\boggi\b/.test(lower)) { 
    data.date = format(today, 'yyyy-MM-dd'); 
    data.timeRange = 'today'; 
  } else if (/\bdomani\b/.test(lower)) { 
    data.date = format(addDays(today, 1), 'yyyy-MM-dd'); 
    data.timeRange = 'tomorrow'; 
  } else {
    // Check for weekday names
    for (const [weekday, dayNum] of Object.entries(WEEKDAYS)) {
      if (lower.includes(weekday)) {
        const currentDay = today.getDay();
        let daysToAdd = dayNum - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7; // Next week if today or past
        data.date = format(addDays(today, daysToAdd), 'yyyy-MM-dd');
        break;
      }
    }
  }
  
  // Time extraction
  const timeMatch = message.match(/alle?\s*(\d{1,2})(?:[:.:](\d{2}))?/i);
  if (timeMatch) data.startTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}`;
  
  // Amount extraction
  const amountMatch = message.match(/€\s*(\d+(?:[.,]\d{2})?)|(\d+(?:[.,]\d{2})?)\s*(?:euro|€)/i);
  if (amountMatch) data.amount = parseFloat((amountMatch[1] || amountMatch[2]).replace(',', '.'));
  
  // Title extraction - extract the event name from keywords
  let title = message;
  
  // Remove common prefixes
  title = title.replace(/^(?:aggiungi|crea|registra|ho|devo|fissa|metti)\s*/i, '');
  
  // Remove articles before event types
  title = title.replace(/\b(?:un[ao]?|il|la|l[''])\s*/gi, '');
  
  // Remove time/date references
  title = title.replace(/\b(?:alle?\s*\d+(?:[:.]\d+)?|oggi|domani|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\b/gi, '');
  
  title = title.trim();
  if (title.length > 2) data.title = title;
  
  return data;
}
