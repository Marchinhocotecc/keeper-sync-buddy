/**
 * FREE OPERATOR - Deterministic Action Executor
 * 
 * ROLE: OPERATOR (like a precise secretary)
 * 
 * GOLDEN RULE: Actions ONLY on explicit command
 * - Must contain action verb + object
 * - NO interpretation of vague phrases
 * - NO creating entities from conversational responses
 * 
 * CAPABILITIES:
 * ✅ Create/Delete/Show tasks, events, expenses
 * ✅ Read/Write data via ActionEngine ONLY
 * ✅ Execute ONLY explicit commands
 * ✅ Ask ONE targeted clarification if ambiguous
 * ✅ Ask confirmation before destructive writes
 * 
 * PROHIBITIONS:
 * ❌ Cannot suggest
 * ❌ Cannot advise/coach
 * ❌ Cannot plan
 * ❌ Cannot interpret non-explicit intentions
 * ❌ Cannot take initiative
 * ❌ Cannot deduce titles from vague phrases
 * ❌ Cannot transform conversational responses into data
 * ❌ Cannot complete user's sentences
 * 
 * ALL ACTIONS GO THROUGH ActionEngine - never direct DB writes
 */

import { 
  createTask, 
  createEvent, 
  recordExpense, 
  queryTasks, 
  queryEvents, 
  queryExpenses,
  type ActionResult
} from '@/engine/ActionEngine';
import { format } from 'date-fns';

// ========== TYPES ==========

export type OperatorIntent = 
  | 'CREATE_TASK' 
  | 'CREATE_EVENT' 
  | 'RECORD_EXPENSE'
  | 'DELETE_TASK'
  | 'DELETE_EVENT'
  | 'DELETE_EXPENSE'
  | 'COMPLETE_TASK'
  | 'SHOW_TASKS'
  | 'SHOW_EVENTS'
  | 'SHOW_EXPENSES'
  | 'CHOOSE_TYPE'
  | 'CLARIFY'
  | 'CANCEL'
  | 'CONFIRM'
  | 'NONE';

export interface OperatorResponse {
  message: string;
  source: 'operator';
  actionExecuted: boolean;
  data?: any;
  nextExpected?: 'TITLE' | 'DATE' | 'TIME' | 'AMOUNT' | 'CATEGORY' | 'CONFIRM' | 'INDEX' | 'TYPE' | 'NONE';
  suggestions?: string[];
}

export interface OperatorContext {
  pendingIntent?: OperatorIntent;
  pendingData?: Record<string, any>;
  lastShownList?: { type: 'TASK' | 'EVENT' | 'EXPENSE'; ids: string[]; titles?: string[] };
  lastSingleItem?: { type: 'TASK' | 'EVENT' | 'EXPENSE'; id: string; title?: string };
}

// ========== ANTI-STUPIDITY GUARDS ==========

/**
 * Words that should NEVER become task/event titles
 * These are conversational responses, not actionable items
 */
const FORBIDDEN_TITLES = new Set([
  'ok', 'okay', 'sì', 'si', 'no', 'nope',
  'va bene', 'perfetto', 'certo', 'esatto',
  'pianifichiamo', 'vediamo', 'organizziamo',
  'mmm', 'hmm', 'ah', 'eh', 'oh',
  'dimmi', 'procedi', 'vai', 'fallo',
  'bene', 'ottimo', 'giusto', 'capito',
  'forse', 'magari', 'boh', 'mah',
  'aspetta', 'momento', 'un attimo',
]);

/**
 * Patterns that indicate conversational/vague input (not actionable)
 */
const VAGUE_INPUT_PATTERNS = [
  /^(?:ok|okay|sì|si|no|nope)$/i,
  /^(?:va bene|perfetto|certo|esatto)$/i,
  /^(?:pianifichiamo|vediamo|organizziamo)$/i,
  /^(?:mmm+|hmm+|ah+|eh+|oh+)$/i,
  /^(?:bene|ottimo|giusto|capito)$/i,
  /^(?:da dove (?:inizio|comincio)|non so)$/i,
  /^(?:cosa|come|perché|quando|dove|chi)\?$/i,
  /^(?:forse|magari|boh|mah)$/i,
  /^.{0,2}$/,  // Too short (1-2 chars)
];

