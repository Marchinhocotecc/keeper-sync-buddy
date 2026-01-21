/**
 * ACTION VALIDATOR - Deterministic validation layer
 * 
 * RULES:
 * 1. Block actions with empty or suspicious titles
 * 2. Block filler words as titles ("ok", "no", "pianifichiamo", etc.)
 * 3. For every write action:
 *    - If missing confirmation → return confirmationQuestion
 *    - If confirmed "sì" → execute via ActionEngine
 *    - If confirmed "no" → cancel and clear state
 * 
 * This is CODE, not AI - deterministic validation.
 */

// ========== TITLE BLACKLIST ==========
// These words are NEVER valid as titles - they are filler/conversational
const FORBIDDEN_TITLES = new Set([
  // Affirmative
  'ok', 'okay', 'sì', 'si', 'yes', 'certo', 'esatto', 'perfetto', 'bene', 'ottimo',
  // Negative
  'no', 'nope', 'nah', 'basta', 'stop',
  // Vague
  'pianifichiamo', 'vediamo', 'organizziamo', 'facciamolo', 'andiamo',
  'procediamo', 'iniziamo', 'fallo', 'vai', 'procedi', 'dimmi',
  // Greetings
  'ciao', 'salve', 'buongiorno', 'buonasera', 'hey', 'ehi',
  // Too generic
  'top', 'boh', 'mah', 'forse', 'magari', 'perché', 'cosa', 'come',
  'quando', 'dove', 'chi', 'quale', 'aspetta', 'momento', 'un attimo',
  // Short
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  'ah', 'eh', 'oh', 'uh', 'mmm', 'hmm',
]);

// ========== VALIDATION FUNCTIONS ==========

/**
 * Check if a title is forbidden/invalid
 */
export function isForbiddenTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  
  // Direct match
  if (FORBIDDEN_TITLES.has(normalized)) {
    return true;
  }
  
  // Too short
  if (normalized.length < 3) {
    return true;
  }
  
  // Just numbers
  if (/^\d+$/.test(normalized)) {
    return true;
  }
  
  // Common consent patterns
  if (/^(?:ok|okay|va\s*bene|s[iì]|certo|perfetto|bene)\s*[,.]?\s*(?:pianifichiamo|facciamolo)?$/i.test(normalized)) {
    return true;
  }
  
  return false;
}

/**
 * Validate title for task/event creation
 */
export function validateTitle(title: string | undefined): { valid: boolean; error?: string } {
  if (!title || title.trim().length === 0) {
    return { valid: false, error: 'Titolo mancante' };
  }
  
  if (isForbiddenTitle(title)) {
    return { valid: false, error: 'Titolo non valido - troppo generico' };
  }
  
  return { valid: true };
}

/**
 * Validate amount for expense
 */
export function validateAmount(amount: number | undefined): { valid: boolean; error?: string } {
  if (amount === undefined || amount === null) {
    return { valid: false, error: 'Importo mancante' };
  }
  
  if (amount <= 0) {
    return { valid: false, error: 'Importo deve essere maggiore di zero' };
  }
  
  if (amount > 1000000) {
    return { valid: false, error: 'Importo troppo alto' };
  }
  
  return { valid: true };
}

/**
 * Validate category
 */
export function validateCategory(category: string | undefined): { valid: boolean; error?: string } {
  if (!category || category.trim().length === 0) {
    return { valid: false, error: 'Categoria mancante' };
  }
  
  if (isForbiddenTitle(category)) {
    return { valid: false, error: 'Categoria non valida' };
  }
  
  return { valid: true };
}

/**
 * Validate date string (YYYY-MM-DD)
 */
export function validateDate(date: string | undefined): { valid: boolean; error?: string } {
  if (!date) {
    return { valid: false, error: 'Data mancante' };
  }
  
  // Basic ISO date format check
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { valid: false, error: 'Formato data non valido' };
  }
  
  return { valid: true };
}

/**
 * Validate time string (HH:MM)
 */
export function validateTime(time: string | undefined): { valid: boolean; error?: string } {
  if (!time) {
    return { valid: false, error: 'Orario mancante' };
  }
  
  // Basic time format check
  if (!/^\d{1,2}:\d{2}$/.test(time)) {
    return { valid: false, error: 'Formato orario non valido' };
  }
  
  return { valid: true };
}

