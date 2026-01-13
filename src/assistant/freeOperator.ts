/**
 * FREE OPERATOR - Deterministic Action Executor
 * 
 * ROLE: OPERATOR (like a precise secretary)
 * 
 * ABSOLUTE INVARIANT:
 * NO WRITE ACTION (create/delete/update) SHALL EVER OCCUR WITHOUT EXPLICIT "SÌ" CONFIRMATION
 * 
 * TWO-PHASE FLOW:
 * PHASE 1 - Understand intention (READ ONLY)
 *   - User says something
 *   - Assistant does NOT create anything
 *   - Assistant summarizes what it understood
 * 
 * PHASE 2 - Explicit confirmation
 *   - Assistant asks: "Vuoi che lo faccia? (sì/no)"
 *   - ONLY "sì" enables the action
 *   - Any other response = cancellation
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
  | 'AWAIT_CONFIRMATION'  // NEW: Waiting for user confirmation
  | 'NONE';

export interface OperatorResponse {
  message: string;
  source: 'operator';
  actionExecuted: boolean;
  data?: any;
  nextExpected?: 'TITLE' | 'DATE' | 'TIME' | 'AMOUNT' | 'CATEGORY' | 'CONFIRM' | 'INDEX' | 'TYPE' | 'NONE';
  suggestions?: string[];
  awaitingConfirmation?: boolean;  // NEW: Flag to indicate we're waiting for confirmation
}

export interface OperatorContext {
  pendingIntent?: OperatorIntent;
  pendingData?: Record<string, any>;
  lastShownList?: { type: 'TASK' | 'EVENT' | 'EXPENSE'; ids: string[]; titles?: string[] };
  lastSingleItem?: { type: 'TASK' | 'EVENT' | 'EXPENSE'; id: string; title?: string };
  awaitingConfirmation?: boolean;  // NEW
}

// ========== WORDS THAT ARE NEVER COMMANDS ==========

/**
 * Words that should NEVER trigger actions or become titles
 * These are CONVERSATIONAL - not actionable
 */
const NEVER_COMMANDS = new Set([
  // Affirmative (only valid as confirmation RESPONSE)
  'ok', 'okay', 'sì', 'si', 'yes', 'certo', 'esatto',
  // Negative
  'no', 'nope', 'nah',
  // Vague
  'va bene', 'perfetto', 'bene', 'ottimo', 'giusto', 'capito',
  'pianifichiamo', 'vediamo', 'organizziamo', 'mostra',
  'perché', 'boh', 'mah', 'forse', 'magari',
  // Too short / meaningless
  'mmm', 'hmm', 'ah', 'eh', 'oh', 'uh',
  'aspetta', 'momento', 'un attimo',
  'dimmi', 'procedi', 'vai', 'fallo',
  // Single letters
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
]);

/**
 * Patterns that indicate conversational/vague input (not actionable)
 */
const VAGUE_INPUT_PATTERNS = [
  /^(?:ok|okay|sì|si|no|nope)$/i,
  /^(?:va bene|perfetto|certo|esatto)$/i,
  /^(?:pianifichiamo|vediamo|organizziamo)$/i,
  /^(?:mmm+|hmm+|ah+|eh+|oh+|uh+)$/i,
  /^(?:bene|ottimo|giusto|capito)$/i,
  /^(?:da dove (?:inizio|comincio)|non so)$/i,
  /^(?:cosa|come|perché|quando|dove|chi)\?*$/i,
  /^(?:forse|magari|boh|mah)$/i,
  /^.{0,2}$/,  // Too short (1-2 chars)
  /^\d{1,2}$/,  // Just a number (like "20") without context
];

/**
 * Cancel patterns - ALWAYS priority
 */
const CANCEL_PATTERNS = [
  /^(?:no|annulla|stop|basta|lascia\s*(?:stare|perdere)?|niente|cancella|cambia\s*idea|non\s*importa)$/i,
];

/**
 * Confirm patterns - ONLY valid after a confirmation request
 */
const CONFIRM_PATTERNS = [
  /^(?:s[iì]|sì|si|conferma|confermo)$/i,
];

// ========== VALIDATION FUNCTIONS ==========

/**
 * Check if input is a forbidden/vague phrase
 * Returns true if it should NOT be used as a title or trigger action
 */