/**
 * Check if input is a forbidden/vague phrase
 * Returns true if it should NOT be used as a title
 */
export function isForbiddenTitle(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  
  // Check forbidden set
  if (FORBIDDEN_TITLES.has(normalized)) {
    return true;
  }
  
  // Check vague patterns
  if (VAGUE_INPUT_PATTERNS.some(p => p.test(normalized))) {
    return true;
  }
  
  // Too short to be meaningful
  if (normalized.length < 3) {
    return true;
  }
  
  return false;
}

/**
 * Check if this is a valid actionable title
 * Must be non-vague, meaningful content
 */
export function isValidTitle(input: string): boolean {
  return !isForbiddenTitle(input) && input.trim().length >= 3;
}

// ========== COMMAND PATTERNS ==========
// Explicit action verbs - NO fuzzy matching, NO interpretation

const ACTION_PATTERNS = {
  CREATE_TASK: [
    /^(?:crea|aggiungi|nuovo|nuova)\s+(?:un\s+)?task\s+(.+)/i,
    /^(?:crea|aggiungi|nuovo|nuova)\s+(?:un\s+)?task$/i,  // Without title
    /^ricordami\s+(?:di\s+)?(.+)/i,
  ],
  CREATE_EVENT: [
    /^(?:crea|aggiungi|nuovo|nuova)\s+(?:un\s+)?evento\s+(.+)/i,
    /^(?:crea|aggiungi|nuovo|nuova)\s+(?:un\s+)?evento$/i,  // Without details
    /^(?:crea|aggiungi)\s+(?:un\s+)?appuntamento\s*(.*)$/i,
    /^(?:fissa|prenota)\s+(.+)/i,
  ],
  RECORD_EXPENSE: [
    /^(?:registra|segna|aggiungi)\s+(?:una?\s+)?spesa\s*(.*)$/i,
    /^ho\s+speso\s+(.+)/i,
    /^spesa\s+(.+)/i,
    /^spesa$/i,  // Just "spesa"
  ],
  SHOW_TASKS: [
    /^(?:mostra|vedi|lista|elenco)\s+(?:i\s+)?(?:miei\s+)?task/i,
    /^(?:quali\s+)?task\s+ho/i,
    /^i\s+miei\s+task$/i,
    /^task$/i,  // Just "task" = show tasks
  ],
  SHOW_EVENTS: [
    /^(?:mostra|vedi|lista)\s+(?:gli\s+)?(?:miei\s+)?eventi/i,
    /^(?:mostra|vedi)\s+(?:il\s+)?calendario/i,
    /^(?:cosa\s+ho\s+in\s+)?programma/i,
    /^eventi$/i,  // Just "eventi"
    /^calendario$/i,  // Just "calendario"
  ],
  SHOW_EXPENSES: [
    /^(?:mostra|vedi|lista)\s+(?:le\s+)?(?:mie\s+)?spese/i,
    /^quanto\s+ho\s+speso/i,
    /^spese$/i,  // Just "spese"
  ],
  DELETE_TASK: [
    /^(?:elimina|cancella|rimuovi)\s+(?:il\s+)?task\s+(.+)/i,
    /^(?:elimina|cancella|rimuovi)\s+(?:il\s+)?task$/i,
  ],
  DELETE_EVENT: [
    /^(?:elimina|cancella|rimuovi)\s+(?:l'?\s*)?evento\s+(.+)/i,
    /^(?:elimina|cancella|rimuovi)\s+(?:l'?\s*)?evento$/i,
  ],
  DELETE_EXPENSE: [
    /^(?:elimina|cancella|rimuovi)\s+(?:la\s+)?spesa\s+(.+)/i,
    /^(?:elimina|cancella|rimuovi)\s+(?:la\s+)?spesa$/i,
  ],
  COMPLETE_TASK: [
    /^(?:completa|spunta|fatto|chiudi)\s+(?:il\s+)?task\s+(.+)/i,
    /^(?:completa|spunta|fatto|chiudi)\s+(?:il\s+)?task$/i,
    /^(?:ho\s+fatto|completato)\s+(.+)/i,
  ],
};

// Generic creation (no type specified) - triggers clarification
const GENERIC_CREATE_PATTERNS = [
  /^(?:crea|aggiungi)\s+(.+)/i,
  /^(?:segna|metti)\s+(?!come\s)(.+)/i,  // "metti X" but not "metti come fatto"
];

// Cancel patterns
const CANCEL_PATTERNS = [
  /^(?:no|annulla|stop|basta|lascia\s+(?:stare|perdere)|niente|cancella)$/i,
];

// Confirm patterns
const CONFIRM_PATTERNS = [
  /^(?:s[iì]|ok|okay|va\s+bene|confermo?|procedi|fallo|certo)$/i,
];

// ========== OPERATOR FUNCTIONS ==========

/**
 * Parse explicit command from message
 * RULE: Only recognize EXPLICIT commands with verb + object
 */
export function parseExplicitCommand(message: string): { 
  intent: OperatorIntent; 
  extracted?: string;
  confidence: number;
} {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();
  
  // Check for vague input FIRST - reject immediately
  if (VAGUE_INPUT_PATTERNS.some(p => p.test(lower))) {
    // Exception: if it's a cancel/confirm, handle it
    if (CANCEL_PATTERNS.some(p => p.test(lower))) {
      return { intent: 'CANCEL', confidence: 1.0 };
    }
    if (CONFIRM_PATTERNS.some(p => p.test(lower))) {
      return { intent: 'CONFIRM', confidence: 1.0 };
    }
    // Otherwise, reject as not a command
    return { intent: 'NONE', confidence: 0 };
  }
  
  // Cancel
  if (CANCEL_PATTERNS.some(p => p.test(lower))) {
    return { intent: 'CANCEL', confidence: 1.0 };
  }
  
  // Confirm
  if (CONFIRM_PATTERNS.some(p => p.test(lower))) {
    return { intent: 'CONFIRM', confidence: 1.0 };
  }
  
  // Check each action pattern
  for (const [intent, patterns] of Object.entries(ACTION_PATTERNS)) {
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const extracted = match[1]?.trim();
        
        // Validate extracted content is not forbidden
        if (extracted && isForbiddenTitle(extracted)) {
          // Has forbidden content - treat as needing clarification
          return { 
            intent: intent as OperatorIntent, 
            extracted: undefined,  // Don't use forbidden title
            confidence: 0.9 
          };
        }
        
        return { 
          intent: intent as OperatorIntent, 
          extracted: extracted,
          confidence: 0.95 
        };
      }
    }
  }
  
  // Generic create (ambiguous - needs type clarification)
  for (const pattern of GENERIC_CREATE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const extracted = match[1]?.trim();
      
      // Validate extracted content
      if (extracted && isForbiddenTitle(extracted)) {
        return { intent: 'NONE', confidence: 0 };
      }
      
      return { 
        intent: 'CHOOSE_TYPE', 
        extracted: extracted,
        confidence: 0.7 
      };
    }
  }
  
  // No explicit command found
  return { intent: 'NONE', confidence: 0 };
}

