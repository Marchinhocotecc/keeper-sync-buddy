/**
 * FREE OPERATOR - Deterministic Action Executor
 * 
 * ROLE: OPERATOR (DeepSeek R1 Free conceptually, runs locally)
 * 
 * CAPABILITIES:
 * ✅ Create/Delete/Show tasks, events, expenses
 * ✅ Read/Write data via ActionEngine
 * ✅ Execute ONLY explicit commands
 * ✅ Ask clarification if input is ambiguous
 * ✅ Ask confirmation before writes if needed
 * 
 * PROHIBITIONS:
 * ❌ Cannot suggest
 * ❌ Cannot advise/coach
 * ❌ Cannot plan
 * ❌ Cannot interpret non-explicit intentions
 * ❌ Cannot take initiative
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

// ========== COMMAND PATTERNS ==========
// Explicit action verbs - NO fuzzy matching, NO interpretation

const ACTION_PATTERNS = {
  CREATE_TASK: [
    /^(?:crea|aggiungi|nuovo|nuova)\s+(?:un\s+)?task\s+(.+)/i,
    /^(?:aggiungi|metti|inserisci)\s+(?:alla\s+lista\s+)?(.+)/i,
    /^ricordami\s+(?:di\s+)?(.+)/i,
  ],
  CREATE_EVENT: [
    /^(?:crea|aggiungi|nuovo|nuova)\s+(?:un\s+)?evento\s+(.+)/i,
    /^(?:crea|aggiungi)\s+(?:un\s+)?appuntamento\s+(.+)/i,
    /^(?:fissa|prenota|segna)\s+(.+)/i,
  ],
  RECORD_EXPENSE: [
    /^(?:registra|segna|aggiungi)\s+(?:una?\s+)?spesa\s+(.+)/i,
    /^ho\s+speso\s+(.+)/i,
    /^spesa\s+(.+)/i,
  ],
  SHOW_TASKS: [
    /^(?:mostra|vedi|lista|elenco)\s+(?:i\s+)?(?:miei\s+)?task/i,
    /^(?:quali\s+)?task\s+ho/i,
    /^i\s+miei\s+task$/i,
  ],
  SHOW_EVENTS: [
    /^(?:mostra|vedi|lista)\s+(?:gli\s+)?(?:miei\s+)?eventi/i,
    /^(?:mostra|vedi)\s+(?:il\s+)?calendario/i,
    /^(?:cosa\s+ho\s+in\s+)?programma/i,
  ],
  SHOW_EXPENSES: [
    /^(?:mostra|vedi|lista)\s+(?:le\s+)?(?:mie\s+)?spese/i,
    /^quanto\s+ho\s+speso/i,
  ],
  DELETE_TASK: [
    /^(?:elimina|cancella|rimuovi)\s+(?:il\s+)?task\s+(.+)/i,
  ],
  DELETE_EVENT: [
    /^(?:elimina|cancella|rimuovi)\s+(?:l'?\s*)?evento\s+(.+)/i,
  ],
  DELETE_EXPENSE: [
    /^(?:elimina|cancella|rimuovi)\s+(?:la\s+)?spesa\s+(.+)/i,
  ],
  COMPLETE_TASK: [
    /^(?:completa|spunta|fatto|chiudi)\s+(?:il\s+)?task\s+(.+)/i,
    /^(?:ho\s+fatto|completato)\s+(.+)/i,
  ],
};

// Generic creation (no type specified)
const GENERIC_CREATE_PATTERNS = [
  /^(?:crea|aggiungi|nuovo|nuova)\s+(.+)/i,
  /^(?:segna|metti)\s+(.+)/i,
];

// Cancel patterns
const CANCEL_PATTERNS = [
  /^(?:no|annulla|stop|basta|lascia\s+(?:stare|perdere)|niente)$/i,
];

// Confirm patterns
const CONFIRM_PATTERNS = [
  /^(?:s[iì]|ok|okay|va\s+bene|confermo?|procedi|fallo|certo)$/i,
];

// ========== OPERATOR FUNCTIONS ==========

/**
 * Parse explicit command from message
 * RULE: Only recognize EXPLICIT commands, never interpret
 */
export function parseExplicitCommand(message: string): { 
  intent: OperatorIntent; 
  extracted?: string;
  confidence: number;
} {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();
  
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
        return { 
          intent: intent as OperatorIntent, 
          extracted: match[1]?.trim(),
          confidence: 0.95 
        };
      }
    }
  }
  
  // Generic create (ambiguous - needs type clarification)
  for (const pattern of GENERIC_CREATE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { 
        intent: 'CHOOSE_TYPE', 
        extracted: match[1]?.trim(),
        confidence: 0.7 
      };
    }
  }
  
  // No explicit command found
  return { intent: 'NONE', confidence: 0 };
}

/**
 * Execute a CREATE_TASK command
 */
export async function executeCreateTask(
  userId: string,
  title: string
): Promise<OperatorResponse> {
  if (!title || title.trim().length < 2) {
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
      message: `✅ Task "${title.trim()}" aggiunto.`,
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
 * Requires: title, date, time
 */
export async function executeCreateEvent(
  userId: string,
  data: { title?: string; date?: string; startTime?: string }
): Promise<OperatorResponse> {
  const missing: string[] = [];
  
  if (!data.title || data.title.trim().length < 2) missing.push('titolo');
  if (!data.date) missing.push('data');
  if (!data.startTime) missing.push('orario');
  
  if (missing.length > 0) {
    const question = missing.length === 1 
      ? `❓ ${missing[0] === 'titolo' ? 'Che evento?' : missing[0] === 'data' ? 'Quando?' : 'A che ora?'}`
      : `❓ Mi servono: ${missing.join(', ')}.`;
    
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
      message: `✅ Evento "${data.title!.trim()}" creato per ${data.date} alle ${data.startTime}.`,
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
  
  if (!data.category || data.category.trim().length < 2) {
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
      message: `✅ Spesa di €${data.amount.toFixed(2)} (${data.category.trim()}) registrata.`,
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
    message: list,
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
    message: list,
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
    message: `${list}\n\n💰 Totale: €${total.toFixed(2)}`,
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
    data: { pendingTitle: title },
    suggestions: ['Task', 'Evento']
  };
}

/**
 * Handle cancel
 */
export function handleCancel(): OperatorResponse {
  return {
    message: '✅ Ok, annullato.',
    source: 'operator',
    actionExecuted: false
  };
}

/**
 * Handle ambiguous input - ask for explicit command
 */
export function handleAmbiguous(): OperatorResponse {
  return {
    message: '❓ Dimmi cosa vuoi fare.',
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
