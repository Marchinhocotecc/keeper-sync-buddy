/**
 * StateStore - Unified state management for the stateful assistant
 * 
 * Single source of truth for assistant state with Supabase persistence.
 * Provides clear logging and anti-loop protection.
 */

import { supabase } from '@/integrations/supabase/client';

// ========== TYPES ==========

export type ActiveIntent = 
  | 'NONE'
  | 'CREATE_GENERIC'    // User said something ambiguous like "crea padel"
  | 'CREATE_TASK'       // Creating a task
  | 'CREATE_EVENT'      // Creating an event
  | 'RECORD_EXPENSE'    // Recording an expense
  | 'CHOOSE_TYPE'       // Choosing between task/event
  | 'QUERY_TASKS'       // Querying tasks
  | 'QUERY_EVENTS'      // Querying events
  | 'MANAGE_TASKS'      // Managing shown tasks (delete, complete)
  | 'MANAGE_EVENTS'     // Managing shown events (delete, modify)
  | 'MANAGE_EXPENSES'   // Managing shown expenses (delete)
  | 'CONFIRM_BULK_DELETE'   // Awaiting confirmation for bulk delete
  | 'CONFIRM_BULK_COMPLETE' // Awaiting confirmation for bulk complete
  | 'ADVICE';           // After giving advice - may follow up

export type LastActionType = 
  | 'NONE'
  | 'SHOW_TASKS'
  | 'SHOW_EVENTS'
  | 'SHOW_EXPENSES'
  | 'CREATED_TASK'
  | 'CREATED_EVENT'
  | 'CREATE_TASK'
  | 'CREATE_EVENT'
  | 'RECORD_EXPENSE'
  | 'ADVICE';

export type ExpectedInput = 
  | 'NONE'
  | 'CHOOSE_TYPE'
  | 'CHOOSE_INDEX'
  | 'TASK_TITLE'
  | 'EVENT_TITLE'
  | 'EVENT_DATE'
  | 'EVENT_TIME'
  | 'EVENT_DATETIME'
  | 'CONFIRM_DELETE'
  | 'CONFIRM_COMPLETE'
  | 'EXPENSE_AMOUNT'
  | 'TITLE'
  | 'DATE'
  | 'TIME'
  | 'AMOUNT'
  | 'CATEGORY'
  | 'TYPE';

export interface IntentPayload {
  title?: string;
  pendingTitle?: string;
  date?: string;
  time?: string;
  startTime?: string;
  pending_date?: string;
  pending_time?: string;
  start_at?: string;
  end_at?: string;
  priority?: string;
  category?: string;
  description?: string;
  amount?: number;
  type?: 'task' | 'event' | 'expense';
  targetType?: 'tasks' | 'events' | 'expenses';
  action?: 'delete' | 'complete' | 'manage';
  ids?: string[];
  deleteType?: 'tasks' | 'events' | 'expenses';
  lastShownIds?: string[];
  count?: number;
  titleAttempts?: number;
  expectedInput?: ExpectedInput;
  last_single_context?: { type: 'TASK' | 'EVENT' | 'EXPENSE'; id: string; title?: string };
  last_list_context?: { type: 'TASK' | 'EVENT' | 'EXPENSE'; ids: string[]; titles?: string[] };
  pendingAction?: 'delete' | 'complete';
  selectedId?: string;
  selectedTitle?: string;
}

export interface LastActionPayload {
  ids?: string[];
  titles?: string[];
  title?: string;
  count?: number;
  amount?: number;
  category?: string;
  date?: string;
  startTime?: string;
}

export interface AssistantState {
  user_id: string;
  active_intent: ActiveIntent;
  intent_payload: IntentPayload;
  missing_fields: string[];
  last_action_type: LastActionType;
  last_action_payload: LastActionPayload;
  awaiting_confirmation: boolean;
  attempts: number;
  updated_at: string;
}

// ========== CONSTANTS ==========

