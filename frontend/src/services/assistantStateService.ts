/**
 * AssistantStateService - Manages conversational state in Supabase
 * Handles active intents, follow-ups, and last action tracking
 */

import { supabase } from '@/integrations/supabase/client';

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
  | 'CONFIRM_BULK_COMPLETE'; // Awaiting confirmation for bulk complete

export type LastActionType = 
  | 'NONE'
  | 'SHOW_TASKS'
  | 'SHOW_EVENTS'
  | 'SHOW_EXPENSES'
  | 'CREATED_TASK'
  | 'CREATED_EVENT'
  | 'CREATE_TASK'       // Alias for creating task
  | 'CREATE_EVENT'      // Alias for creating event
  | 'RECORD_EXPENSE'    // Recorded an expense
  | 'ADVICE';  // After giving contextual advice

// NPC Mode: Expected input type for state machine gating
export type ExpectedInput = 
  | 'NONE'
  | 'CHOOSE_TYPE'      // Waiting for task/event choice
  | 'CHOOSE_INDEX'     // Waiting for index selection (1-N) from a list
  | 'TASK_TITLE'       // Waiting for task title
  | 'EVENT_TITLE'      // Waiting for event title
  | 'EVENT_DATE'       // Waiting for event date
  | 'EVENT_TIME'       // Waiting for event time
  | 'EVENT_DATETIME'   // Waiting for date and/or time
  | 'CONFIRM_DELETE'   // Waiting for yes/no on bulk delete
  | 'CONFIRM_COMPLETE' // Waiting for yes/no on bulk complete
  | 'EXPENSE_AMOUNT'   // Waiting for expense amount
  | 'TITLE'            // Generic title input
  | 'DATE'             // Generic date input
  | 'TIME'             // Generic time input
  | 'AMOUNT'           // Generic amount input
  | 'CATEGORY'         // Category input
  | 'TYPE';            // Type selection input

// Reference memory types for "eliminalo/completalo" resolution
export type EntityType = 'TASK' | 'EVENT' | 'EXPENSE';

export interface SingleContext {
  type: EntityType;
  id: string;
  title?: string;
}

export interface ListContext {
  type: EntityType;
  ids: string[];
  titles?: string[];
}

export interface IntentPayload {
  title?: string;
  pendingTitle?: string;   // Title pending type choice
  date?: string;           // ISO date string (legacy)
  time?: string;           // HH:mm format (legacy)
  startTime?: string;      // Start time for events (HH:mm)
  pending_date?: string;   // ISO date string (pending merge)
  pending_time?: string;   // HH:mm format (pending merge)
  start_at?: string;       // Full ISO datetime
  end_at?: string;         // Full ISO datetime
  priority?: string;
  category?: string;
  description?: string;
  amount?: number;         // For expense recording
  // Type disambiguation for CREATE_GENERIC
  type?: 'task' | 'event' | 'expense';
  targetType?: 'tasks' | 'events' | 'expenses'; // Target type for bulk operations
  // Management fields
  action?: 'delete' | 'complete' | 'manage';
  ids?: string[];
  deleteType?: 'tasks' | 'events' | 'expenses';
  lastShownIds?: string[];  // IDs shown in last list operation
  count?: number;           // Count for bulk operations
  // Title validation tracking
  titleAttempts?: number;   // Number of invalid title attempts
  // NPC Mode: Expected input for state machine
  expectedInput?: ExpectedInput;
  // Reference memory for pronoun resolution ("eliminalo", "completalo")
  last_single_context?: SingleContext;
  last_list_context?: ListContext;
  // Pending action for CHOOSE_INDEX resolution
  pendingAction?: 'delete' | 'complete';
  // NEW: Confirmation system
  awaitingConfirmation?: boolean;  // Flag for two-phase confirmation
  selectedId?: string;             // Selected item ID for delete/complete
  selectedTitle?: string;          // Selected item title
}