export function isForbiddenTitle(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  
  // Check forbidden set
  if (NEVER_COMMANDS.has(normalized)) {
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

/**
 * Check if input is a cancel command
 */
export function isCancel(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return CANCEL_PATTERNS.some(p => p.test(normalized));
}

/**
 * Check if input is a confirmation (sì)
 * ONLY valid after a confirmation request was made
 */
export function isConfirmation(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return CONFIRM_PATTERNS.some(p => p.test(normalized));
}

/**
 * Normalize title: remove verbs, filler words, capitalize
 */
export function normalizeTitle(input: string): string {
  let title = input.trim();
  
  // Remove action verbs at start
  title = title.replace(/^(?:crea|aggiungi|nuovo|nuova|fai|fare)\s+(?:un\s+|una\s+)?/i, '');
  
  // Remove entity type words at start
  title = title.replace(/^(?:task|evento|appuntamento|spesa)\s*/i, '');
  
  // Remove filler at start
  title = title.replace(/^(?:ok|pianifichiamo|vediamo)\s*/i, '');
  
  // Capitalize first letter
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  
  return title;
}

// ========== COMMAND PATTERNS ==========
// Explicit action verbs - NO fuzzy matching, NO interpretation

const ACTION_PATTERNS = {
  CREATE_TASK: [
    /^(?:crea|aggiungi|nuovo|nuova)\s+(?:un\s+)?task\s+(.+)/i,
    /^(?:crea|aggiungi|nuovo|nuova)\s+(?:un\s+)?task$/i,
    /^ricordami\s+(?:di\s+)?(.+)/i,
  ],
  CREATE_EVENT: [
    /^(?:crea|aggiungi|nuovo|nuova)\s+(?:un\s+)?evento\s+(.+)/i,
    /^(?:crea|aggiungi|nuovo|nuova)\s+(?:un\s+)?evento$/i,
    /^(?:crea|aggiungi)\s+(?:un\s+)?appuntamento\s*(.*)$/i,
    /^(?:fissa|prenota)\s+(.+)/i,
  ],
  RECORD_EXPENSE: [
    /^(?:registra|segna|aggiungi)\s+(?:una?\s+)?spesa\s*(.*)$/i,
    /^ho\s+speso\s+(.+)/i,
    /^spesa\s+(.+)/i,
  ],
  SHOW_TASKS: [
    /^(?:mostra|vedi|lista|elenco)\s+(?:i\s+)?(?:miei\s+)?task/i,
    /^(?:quali\s+)?task\s+ho/i,
    /^i\s+miei\s+task$/i,
    /^task$/i,
  ],
  SHOW_EVENTS: [
    /^(?:mostra|vedi|lista)\s+(?:gli\s+)?(?:miei\s+)?eventi/i,
    /^(?:mostra|vedi)\s+(?:il\s+)?calendario/i,
    /^(?:cosa\s+ho\s+in\s+)?programma/i,
    /^eventi$/i,
    /^calendario$/i,
  ],
  SHOW_EXPENSES: [
    /^(?:mostra|vedi|lista)\s+(?:le\s+)?(?:mie\s+)?spese/i,
    /^quanto\s+ho\s+speso/i,
    /^spese$/i,
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
  /^(?:segna|metti)\s+(?!come\s)(.+)/i,
];

// ========== PARSE COMMAND ==========

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
  
  // Cancel ALWAYS first priority
  if (isCancel(lower)) {
    return { intent: 'CANCEL', confidence: 1.0 };
  }
  
  // Confirm (only valid in confirmation context - handled by orchestrator)
  if (isConfirmation(lower)) {
    return { intent: 'CONFIRM', confidence: 1.0 };
  }
  
  // Check for vague input - reject immediately
  if (VAGUE_INPUT_PATTERNS.some(p => p.test(lower))) {
    return { intent: 'NONE', confidence: 0 };
  }
  
  // Check each action pattern
  for (const [intent, patterns] of Object.entries(ACTION_PATTERNS)) {
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        let extracted = match[1]?.trim();
        
        // Normalize and validate extracted content
        if (extracted) {
          extracted = normalizeTitle(extracted);
          
          if (isForbiddenTitle(extracted)) {
            // Has forbidden content - treat as needing clarification
            return { 
              intent: intent as OperatorIntent, 
              extracted: undefined,
              confidence: 0.9 
            };
          }
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
      let extracted = match[1]?.trim();
      
      if (extracted) {
        extracted = normalizeTitle(extracted);
        
        if (isForbiddenTitle(extracted)) {
          return { intent: 'NONE', confidence: 0 };
        }
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

// ========== CONFIRMATION SUMMARY BUILDERS ==========

/**
 * Build confirmation message for task creation
 * PHASE 1: Summarize intention, ask for confirmation
 */
export function buildTaskConfirmation(title: string): OperatorResponse {
  return {
    message: `📝 Vuoi creare il task "${title}"? (sì/no)`,
    source: 'operator',
    actionExecuted: false,
    nextExpected: 'CONFIRM',
    awaitingConfirmation: true,
    suggestions: ['Sì', 'No']
  };
}

/**
 * Build confirmation message for event creation
 */
export function buildEventConfirmation(data: { title: string; date: string; startTime: string }): OperatorResponse {
  return {
    message: `📅 Vuoi creare l'evento "${data.title}" il ${data.date} alle ${data.startTime}? (sì/no)`,
    source: 'operator',
    actionExecuted: false,
    nextExpected: 'CONFIRM',
    awaitingConfirmation: true,
    suggestions: ['Sì', 'No']
  };
}

/**
 * Build confirmation message for expense
 */
export function buildExpenseConfirmation(data: { amount: number; category: string }): OperatorResponse {
  return {
    message: `💰 Vuoi registrare €${data.amount.toFixed(2)} per "${data.category}"? (sì/no)`,
    source: 'operator',
    actionExecuted: false,
    nextExpected: 'CONFIRM',
    awaitingConfirmation: true,
    suggestions: ['Sì', 'No']
  };
}

// ========== EXECUTE ACTIONS (ONLY AFTER CONFIRMATION) ==========

/**
 * Execute a CREATE_TASK - called ONLY after "sì" confirmation
 */
export async function executeCreateTask(
  userId: string,
  title: string
): Promise<OperatorResponse> {
  // ANTI-STUPIDITY: Final validation
  if (!isValidTitle(title)) {
    return {
      message: '⚠️ Titolo non valido. Dimmi cosa vuoi creare.',
      source: 'operator',
      actionExecuted: false
    };
  }
  
  const result = await createTask({
    user_id: userId,
    title: normalizeTitle(title)
  });
  
  if (result.success) {
    return {
      message: `✅ Task "${normalizeTitle(title)}" creato.`,
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
 * Execute a CREATE_EVENT - called ONLY after "sì" confirmation
 */
export async function executeCreateEvent(
  userId: string,
  data: { title?: string; date?: string; startTime?: string }
): Promise<OperatorResponse> {
  // Final validation
  if (!data.title || !isValidTitle(data.title)) {
    return {
      message: '⚠️ Nome evento non valido.',
      source: 'operator',
      actionExecuted: false
    };
  }
  
  if (!data.date || !data.startTime) {
    return {
      message: '⚠️ Data o orario mancante.',
      source: 'operator',
      actionExecuted: false
    };
  }
  
  const result = await createEvent({
    user_id: userId,
    title: normalizeTitle(data.title),
    date: data.date,
    start_time: data.startTime
  });
  
  if (result.success) {
    return {
      message: `✅ Evento "${normalizeTitle(data.title)}" creato per ${data.date} alle ${data.startTime}.`,
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
 * Execute a RECORD_EXPENSE - called ONLY after "sì" confirmation
 */
export async function executeRecordExpense(
  userId: string,
  data: { amount?: number; category?: string }
): Promise<OperatorResponse> {
  if (!data.amount || data.amount <= 0) {
    return {
      message: '⚠️ Importo non valido.',
      source: 'operator',
      actionExecuted: false
    };
  }
  
  if (!data.category || !isValidTitle(data.category)) {
    return {
      message: '⚠️ Categoria non valida.',
      source: 'operator',
      actionExecuted: false
    };
  }
  
  const result = await recordExpense({
    user_id: userId,
    amount: data.amount,
    category: normalizeTitle(data.category),
    date: format(new Date(), 'yyyy-MM-dd')
  });
  
  if (result.success) {
    return {
      message: `✅ €${data.amount.toFixed(2)} registrato per "${normalizeTitle(data.category)}".`,
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

// ========== QUERY ACTIONS (READ-ONLY - NO CONFIRMATION NEEDED) ==========

/**
 * Execute SHOW_TASKS command (READ-ONLY)
 */
export async function executeShowTasks(userId: string): Promise<OperatorResponse> {
  const result = await queryTasks(userId, { status: 'pending', limit: 10 });
  
  if (!result.success || !result.data || result.data.length === 0) {
    return {
      message: '📋 Nessun task.',
      source: 'operator',
      actionExecuted: true,
      data: [],
      suggestions: ['Crea un task']
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
    }
  };
}

/**
 * Execute SHOW_EVENTS command (READ-ONLY)
 */
export async function executeShowEvents(userId: string): Promise<OperatorResponse> {
  const result = await queryEvents(userId, { scope: 'week', limit: 10 });
  
  if (!result.success || !result.data || result.data.length === 0) {
    return {
      message: '📅 Nessun evento.',
      source: 'operator',
      actionExecuted: true,
      data: []
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
    }
  };
}

/**
 * Execute SHOW_EXPENSES command (READ-ONLY)
 */
export async function executeShowExpenses(userId: string): Promise<OperatorResponse> {
  const result = await queryExpenses(userId, { period: 'month', limit: 10 });
  
  if (!result.success || !result.data || result.data.length === 0) {
    return {
      message: '💰 Nessuna spesa.',
      source: 'operator',
      actionExecuted: true,
      data: []
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

// ========== RESPONSE HELPERS ==========

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
 * Handle cancel - ALWAYS priority
 */
export function handleCancel(): OperatorResponse {
  return {
    message: 'Ok, annullato 🙂 Dimmi pure cosa vuoi fare.',
    source: 'operator',
    actionExecuted: false
  };
}

/**
 * Handle ambiguous input - ask for explicit command
 * RULE: Ask, DON'T interpret
 */
export function handleAmbiguous(): OperatorResponse {
  return {
    message: 'Posso aiutarti, ma dimmi tu cosa vuoi fare 🙂',
    source: 'operator',
    actionExecuted: false,
    suggestions: ['Mostra task', 'Crea un task', 'Mostra eventi']
  };
}

/**
 * Check if message is a premium feature request
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