/**
 * Execute a CREATE_TASK command
 * RULE: Only create if title is valid and explicit
 */
export async function executeCreateTask(
  userId: string,
  title: string
): Promise<OperatorResponse> {
  // ANTI-STUPIDITY: Reject forbidden/vague titles
  if (!isValidTitle(title)) {
    return {
      message: '❓ Che task?',
      source: 'operator',
      actionExecuted: false,
      nextExpected: 'TITLE'
    };
  }
  
  const result = await createTask({
    user_id: userId,
    title: title.trim()
  });
  
  if (result.success) {
    return {
      message: `✅ Task aggiunto.`,
      source: 'operator',
      actionExecuted: true,
      data: result.data
    };
  }
  
  return {
    message: '⚠️ Errore. Riprova.',
    source: 'operator',
    actionExecuted: false
  };
}

/**
 * Execute a CREATE_EVENT command
 * Requires: title (valid), date, time
 */
export async function executeCreateEvent(
  userId: string,
  data: { title?: string; date?: string; startTime?: string }
): Promise<OperatorResponse> {
  const missing: string[] = [];
  
  // ANTI-STUPIDITY: Reject forbidden/vague titles
  if (!data.title || !isValidTitle(data.title)) missing.push('titolo');
  if (!data.date) missing.push('data');
  if (!data.startTime) missing.push('orario');
  
  if (missing.length > 0) {
    const question = missing.length === 1 
      ? `❓ ${missing[0] === 'titolo' ? 'Che evento?' : missing[0] === 'data' ? 'Quando?' : 'A che ora?'}`
      : `❓ Dimmi: ${missing.join(', ')}.`;
    
    return {
      message: question,
      source: 'operator',
      actionExecuted: false,
      nextExpected: missing[0] === 'titolo' ? 'TITLE' : missing[0] === 'data' ? 'DATE' : 'TIME'
    };
  }
  
  const result = await createEvent({
    user_id: userId,
    title: data.title!.trim(),
    date: data.date!,
    start_time: data.startTime
  });
  
  if (result.success) {
    return {
      message: `✅ Evento creato per ${data.date} alle ${data.startTime}.`,
      source: 'operator',
      actionExecuted: true,
      data: result.data
    };
  }
  
  return {
    message: '⚠️ Errore. Riprova.',
    source: 'operator',
    actionExecuted: false
  };
}