const MAX_ATTEMPTS = 3;
const LOG_PREFIX = '[AssistantState]';

const DEFAULT_STATE: Omit<AssistantState, 'user_id' | 'updated_at'> = {
  active_intent: 'NONE',
  intent_payload: {},
  missing_fields: [],
  last_action_type: 'NONE',
  last_action_payload: {},
  awaiting_confirmation: false,
  attempts: 0
};

// ========== CORE FUNCTIONS ==========

/**
 * Get assistant state for a user
 * Creates default state if none exists
 */
export async function getAssistantState(userId: string): Promise<AssistantState> {
  try {
    const { data, error } = await supabase
      .from('assistant_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error(`${LOG_PREFIX} Error fetching state:`, error.message);
      return createDefaultState(userId);
    }

    if (!data) {
      console.log(`${LOG_PREFIX} No state found for user, creating default`);
      const newState = createDefaultState(userId);
      await upsertAssistantState(userId, {});
      return newState;
    }

    const state: AssistantState = {
      user_id: data.user_id,
      active_intent: (data.active_intent || 'NONE') as ActiveIntent,
      intent_payload: (data.intent_payload || {}) as IntentPayload,
      missing_fields: (data.missing_fields || []) as string[],
      last_action_type: (data.last_action_type || 'NONE') as LastActionType,
      last_action_payload: (data.last_action_payload || {}) as LastActionPayload,
      awaiting_confirmation: data.awaiting_confirmation ?? false,
      attempts: data.attempts ?? 0,
      updated_at: data.updated_at
    };

    console.log(`${LOG_PREFIX} loaded state:`, {
      active_intent: state.active_intent,
      awaiting_confirmation: state.awaiting_confirmation,
      attempts: state.attempts,
      missing_fields: state.missing_fields
    });

    return state;
  } catch (error) {
    console.error(`${LOG_PREFIX} Exception in getAssistantState:`, error);
    return createDefaultState(userId);
  }
}

/**
 * Update assistant state (merge with existing)
 */