export interface LastActionPayload {
  ids?: string[];
  titles?: string[];
  title?: string;        // Single title for created item
  count?: number;
  amount?: number;       // For expense actions
  category?: string;     // For expense actions
  date?: string;         // For event actions
  startTime?: string;    // For event actions
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

const DEFAULT_STATE: Omit<AssistantState, 'user_id' | 'updated_at'> = {
  active_intent: 'NONE',
  intent_payload: {},
  missing_fields: [],
  last_action_type: 'NONE',
  last_action_payload: {},
  awaiting_confirmation: false,
  attempts: 0
};

/**
 * Get current state for user (creates if not exists)
 */
export async function getState(userId: string): Promise<AssistantState> {
  try {
    const { data, error } = await supabase
      .from('assistant_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching assistant state:', error);
      // Return default state on error
      return {
        user_id: userId,
        ...DEFAULT_STATE,
        updated_at: new Date().toISOString()
      };
    }

    // If no row exists, create one
    if (!data) {
      const newState: AssistantState = {
        user_id: userId,
        ...DEFAULT_STATE,
        updated_at: new Date().toISOString()
      };

      const { error: insertError } = await supabase
        .from('assistant_state')
        .insert({
          user_id: userId,
          active_intent: DEFAULT_STATE.active_intent,
          intent_payload: DEFAULT_STATE.intent_payload as any,
          missing_fields: DEFAULT_STATE.missing_fields as any,
          last_action_type: DEFAULT_STATE.last_action_type,
          last_action_payload: DEFAULT_STATE.last_action_payload as any
        } as any);

      if (insertError) {
        console.error('Error creating assistant state:', insertError);
      }

      return newState;
    }

    // Parse the JSONB fields properly
    return {
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
  } catch (error) {
    console.error('Error in getState:', error);
    return {
      user_id: userId,
      ...DEFAULT_STATE,
      updated_at: new Date().toISOString()
    };
  }
}

/**
 * Update partial state fields
 */
export async function patchState(
  userId: string, 
  patch: Partial<Omit<AssistantState, 'user_id' | 'updated_at'>>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('assistant_state')
      .upsert({
        user_id: userId,
        ...patch,
        updated_at: new Date().toISOString()
      } as any, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error patching assistant state:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in patchState:', error);
    return false;
  }
}

/**
 * Set active intent with payload and missing fields
 */
export async function setActiveIntent(
  userId: string,
  intent: ActiveIntent,
  payload: IntentPayload = {},
  missingFields: string[] = []
): Promise<boolean> {
  return patchState(userId, {
    active_intent: intent,
    intent_payload: payload,
    missing_fields: missingFields
  });
}

/**
 * Clear active intent (reset to NONE)
 */
export async function clearActiveIntent(userId: string): Promise<boolean> {
  return patchState(userId, {
    active_intent: 'NONE',
    intent_payload: {},
    missing_fields: []
  });
}

/**
 * Update intent payload (merge with existing)
 */
export async function updateIntentPayload(
  userId: string,
  payloadUpdate: Partial<IntentPayload>
): Promise<boolean> {
  const state = await getState(userId);
  const newPayload = { ...state.intent_payload, ...payloadUpdate };
  
  // Remove fields from missing_fields if they're now provided
  const newMissingFields = state.missing_fields.filter(
    field => !(field in payloadUpdate) || payloadUpdate[field as keyof IntentPayload] === undefined
  );

  return patchState(userId, {
    intent_payload: newPayload,
    missing_fields: newMissingFields
  });
}

/**
 * Set last action (for "eliminali" context)
 */
export async function setLastAction(
  userId: string,
  type: LastActionType,
  payload: LastActionPayload = {}
): Promise<boolean> {
  return patchState(userId, {
    last_action_type: type,
    last_action_payload: payload
  });
}

/**
 * Clear last action
 */
export async function clearLastAction(userId: string): Promise<boolean> {
  return patchState(userId, {
    last_action_type: 'NONE',
    last_action_payload: {}
  });
}

/**
 * Check if there's an active intent
 */
export function hasActiveIntent(state: AssistantState): boolean {
  return state.active_intent !== 'NONE';
}

/**
 * Check if intent payload is complete for the given intent
 */
export function isPayloadComplete(state: AssistantState): boolean {
  const { active_intent, intent_payload } = state;

  switch (active_intent) {
    case 'CREATE_TASK':
      return !!intent_payload.title;
    
    case 'CREATE_EVENT':
      return !!intent_payload.title && !!intent_payload.start_at;
    
    case 'CREATE_GENERIC':
      return false; // Always needs clarification
    
    default:
      return true;
  }
}

/**
 * Get what fields are still missing for the current intent
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
      if (!intent_payload.start_at) {
        if (!intent_payload.date) missing.push('date');
        if (!intent_payload.time) missing.push('time');
      }
      break;
    
    case 'CREATE_GENERIC':
      missing.push('type'); // Need to know if task or event
      break;
  }

  return missing;
}