/**
 * Execute a RECORD_EXPENSE command
 * Requires: amount, category
 */
export async function executeRecordExpense(
  userId: string,
  data: { amount?: number; category?: string }
): Promise<OperatorResponse> {
  if (!data.amount || data.amount <= 0) {
    return {
      message: '❓ Quanto?',
      source: 'operator',
      actionExecuted: false,
      nextExpected: 'AMOUNT'
    };
  }
  
  // ANTI-STUPIDITY: Reject forbidden/vague categories
  if (!data.category || !isValidTitle(data.category)) {
    return {
      message: '❓ Per cosa?',
      source: 'operator',
      actionExecuted: false,
      nextExpected: 'CATEGORY'
    };
  }
  
  const result = await recordExpense({
    user_id: userId,
    amount: data.amount,
    category: data.category.trim(),
    date: format(new Date(), 'yyyy-MM-dd')
  });
  
  if (result.success) {
    return {
      message: `✅ €${data.amount.toFixed(2)} registrato.`,
      source: 'operator',
      actionExecuted: true,
      data: result.data
    };
  }
  
  return {
    message: '⚠️ Errore. Riprova.',
    source: 'operator',
    actionExecuted: false
  };
}

/**
 * Execute SHOW_TASKS command
 */
export async function executeShowTasks(userId: string): Promise<OperatorResponse> {
  const result = await queryTasks(userId, { status: 'pending', limit: 10 });
  
  if (!result.success || !result.data || result.data.length === 0) {
    return {
      message: '📋 Nessun task.',
      source: 'operator',
      actionExecuted: true,
      data: [],
      suggestions: ['Aggiungi task']
    };
  }
  
  const tasks = result.data;
  const list = tasks.map((t: any, i: number) => `${i + 1}. ${t.title}`).join('\n');
  
  return {
    message: `📋 I tuoi task:\n${list}`,
    source: 'operator',
    actionExecuted: true,
    data: { 
      type: 'TASK', 
      ids: tasks.map((t: any) => t.id),
      titles: tasks.map((t: any) => t.title)
    },
    suggestions: tasks.length > 0 ? ['Completa uno', 'Elimina uno'] : ['Aggiungi task']
  };
}

