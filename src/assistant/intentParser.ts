/**
 * Intent Parser - Deterministic, action-driven classification
 * PHASE 1 of the Assistant Pipeline
 * 
 * CLASSIFICATION PRIORITY (MANDATORY ORDER):
 * 1. EXPENSE - contains number + not a question
 * 2. ACTION - not a question, not an expense → CREATE_GENERIC
 * 3. SMALL_TALK - only if clearly conversational, no numbers, no implicit actions
 * 
 * This is NOT a conversational chatbot. It's an action-driven system.
 */

import { format, addDays } from 'date-fns';

export type AssistantIntent = 
  | 'CREATE_EVENT' | 'CREATE_TASK' | 'CREATE_EXPENSE' | 'CREATE_GENERIC'
  | 'QUERY_DAY' | 'QUERY_TASKS' | 'QUERY_EVENTS' | 'QUERY_EXPENSES' | 'QUERY_BUDGET'
  | 'ADVICE_CONTEXTUAL' | 'ADVICE_GENERAL' | 'SMALL_TALK' | 'RECORD_EXPENSE';

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
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { success: true, response: { intent: parsed.intent, payload: parsed.payload, message: parsed.message } };
    }
    return { success: true, response: { intent: 'unknown', payload: {}, message: rawText } };
  } catch {
    return { success: false, response: null, error: 'Failed to parse AI response' };
  }
}

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

// ============ QUERY PATTERNS ============
const QUERY_PATTERNS = {
  QUERY_DAY: [/(?:cosa\s+ho|com'è)\s+(?:oggi|domani)/i, /(?:giornata|programma)\s+(?:di\s+)?(?:oggi|domani)/i],
  QUERY_TASKS: [/(?:mostra|vedi|lista)\s+(?:i\s+)?task/i, /(?:i\s+miei\s+)?task/i],
  QUERY_EVENTS: [/(?:mostra|vedi)\s+(?:gli\s+)?eventi/i, /calendario/i],
  QUERY_EXPENSES: [/(?:mostra|vedi)\s+(?:le\s+)?spese/i, /quanto\s+ho\s+speso/i],
  QUERY_BUDGET: [/(?:come\s+va|stato)\s+(?:il\s+)?budget/i, /quanto\s+mi\s+resta/i],
};

// ============ SMALL TALK - VERY STRICT ============
// Only these exact patterns are SMALL_TALK
const PURE_SMALL_TALK_PATTERNS = [
  /^ciao$/i,
  /^salve$/i,
  /^buongiorno$/i,
  /^buonasera$/i,
  /^grazie$/i,
  /^ok$/i,
  /^perfetto$/i,
  /^ottimo$/i,
  /^come\s+stai\??$/i,
  /^hey$/i,
  /^hi$/i,
  /^hello$/i,
];

// ============ EXPLICIT QUESTION PATTERNS ============
const QUESTION_PATTERNS = [
  /^(?:cosa|come|quando|dove|perché|chi|quale|quanti|quanto)\s+/i,
  /\?$/,
  /(?:puoi|potresti|mi\s+dici|dimmi)\s+/i,
];

/**
 * Main intent parser - DETERMINISTIC CLASSIFICATION
 * 
 * Priority:
 * 1. SMALL_TALK (only exact matches)
 * 2. QUERIES (explicit patterns)
 * 3. EXPENSE (contains number, not a question)
 * 4. ACTION → CREATE_GENERIC
 */
export function parseIntent(message: string): ParsedIntent {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();
  const extractedData = extractData(normalized);
  
  console.log('=== Intent Parser ===');
  console.log('Input:', normalized);
  
  // ========== RULE 1: PURE SMALL TALK (exact matches only) ==========
  if (PURE_SMALL_TALK_PATTERNS.some(p => p.test(lower))) {
    console.log('Matched: SMALL_TALK (exact)');
    return { 
      intent: 'SMALL_TALK', 
      confidence: 1.0, 
      extractedData, 
      requiresClarification: false 
    };
  }
  
  // ========== RULE 2: QUERIES (explicit patterns) ==========
  for (const [intent, patterns] of Object.entries(QUERY_PATTERNS)) {
    if (patterns.some(p => p.test(lower))) {
      console.log('Matched: QUERY -', intent);
      return { 
        intent: intent as AssistantIntent, 
        confidence: 0.95, 
        extractedData, 
        requiresClarification: false 
      };
    }
  }
  
  // ========== RULE 3: CHECK IF QUESTION ==========
  const isQuestion = QUESTION_PATTERNS.some(p => p.test(lower));
  
  if (isQuestion) {
    console.log('Detected question - routing to ADVICE');
    return {
      intent: 'ADVICE_CONTEXTUAL',
      confidence: 0.8,
      extractedData,
      requiresClarification: false
    };
  }
  
  // ========== RULE 4: EXPENSE (number present, not question) ==========
  // If message contains a number → ALWAYS classify as RECORD_EXPENSE
  const hasNumber = /\d+(?:[.,]\d+)?/.test(normalized);
  
  if (hasNumber) {
    console.log('Matched: RECORD_EXPENSE (number detected)');
    
    // Extract amount more aggressively
    if (!extractedData.amount) {
      const numMatch = normalized.match(/(\d+(?:[.,]\d+)?)/);
      if (numMatch) {
        extractedData.amount = parseFloat(numMatch[1].replace(',', '.'));
      }
    }
    
    // Use remaining text as category/description
    const textWithoutNumber = normalized.replace(/€?\s*\d+(?:[.,]\d+)?\s*(?:euro)?/gi, '').trim();
    if (textWithoutNumber.length > 1) {
      extractedData.category = textWithoutNumber;
    }
    
    // Check if we have enough data
    const hasAmount = extractedData.amount !== undefined;
    const hasDescription = extractedData.category && extractedData.category.length > 1;
    
    if (hasAmount && hasDescription) {
      return {
        intent: 'RECORD_EXPENSE',
        confidence: 0.95,
        extractedData,
        requiresClarification: false
      };
    }
    
    // Missing description - ask for it
    return {
      intent: 'RECORD_EXPENSE',
      confidence: 0.6,
      extractedData,
      requiresClarification: true,
      clarificationQuestion: hasAmount ? 'Per cosa?' : 'Quanto hai speso?'
    };
  }
  
  // ========== RULE 5: ACTION → CREATE_GENERIC ==========
  // Everything else that's not a question is an ACTION
  // User wants to add something (task or event)
  console.log('Matched: CREATE_GENERIC (action)');
  
  // Use the message as potential title
  extractedData.title = normalized;
  
  return {
    intent: 'CREATE_GENERIC',
    confidence: 0.7,
    extractedData,
    requiresClarification: true,
    clarificationQuestion: 'Vuoi creare un task o un evento?'
  };
}

/**
 * Extract structured data from message
 */
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
        if (daysToAdd <= 0) daysToAdd += 7;
        data.date = format(addDays(today, daysToAdd), 'yyyy-MM-dd');
        break;
      }
    }
  }
  
  // Time extraction
  const timeMatch = message.match(/alle?\s*(\d{1,2})(?:[:.:](\d{2}))?/i);
  if (timeMatch) {
    data.startTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}`;
  }
  
  // Amount extraction
  const amountMatch = message.match(/€\s*(\d+(?:[.,]\d{2})?)|(\d+(?:[.,]\d{2})?)\s*(?:euro|€)/i);
  if (amountMatch) {
    data.amount = parseFloat((amountMatch[1] || amountMatch[2]).replace(',', '.'));
  }
  
  return data;
}