// ========== ACTION VALIDATION ==========

export type AIFreeIntent = 
  | 'NONE'
  | 'CREATE_TASK'
  | 'CREATE_EVENT'
  | 'QUERY_TASKS'
  | 'QUERY_EVENTS'
  | 'RECORD_EXPENSE'
  | 'QUERY_BUDGET'
  | 'DELETE_TASK'
  | 'DELETE_ALL_TASKS'
  | 'DELETE_EVENT'
  | 'DELETE_ALL_EVENTS'
  | 'DELETE_EXPENSE'
  | 'DELETE_ALL_EXPENSES'
  | 'ADVICE';

export interface AIFreeData {
  title?: string;
  date?: string;
  time?: string;
  amount?: number;
  category?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  targetId?: string;
}

export interface AIFreeOutput {
  intent: AIFreeIntent;
  reply: string;
  data: AIFreeData;
  needsConfirmation: boolean;
  confirmationQuestion: string | null;
}

/**
 * Validate AI output data based on intent
 * Returns validation result with any missing/invalid fields
 */
export function validateActionData(
  intent: AIFreeIntent,
  data: AIFreeData
): { valid: boolean; missingFields: string[]; errors: string[] } {
  const missingFields: string[] = [];
  const errors: string[] = [];
  
  switch (intent) {
    case 'CREATE_TASK': {
      const titleResult = validateTitle(data.title);
      if (!titleResult.valid) {
        missingFields.push('title');
        if (titleResult.error) errors.push(titleResult.error);
      }
      break;
    }
    
    case 'CREATE_EVENT': {
      const titleResult = validateTitle(data.title);
      if (!titleResult.valid) {
        missingFields.push('title');
        if (titleResult.error) errors.push(titleResult.error);
      }
      
      const dateResult = validateDate(data.date);
      if (!dateResult.valid) {
        missingFields.push('date');
      }
      
      const timeResult = validateTime(data.time);
      if (!timeResult.valid) {
        missingFields.push('time');
      }
      break;
    }
    
    case 'RECORD_EXPENSE': {
      const amountResult = validateAmount(data.amount);
      if (!amountResult.valid) {
        missingFields.push('amount');
        if (amountResult.error) errors.push(amountResult.error);
      }
      
      const categoryResult = validateCategory(data.category);
      if (!categoryResult.valid) {
        missingFields.push('category');
      }
      break;
    }
    
    case 'DELETE_TASK':
    case 'DELETE_EVENT':
    case 'DELETE_EXPENSE': {
      if (!data.targetId) {
        missingFields.push('targetId');
      }
      break;
    }
    
    // Query/list actions don't need validation
    case 'QUERY_TASKS':
    case 'QUERY_EVENTS':
    case 'QUERY_BUDGET':
    case 'DELETE_ALL_TASKS':
    case 'DELETE_ALL_EVENTS':
    case 'DELETE_ALL_EXPENSES':
    case 'ADVICE':
    case 'NONE':
      // No validation needed
      break;
  }
  
  return {
    valid: missingFields.length === 0 && errors.length === 0,
    missingFields,
    errors
  };
}

/**
 * Check if intent is a write action that requires confirmation
 */
export function isWriteAction(intent: AIFreeIntent): boolean {
  const WRITE_INTENTS: AIFreeIntent[] = [
    'CREATE_TASK',
    'CREATE_EVENT',
    'RECORD_EXPENSE',
    'DELETE_TASK',
    'DELETE_ALL_TASKS',
    'DELETE_EVENT',
    'DELETE_ALL_EVENTS',
    'DELETE_EXPENSE',
    'DELETE_ALL_EXPENSES'
  ];
  
  return WRITE_INTENTS.includes(intent);
}

/**
 * Normalize title: remove verbs, capitalize
 */
export function normalizeTitle(title: string): string {
  let result = title.trim();
  
  // Remove action verbs at start
  result = result.replace(/^(?:crea|aggiungi|nuovo|nuova|fai|fare)\s+(?:un\s+|una\s+)?/i, '');
  result = result.replace(/^(?:task|evento|appuntamento|spesa)\s*/i, '');
  
  // Capitalize first letter
  if (result.length > 0) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }
  
  return result;
}