export async function upsertAssistantState(
  userId: string,
  patch: Partial<Omit<AssistantState, 'user_id' | 'updated_at'>>
): Promise<boolean> {
  try {
    // Build the update object, only including defined fields
    const updateData: Record<string, any> = {
      user_id: userId,
      updated_at: new Date().toISOString()
    };

    if (patch.active_intent !== undefined) updateData.active_intent = patch.active_intent;
    if (patch.intent_payload !== undefined) updateData.intent_payload = patch.intent_payload;
    if (patch.missing_fields !== undefined) updateData.missing_fields = patch.missing_fields;
    if (patch.last_action_type !== undefined) updateData.last_action_type = patch.last_action_type;
    if (patch.last_action_payload !== undefined) updateData.last_action_payload = patch.last_action_payload;
    if (patch.awaiting_confirmation !== undefined) updateData.awaiting_confirmation = patch.awaiting_confirmation;
    if (patch.attempts !== undefined) updateData.attempts = patch.attempts;

    const { error } = await supabase
      .from('assistant_state')
      .upsert(updateData as any, { onConflict: 'user_id' });

    if (error) {
      console.error(`${LOG_PREFIX} Error saving state:`, error.message);
      return false;
    }

    console.log(`${LOG_PREFIX} saved state:`, {
      active_intent: patch.active_intent,
      awaiting_confirmation: patch.awaiting_confirmation,
      attempts: patch.attempts
    });

    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Exception in upsertAssistantState:`, error);
    return false;
  }
}

/**
 * Clear assistant state (reset to NONE)
 * Use when action is completed or cancelled
 */
export async function clearAssistantState(userId: string): Promise<boolean> {
  console.log(`${LOG_PREFIX} cleared`);
  
  return upsertAssistantState(userId, {
    active_intent: 'NONE',
    intent_payload: {},
    missing_fields: [],
    awaiting_confirmation: false,
    attempts: 0
  });
}

// ========== INTENT MANAGEMENT ==========

/**
 * Set active intent with payload
 */
export async function setIntent(
  userId: string,
  intent: ActiveIntent,
  payload: IntentPayload = {},
  missingFields: string[] = []
): Promise<boolean> {
  return upsertAssistantState(userId, {
    active_intent: intent,
    intent_payload: payload,
    missing_fields: missingFields,
    awaiting_confirmation: false,
    attempts: 0
  });
}

/**
 * Update intent payload (merge with existing)
 */
export async function updatePayload(
  userId: string,
  payloadUpdate: Partial<IntentPayload>
): Promise<boolean> {
  const state = await getAssistantState(userId);
  const newPayload = { ...state.intent_payload, ...payloadUpdate };
  
  // Remove fields from missing_fields if they're now provided
  const newMissingFields = state.missing_fields.filter(
    field => !(field in payloadUpdate) || payloadUpdate[field as keyof IntentPayload] === undefined
  );

  return upsertAssistantState(userId, {
    intent_payload: newPayload,
    missing_fields: newMissingFields
  });
}

/**
 * Set awaiting confirmation flag
 */
export async function setAwaitingConfirmation(
  userId: string,
  awaiting: boolean
): Promise<boolean> {
  return upsertAssistantState(userId, {
    awaiting_confirmation: awaiting
  });
}

/**
 * Increment attempts counter
 * Returns true if under limit, false if limit reached
 */
export async function incrementAttempts(userId: string): Promise<{ underLimit: boolean; attempts: number }> {
  const state = await getAssistantState(userId);
  const newAttempts = state.attempts + 1;
  
  await upsertAssistantState(userId, {
    attempts: newAttempts
  });
  
  return {
    underLimit: newAttempts < MAX_ATTEMPTS,
    attempts: newAttempts
  };
}

// ========== LAST ACTION MANAGEMENT ==========

/**
 * Set last action (for context in follow-ups)
 */
export async function setLastAction(
  userId: string,
  type: LastActionType,
  payload: LastActionPayload = {}
): Promise<boolean> {
  return upsertAssistantState(userId, {
    last_action_type: type,
    last_action_payload: payload
  });
}

// ========== UTILITY FUNCTIONS ==========

function createDefaultState(userId: string): AssistantState {
  return {
    user_id: userId,
    ...DEFAULT_STATE,
    updated_at: new Date().toISOString()
  };
}

/**
 * Check if there's an active intent
 */
export function hasActiveIntent(state: AssistantState): boolean {
  return state.active_intent !== 'NONE';
}

/**
 * Check if max attempts reached
 */
export function isAntiLoopTriggered(state: AssistantState): boolean {
  return state.attempts >= MAX_ATTEMPTS;
}

/**
 * Get the anti-loop message
 */
export function getAntiLoopMessage(): string {
  return "Sto avendo difficoltà a completare questa azione. Vuoi annullare (scrivi 'annulla') o riprovare riscrivendo i dettagli in una frase?";
}

/**
 * Check what fields are missing for current intent
 */
export function getMissingFields(state: AssistantState): string[] {
  const { active_intent, intent_payload } = state;
  const missing: string[] = [];

  switch (active_intent) {
    case 'CREATE_TASK':
      if (!intent_payload.title) missing.push('title');
      break;
    
    case 'CREATE_EVENT':
      if (!intent_payload.title) missing.push('title');
      if (!intent_payload.start_at && !intent_payload.date) missing.push('date');
      if (!intent_payload.start_at && !intent_payload.time && !intent_payload.startTime) missing.push('time');
      break;
    
    case 'RECORD_EXPENSE':
      if (!intent_payload.amount) missing.push('amount');
      if (!intent_payload.category) missing.push('category');
      break;
    
    case 'CREATE_GENERIC':
    case 'CHOOSE_TYPE':
      missing.push('type');
      break;
  }

  return missing;
}
