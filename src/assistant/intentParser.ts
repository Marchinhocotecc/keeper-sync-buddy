/**
 * Intent Parser - Robust JSON parser for AI responses
 */

import type { AIIntent, AIResponse, ParsedAIResponse } from './typesAI';

// Valid intents list for validation
const VALID_INTENTS: AIIntent[] = [
  'create_event', 'create_task', 'create_expense', 'create_note',
  'update_task', 'update_event', 'delete_task', 'delete_event',
  'query_tasks', 'query_events', 'query_expenses', 'query_budget',
  'advice', 'suggestion', 'greeting', 'farewell', 'thanks', 'question', 'unknown'
];

/**
 * Parse AI response with extreme robustness
 */
export function parseAIResponse(rawText: string): ParsedAIResponse {
  if (!rawText || typeof rawText !== 'string') {
    return { success: false, response: null, rawText: '', error: 'Empty response' };
  }

  const cleanedText = rawText.trim();

  // Try multiple parsing strategies
  const strategies = [
    () => parseDirectJSON(cleanedText),
    () => extractJSONFromText(cleanedText),
    () => extractJSONFromCodeBlock(cleanedText),
    () => fixAndParseJSON(cleanedText),
    () => extractIntentFromText(cleanedText),
    () => buildResponseFromNaturalText(cleanedText)
  ];

  for (const strategy of strategies) {
    try {
      const result = strategy();
      if (result && result.success) {
        return result;
      }
    } catch (e) {
      // Continue to next strategy
    }
  }

  // Last resort: return as advice with the raw text as message
  return {
    success: true,
    response: {
      intent: 'advice',
      payload: {},
      message: cleanedText.slice(0, 500) // Limit message length
    },
    rawText: cleanedText
  };
}

/**
 * Try direct JSON parse
 */
function parseDirectJSON(text: string): ParsedAIResponse | null {
  try {
    const parsed = JSON.parse(text);
    return validateAndNormalize(parsed, text);
  } catch {
    return null;
  }
}

/**
 * Extract JSON from surrounding text
 */
function extractJSONFromText(text: string): ParsedAIResponse | null {
  // Find JSON object in text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return validateAndNormalize(parsed, text);
    } catch {
      // Try to fix common issues
      return null;
    }
  }
  return null;
}

/**
 * Extract JSON from markdown code blocks
 */
function extractJSONFromCodeBlock(text: string): ParsedAIResponse | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return validateAndNormalize(parsed, text);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Fix common JSON errors and parse
 */
function fixAndParseJSON(text: string): ParsedAIResponse | null {
  let fixed = text;

  // Remove leading/trailing non-JSON text
  fixed = fixed.replace(/^[^{]*/, '').replace(/[^}]*$/, '');

  // Fix common issues
  fixed = fixed
    .replace(/'/g, '"')                    // Single to double quotes
    .replace(/,\s*}/g, '}')                // Trailing commas
    .replace(/,\s*]/g, ']')                // Trailing commas in arrays
    .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // Unquoted keys
    .replace(/:\s*'([^']*)'/g, ': "$1"')   // Single-quoted values
    .replace(/\n/g, ' ')                    // Remove newlines
    .replace(/\t/g, ' ');                   // Remove tabs

  try {
    const parsed = JSON.parse(fixed);
    return validateAndNormalize(parsed, text);
  } catch {
    return null;
  }
}

/**
 * Extract intent from natural language text patterns
 */
function extractIntentFromText(text: string): ParsedAIResponse | null {
  const lowerText = text.toLowerCase();

  // Pattern matching for common responses
  const patterns: { pattern: RegExp; intent: AIIntent; extractPayload?: (text: string) => any }[] = [
    { 
      pattern: /creo|aggiungo|inserisco.*evento/i, 
      intent: 'create_event',
      extractPayload: extractEventFromText
    },
    { 
      pattern: /creo|aggiungo|inserisco.*task/i, 
      intent: 'create_task',
      extractPayload: extractTaskFromText
    },
    { 
      pattern: /registro|aggiungo.*spesa|€\s*\d+/i, 
      intent: 'create_expense',
      extractPayload: extractExpenseFromText
    },
    { pattern: /consiglio|suggerisco|potresti/i, intent: 'advice' },
    { pattern: /ciao|buongiorno|buonasera|salve/i, intent: 'greeting' },
    { pattern: /arrivederci|a dopo|bye/i, intent: 'farewell' },
    { pattern: /grazie|thanks/i, intent: 'thanks' },
    { pattern: /\?$|cosa|come|quando|perché/i, intent: 'question' }
  ];

  for (const { pattern, intent, extractPayload } of patterns) {
    if (pattern.test(lowerText)) {
      const payload = extractPayload ? extractPayload(text) : {};
      return {
        success: true,
        response: {
          intent,
          payload,
          message: text.slice(0, 300)
        },
        rawText: text
      };
    }
  }

  return null;
}