/**
 * Execute SHOW_EVENTS command
 */
export async function executeShowEvents(userId: string): Promise<OperatorResponse> {
  const result = await queryEvents(userId, { scope: 'week', limit: 10 });
  
  if (!result.success || !result.data || result.data.length === 0) {
    return {
      message: '📅 Nessun evento.',
      source: 'operator',
      actionExecuted: true,
      data: [],
      suggestions: ['Aggiungi evento']
    };
  }
  
  const events = result.data;
  const list = events.map((e: any, i: number) => `${i + 1}. ${e.title}`).join('\n');
  
  return {
    message: `📅 I tuoi eventi:\n${list}`,
    source: 'operator',
    actionExecuted: true,
    data: { 
      type: 'EVENT', 
      ids: events.map((e: any) => e.id),
      titles: events.map((e: any) => e.title)
    },
    suggestions: ['Elimina uno']
  };
}

/**
 * Execute SHOW_EXPENSES command
 */
export async function executeShowExpenses(userId: string): Promise<OperatorResponse> {
  const result = await queryExpenses(userId, { period: 'month', limit: 10 });
  
  if (!result.success || !result.data || result.data.length === 0) {
    return {
      message: '💰 Nessuna spesa.',
      source: 'operator',
      actionExecuted: true,
      data: [],
      suggestions: ['Registra spesa']
    };
  }
  
  const expenses = result.data;
  const total = expenses.reduce((sum: number, e: any) => sum + e.amount, 0);
  const list = expenses.slice(0, 5).map((e: any, i: number) => 
    `${i + 1}. €${e.amount.toFixed(2)} - ${e.category || e.description || 'Altro'}`
  ).join('\n');
  
  return {
    message: `💰 Spese:\n${list}\n\nTotale: €${total.toFixed(2)}`,
    source: 'operator',
    actionExecuted: true,
    data: { 
      type: 'EXPENSE', 
      ids: expenses.map((e: any) => e.id),
      amounts: expenses.map((e: any) => e.amount)
    }
  };
}

/**
 * Ask for type clarification (task or event)
 */
export function askTypeChoice(title?: string): OperatorResponse {
  return {
    message: '❓ Task o evento?',
    source: 'operator',
    actionExecuted: false,
    nextExpected: 'TYPE',
    data: title ? { pendingTitle: title } : undefined,
    suggestions: ['Task', 'Evento']
  };
}

/**
 * Handle cancel
 * Response: short, clear, no verbosity
 */
export function handleCancel(): OperatorResponse {
  return {
    message: '✅ Annullato.',
    source: 'operator',
    actionExecuted: false
  };
}

/**
 * Handle ambiguous input - ask for explicit command
 * Response: short, human, targeted
 */
export function handleAmbiguous(): OperatorResponse {
  return {
    message: '❓ Cosa vuoi fare?',
    source: 'operator',
    actionExecuted: false,
    suggestions: ['Mostra task', 'Aggiungi task', 'Mostra eventi']
  };
}

/**
 * Check if message is a premium feature request
 * Returns true if user is asking for advice/coaching (premium)
 */
export function isPremiumRequest(message: string): boolean {
  const lower = message.toLowerCase();
  
  const PREMIUM_PATTERNS = [
    /cosa\s+(?:dovrei|potrei)\s+fare/i,
    /consiglia(?:mi|mmi)/i,
    /aiuta(?:mi)?\s+a/i,
    /come\s+(?:posso|potrei)/i,
    /sugger(?:isci|iscimi)/i,
    /pianifica(?:mi)?/i,
    /organizza(?:mi)?/i,
    /da\s+dove\s+(?:inizio|comincio)/i,
    /non\s+so\s+(?:cosa|come)/i,
    /mi\s+sento/i,
    /analizza/i,
    /valuta/i,
  ];
  
  return PREMIUM_PATTERNS.some(p => p.test(lower));
}