/**
 * Build response from natural text as last resort
 */
function buildResponseFromNaturalText(text: string): ParsedAIResponse {
  return {
    success: true,
    response: {
      intent: 'advice',
      payload: {},
      message: text.slice(0, 500)
    },
    rawText: text
  };
}

/**
 * Validate and normalize parsed JSON
 */
function validateAndNormalize(parsed: any, rawText: string): ParsedAIResponse | null {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  // Normalize intent
  let intent: AIIntent = 'unknown';
  if (parsed.intent && typeof parsed.intent === 'string') {
    const normalizedIntent = parsed.intent.toLowerCase().replace(/[^a-z_]/g, '');
    if (VALID_INTENTS.includes(normalizedIntent as AIIntent)) {
      intent = normalizedIntent as AIIntent;
    }
  }

  // Normalize payload
  const payload = parsed.payload && typeof parsed.payload === 'object' 
    ? parsed.payload 
    : {};

  // Normalize message
  const message = typeof parsed.message === 'string' 
    ? parsed.message 
    : typeof parsed.response === 'string'
      ? parsed.response
      : '';

  const response: AIResponse = {
    intent,
    payload,
    message,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined
  };

  return {
    success: true,
    response,
    rawText
  };
}

/**
 * Extract event details from natural text
 */
function extractEventFromText(text: string): any {
  const payload: any = { title: 'Nuovo evento' };

  // Extract title
  const titleMatch = text.match(/(?:evento|appuntamento)\s+(?:chiamato|intitolato|:)?\s*["']?([^"'\n,]+)/i);
  if (titleMatch) payload.title = titleMatch[1].trim();

  // Extract time
  const timeMatch = text.match(/(\d{1,2})[:\.](\d{2})/);
  if (timeMatch) {
    payload.startTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    const endHour = (parseInt(timeMatch[1]) + 1).toString().padStart(2, '0');
    payload.endTime = `${endHour}:${timeMatch[2]}`;
  }

  // Extract date keywords
  const today = new Date();
  if (/oggi/i.test(text)) {
    payload.date = today.toISOString().split('T')[0];
  } else if (/domani/i.test(text)) {
    today.setDate(today.getDate() + 1);
    payload.date = today.toISOString().split('T')[0];
  }

  return payload;
}

/**
 * Extract task details from natural text
 */
function extractTaskFromText(text: string): any {
  const payload: any = { title: 'Nuovo task' };

  // Extract title
  const titleMatch = text.match(/task\s+(?:chiamato|intitolato|:)?\s*["']?([^"'\n,]+)/i);
  if (titleMatch) payload.title = titleMatch[1].trim();

  // Extract priority
  if (/alta|urgente|importante/i.test(text)) {
    payload.priority = 'high';
  } else if (/bassa|poco importante/i.test(text)) {
    payload.priority = 'low';
  }

  return payload;
}

/**
 * Extract expense details from natural text
 */
function extractExpenseFromText(text: string): any {
  const payload: any = {};

  // Extract amount
  const amountMatch = text.match(/€?\s*(\d+(?:[.,]\d{2})?)/);
  if (amountMatch) {
    payload.amount = parseFloat(amountMatch[1].replace(',', '.'));
  }

  // Extract category
  const categories = ['spesa', 'cibo', 'trasporto', 'casa', 'salute', 'svago', 'lavoro'];
  for (const cat of categories) {
    if (text.toLowerCase().includes(cat)) {
      payload.category = cat;
      break;
    }
  }

  return payload;
}

/**
 * Check if intent is actionable (requires execution)
 */
export function isActionableIntent(intent: AIIntent): boolean {
  return [
    'create_event', 'create_task', 'create_expense', 'create_note',
    'update_task', 'update_event', 'delete_task', 'delete_event'
  ].includes(intent);
}

/**
 * Check if intent is a query (requires data fetch)
 */
export function isQueryIntent(intent: AIIntent): boolean {
  return ['query_tasks', 'query_events', 'query_expenses', 'query_budget'].includes(intent);
}
