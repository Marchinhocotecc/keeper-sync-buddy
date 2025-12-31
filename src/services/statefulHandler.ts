/**
 * Stateful Assistant Handler
 * 
 * Manages conversational state with Supabase persistence.
 * Handles follow-ups deterministically without external AI.
 * 
 * INVARIANTS (NON-NEGOTIABLE):
 * 1. NEVER return empty string or null
 * 2. Confirmation words (no/sì/ok) NEVER create actions
 * 3. "elimina" commands NEVER become CREATE_GENERIC
 * 4. Quick actions (buttons) NEVER become free text
 * 5. If we don't know what to do, ask a safe clarifying question
 * 
 * FLOW:
 * 1. CONFIRMATION PRE-PARSER (cancel/confirm/quick actions)
 * 2. Load state from Supabase
 * 3. If active intent exists → handle as follow-up
 * 4. If no active intent → parse new intent
 * 5. Execute actions or ask for missing data
 * 6. Save state back to Supabase
 */

import { format, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { 
  parseConfirmation, 
  parseUIAction,
  UI_ACTION_PREFIX,
  isSafetyWord,
  isCancelSafetyWord,
  isConfirmSafetyWord,
  isCancelPattern,
  getCancelResponse, 
  getConfirmNoIntentResponse,
  getNegativeFeedbackResponse,
  normalizeTitle,
  detectBulkDeleteTarget,
  type ConfirmationWithContinuation
} from '@/assistant/confirmationParser';

// ========== CONVERSATION GATE CONSTANTS ==========
/**
 * Proactive response shown when the Conversation Gate activates.
 * This is returned when no active intent and message is not an explicit command.
 * INVARIANT: This response does NOT trigger any DB writes.
 */
const CONVERSATION_GATE_RESPONSE = {
  message: 'Ok 🙂 cosa vuoi fare?',
  suggestions: [
    '📋 Mostra task',
    '➕ Aggiungi task', 
    '📅 Crea evento',
    '💸 Registra spesa'
  ],
  // These are the structured UI actions that bypass NLP
  uiActions: {
    'Mostra task': '__UI_ACTION__:SHOW_TASKS',
    'Aggiungi task': '__UI_ACTION__:ADD_TASK',
    'Crea evento': '__UI_ACTION__:CREATE_EVENT',
    'Registra spesa': '__UI_ACTION__:ADD_EXPENSE'
  }
};

/**
 * isExplicitCommand - Determines if a message is an explicit command.
 * Returns TRUE if the message contains action verbs, explicit targets, or is a UI action.
 * 
 * CRITICAL: Time patterns like "8:30" should NOT trigger expense classification.
 * 
 * @param text - The user input to check
 * @returns true if this is an explicit command, false otherwise
 */
export function isExplicitCommand(text: string): boolean {
  const lower = text.trim().toLowerCase();
  
  // UI_ACTION commands are ALWAYS explicit
  if (text.startsWith(UI_ACTION_PREFIX)) {
    return true;
  }
  
  // Action verbs (whole word match, case-insensitive)
  const ACTION_VERBS = /\b(?:crea|aggiungi|segna|registra|elimina|cancella|mostra|vedi|lista|completa|spunta|rimuovi|togli|nuovo|nuova)\b/i;
  if (ACTION_VERBS.test(lower)) {
    return true;
  }
  
  // Explicit targets (task, evento, spesa, etc.)
  const EXPLICIT_TARGETS = /\b(?:task|tasks|evento|eventi|spesa|spese|budget|appuntamento|appuntamenti)\b/i;
  if (EXPLICIT_TARGETS.test(lower)) {
    return true;
  }
  
  // Check for amount patterns (expense-like) BUT exclude pure time patterns
  // Time pattern: 8:30, 08:30, 14:00
  const TIME_PATTERN = /\b\d{1,2}:\d{2}\b/;
  const AMOUNT_PATTERN = /€\s*\d+|\d+\s*(?:€|euro|eur)/i;
  
  // If message has amount pattern AND is not just a time → explicit
  if (AMOUNT_PATTERN.test(lower) && !TIME_PATTERN.test(lower.replace(AMOUNT_PATTERN, ''))) {
    return true;
  }
  
  return false;
}

// ========== ADVICE FOLLOW-UP PATTERNS ==========
// Detect consent+action patterns after ADVICE (e.g., "ok, pianifichiamo")
const ADVICE_FOLLOWUP_PATTERNS = [
  /^(?:ok|okay|va\s*bene|s[iì]|perfetto|certo)\s*,?\s*(?:pianifichiamo|facciamolo|andiamo|procediamo|iniziamo)/i,
  /^pianifichiamo$/i,
  /^facciamolo$/i,
  /^andiamo$/i,
  /^procediamo$/i,
  /^iniziamo$/i,
];

/**
 * isAdviceFollowUp - Detects consent+action patterns after ADVICE
 */
export function isAdviceFollowUp(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return ADVICE_FOLLOWUP_PATTERNS.some(p => p.test(lower));
}

// ========== STOPWORDS FOR TITLE VALIDATION ==========
// These words alone are NOT valid titles - must ask for real title
const ITALIAN_STOPWORDS = [
  'una', 'un', 'uno', 'il', 'lo', 'la', 'i', 'gli', 'le',
  'questa', 'questo', 'quello', 'quella', 'questi', 'queste',
  'quelli', 'quelle', 'mio', 'mia', 'miei', 'mie'
];

/**
 * isValidTitle - Checks if extracted title is meaningful (not just a stopword)
 */
export function isValidTitle(title: string): boolean {
  const cleaned = title.trim().toLowerCase();
  
  // Empty or too short
  if (cleaned.length < 2) return false;
  
  // Pure stopword
  if (ITALIAN_STOPWORDS.includes(cleaned)) return false;
  
  // Just "task" or "evento" without content
  if (/^(?:task|evento|appuntamento)$/i.test(cleaned)) return false;
  
  return true;
}

/**
 * extractTitleFromMessage - Extracts meaningful title, filtering stopwords
 */
export function extractTitleFromMessage(message: string, intentType: 'task' | 'event'): string | null {
  let text = message.trim();
  
  // Remove common prefixes
  text = text
    .replace(/^(?:crea|aggiungi|nuovo|nuova|inserisci|metti)\s+/i, '')
    .replace(/^(?:un|una|il|la|lo)\s+/i, '')
    .replace(/^task\s*/i, '')
    .replace(/^(?:evento|appuntamento)\s*/i, '')
    .replace(/^[:\-–]\s*/, '')
    .trim();
  
  // If what remains is empty or a stopword, return null
  if (!isValidTitle(text)) {
    return null;
  }
  
  // Capitalize first letter
  return text.charAt(0).toUpperCase() + text.slice(1);
}
import {
  getState,
  setActiveIntent,
  clearActiveIntent,
  updateIntentPayload,
  setLastAction,
  hasActiveIntent,
  isPayloadComplete,
  getMissingFields,
  type AssistantState,
  type ActiveIntent,
  type IntentPayload
} from '@/services/assistantStateService';
import {
  classifyFollowUp,
  extractDate,
  extractTime,
  buildDateTime,
  type FollowUpType
} from '@/services/followUpClassifier';
import * as dataService from '@/services/dataService';
// CRITICAL: Import legacy pending intent management for full cleanup
import { clearPendingIntent as clearLegacyPendingIntent } from '@/assistant/contextStore';

export interface StatefulResponse {
  message: string;
  source: 'local' | 'stateful';
  suggestions?: string[];
  actionExecuted?: boolean;
  actionResult?: { success: boolean; data?: any };
}

// Intent patterns for initial classification
const CREATE_PATTERNS = [
  /^(crea|aggiungi|nuovo|inserisci|metti)\s+(.+)/i,
  /^(ricordami\s+di|devo)\s+(.+)/i
];

const QUERY_TASK_PATTERNS = [
  /mostra.*(task|cose da fare|to.?do)/i,
  /(i miei|lista|elenco)\s*task/i,
  /cosa (devo|ho da) fare/i,
  /quanti task/i
];

const QUERY_EVENT_PATTERNS = [
  /mostra.*(eventi|calendario|appuntamenti)/i,
  /cosa ho in programma/i,
  /eventi.*(oggi|domani|settimana)/i
];

// Delete/manage patterns - NEVER CREATE_GENERIC
const DELETE_MANAGE_PATTERNS = [
  /(?:elimina|cancella|rimuovi|togli|chiudi|spunta|completa)/i
];

// Bulk delete patterns - require confirmation
const BULK_DELETE_PATTERNS = [
  /(?:elimina|cancella|rimuovi)\s+(?:tutt[eio]|tutti)\s+(?:i\s+)?task/i,
  /(?:elimina|cancella|rimuovi)\s+(?:tutt[eio]|tutti)\s+(?:gli\s+)?eventi/i,
  /(?:elimina|cancella|rimuovi)\s+(?:tutt[eio]|tutte)\s+(?:le\s+)?spese/i,
];

// Import centralized constants
import { SAFE_FALLBACK_MESSAGE } from '@/assistant/constants';

// Bulk delete patterns - require confirmation
const BULK_DELETE_ALL_PATTERNS = [
  { pattern: /(?:elimina|cancella|rimuovi)\s+(?:tutt[eio]|tutti)\s+(?:i\s+)?task/i, type: 'tasks' },
  { pattern: /(?:elimina|cancella|rimuovi)\s+(?:tutt[eio]|tutti)\s+(?:gli\s+)?eventi/i, type: 'events' },
  { pattern: /(?:elimina|cancella|rimuovi)\s+(?:tutt[eio]|tutte)\s+(?:le\s+)?spese/i, type: 'expenses' },
];

/**
 * CRITICAL: Clear ALL assistant state (stateful + legacy)
 * This is the ONLY function that should be called when user says "no/cancel"
 * It ensures NO pending data leaks to the next message
 * 
 * INVARIANT: After this function, there MUST be no pending intent anywhere
 */
export async function clearAllAssistantState(userId: string): Promise<void> {
  console.log('[StatefulHandler] ===== CLEARING ALL STATE =====');
  console.log('[StatefulHandler] User:', userId);
  
  // 1. Clear Supabase stateful state (active_intent + intent_payload)
  try {
    await clearActiveIntent(userId);
    console.log('[StatefulHandler] Supabase state cleared');
  } catch (e) {
    console.error('[StatefulHandler] Error clearing Supabase state:', e);
  }
  
  // 2. Clear legacy in-memory pending intent
  try {
    clearLegacyPendingIntent(userId);
    console.log('[StatefulHandler] Legacy pending intent cleared');
  } catch (e) {
    console.error('[StatefulHandler] Error clearing legacy state:', e);
  }
  
  console.log('[StatefulHandler] ===== ALL STATE CLEARED =====');
}

/**
 * Main stateful message handler
 * 
 * INVARIANT: NEVER returns empty string
 */
export async function handleStatefulMessage(
  userId: string,
  message: string
): Promise<StatefulResponse> {
  console.log('[StatefulHandler] Processing:', message);
  
  // ===== PHASE -1: CONFIRMATION PRE-PARSER (ABSOLUTE FIRST) =====
  const confirmResult = parseConfirmation(message) as ConfirmationWithContinuation;
  console.log('[StatefulHandler] Confirmation parse result:', JSON.stringify(confirmResult));
  
  if (confirmResult.shouldBypass) {
    console.log('[StatefulHandler] Confirmation detected:', confirmResult.type);
    
    if (confirmResult.type === 'CANCEL') {
      // CRITICAL: Clear ALL state (stateful + legacy) - NO DATA LEAKAGE
      // This MUST happen BEFORE any processing
      console.log('[StatefulHandler] CANCEL detected - clearing ALL state FIRST');
      await clearAllAssistantState(userId);
      
      // If there's a continuation (e.g., "no, consigliami cosa fare oggi")
      // Process the continuation as a NEW message (with fully cleared state)
      if (confirmResult.continuation && confirmResult.continuation.length > 2) {
        console.log('[StatefulHandler] Processing continuation AFTER state cleared:', confirmResult.continuation);
        // INVARIANT: State is already cleared, so no pending data will leak
        // Process continuation as completely fresh message
        return await handleStatefulMessage(userId, confirmResult.continuation);
      }
      
      // No continuation - just return cancel response
      console.log('[StatefulHandler] CANCEL complete - returning ok annullato');
      return { message: getCancelResponse(), source: 'stateful' };
    }
    
    // Load state for other confirmation types
    const state = await getState(userId);
    
    if (confirmResult.type === 'NEGATIVE_FEEDBACK') {
      // User is frustrated - acknowledge and reset
      await clearAllAssistantState(userId);
      return { message: getNegativeFeedbackResponse(), source: 'stateful' };
    }
    
    if (confirmResult.type === 'QUICK_ACTION') {
      // Handle quick action directly - NEVER let it become CREATE_GENERIC
      console.log('[StatefulHandler] Quick action:', confirmResult.quickAction);
      return await handleQuickAction(userId, confirmResult.quickAction!, state);
    }
    
    if (confirmResult.type === 'UI_ACTION') {
      // UI_ACTION: Structured payload from UI buttons - bypass ALL NLP
      // These come from AssistantPanel quick action buttons
      console.log('[StatefulHandler] UI_ACTION detected:', confirmResult.quickAction);
      return await handleQuickAction(userId, confirmResult.quickAction!, state);
    }
    
    if (confirmResult.type === 'CONFIRM') {
      if (hasActiveIntent(state)) {
        // Let the follow-up handler process the confirmation
        console.log('[StatefulHandler] Confirm with active intent:', state.active_intent);
        return await handleFollowUp(userId, message, state);
      } else {
        // No active intent - safe response
        return { message: getConfirmNoIntentResponse(), source: 'stateful' };
      }
    }
  }
  
  // ===== PHASE 0: SAFETY WORD CHECK (CRITICAL - BEFORE ANY INTENT CLASSIFICATION) =====
  // These words should NEVER create tasks/events/expenses
  if (isSafetyWord(message)) {
    console.log('[StatefulHandler] Safety word detected:', message);
    const state = await getState(userId);
    
    // If there's an active intent, clear it
    if (hasActiveIntent(state)) {
      await clearAllAssistantState(userId);
    }
    
    // Return appropriate response based on word type
    if (isCancelSafetyWord(message)) {
      return { message: getCancelResponse(), source: 'stateful' };
    }
    if (isConfirmSafetyWord(message)) {
      return { message: getConfirmNoIntentResponse(), source: 'stateful' };
    }
    
    // Fallback for any other safety word
    return { message: getConfirmNoIntentResponse(), source: 'stateful' };
  }
  
  // Load current state from Supabase
  const state = await getState(userId);
  console.log('[StatefulHandler] Current state:', state.active_intent);
  
  // ===== ADVICE FOLLOW-UP CHECK (BEFORE CONVERSATION GATE) =====
  // If last action was ADVICE and user responds with consent+action pattern
  // → start CREATE_GENERIC flow (task or event choice)
  if (
    state.last_action_type === 'ADVICE' &&
    isAdviceFollowUp(message)
  ) {
    console.log('[StatefulHandler] ADVICE follow-up detected - starting task/event choice');
    await setActiveIntent(userId, 'CREATE_GENERIC', {}, ['type']);
    return {
      message: 'Perfetto 🙂 task o evento?',
      source: 'stateful',
      suggestions: ['Task', 'Evento']
    };
  }
  
  // ===== CONVERSATION GATE (BEFORE ANY INTENT ROUTING) =====
  // Activates when: no active intent, message is not explicit command, and parseConfirmation returned NONE
  // Result: Proactive menu with 4 options, NO DB writes
  if (
    !hasActiveIntent(state) &&
    confirmResult.type === 'NONE' &&
    !confirmResult.shouldBypass &&
    !isExplicitCommand(message)
  ) {
    console.log('[StatefulHandler] CONVERSATION GATE activated - returning proactive menu');
    return {
      message: CONVERSATION_GATE_RESPONSE.message,
      source: 'stateful',
      suggestions: CONVERSATION_GATE_RESPONSE.suggestions
    };
  }
  
  // ===== PHASE 0.5: Check for BULK DELETE WITH TARGET (ABSOLUTE PRIORITY) =====
  // This MUST come BEFORE active_intent check - "elimina tutte le task" must ALWAYS work
  const bulkTarget = detectBulkDeleteTarget(message);
  if (bulkTarget) {
    console.log('[StatefulHandler] Bulk target detected (PRIORITY):', bulkTarget);
    
    // Clear any existing intent - bulk action takes priority
    if (hasActiveIntent(state)) {
      console.log('[StatefulHandler] Clearing existing intent for bulk action');
      await clearActiveIntent(userId);
    }
    
    if (bulkTarget.action === 'query') {
      // "tutte le task" - show tasks
      return await handleQueryTasks(userId);
    }
    
    if (bulkTarget.action === 'complete') {
      return await handleBulkCompleteRequest(userId, 'tasks', state);
    }
    
    return await handleBulkDeleteRequest(userId, bulkTarget.type, state);
  }
  
  // Legacy bulk delete patterns (fallback)
  for (const { pattern, type } of BULK_DELETE_ALL_PATTERNS) {
    if (pattern.test(message)) {
      console.log('[StatefulHandler] Bulk delete detected for:', type);
      if (hasActiveIntent(state)) {
        await clearActiveIntent(userId);
      }
      return await handleBulkDeleteRequest(userId, type, state);
    }
  }
  
  // ===== PHASE 0.6: Check for "eliminali" with context =====
  if (/^eliminali?$/i.test(message.trim()) || /^cancellali?$/i.test(message.trim())) {
    console.log('[StatefulHandler] "eliminali" detected, checking context');
    const targetType = state.last_action_type === 'SHOW_EVENTS' ? 'events' 
                     : state.last_action_type === 'SHOW_EXPENSES' ? 'expenses' 
                     : state.last_action_type === 'SHOW_TASKS' ? 'tasks'
                     : null;
    
    if (targetType) {
      console.log('[StatefulHandler] "eliminali" with context:', targetType);
      // Clear any existing intent
      if (hasActiveIntent(state)) {
        await clearActiveIntent(userId);
      }
      return await handleBulkDeleteRequest(userId, targetType, state);
    }
    // No context - will fall through to ask what to delete
  }
  
  // ===== PHASE 1: Check for active intent =====
  if (hasActiveIntent(state)) {
    console.log('[StatefulHandler] Handling follow-up for:', state.active_intent);
    const response = await handleFollowUp(userId, message, state);
    
    // INVARIANT: Never return empty
    if (!response.message || response.message.trim() === '') {
      console.log('[StatefulHandler] Follow-up returned empty, using safe fallback');
      return { message: SAFE_FALLBACK_MESSAGE, source: 'stateful' };
    }
    
    return response;
  }
  
  // ===== PHASE 2: Check for delete/manage commands =====
  if (DELETE_MANAGE_PATTERNS.some(p => p.test(message))) {
    console.log('[StatefulHandler] Delete/manage command detected');
    return await handleDeleteCommand(userId, message, state);
  }
  
  // ===== PHASE 3: Classify new intent =====
  const intentResult = classifyNewIntent(message);
  console.log('[StatefulHandler] New intent:', intentResult.intent);
  
  // ===== PHASE 4: Route based on intent =====
  const response = await routeIntent(userId, message, intentResult);
  
  // INVARIANT: Never return empty
  if (!response.message || response.message.trim() === '') {
    console.log('[StatefulHandler] Route returned empty, using safe fallback');
    return { message: SAFE_FALLBACK_MESSAGE, source: 'stateful' };
  }
  
  return response;
}

/**
 * Handle quick action buttons (NEVER create task/event from these)
 */
async function handleQuickAction(
  userId: string,
  action: string,
  state: AssistantState
): Promise<StatefulResponse> {
  console.log('[StatefulHandler] Handling quick action:', action);
  
  switch (action) {
    case 'SHOW_TASKS': {
      const tasks = await dataService.listTasks(userId);
      if (tasks.length === 0) {
        return { message: '✅ Non hai task in sospeso.', source: 'stateful' };
      }
      const taskList = tasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n');
      await setActiveIntent(userId, 'MANAGE_TASKS', { lastShownIds: tasks.map(t => t.id) }, []);
      await setLastAction(userId, 'SHOW_TASKS', { ids: tasks.map(t => t.id) });
      return {
        message: `📋 I tuoi task (${tasks.length}):\n${taskList}`,
        source: 'stateful',
        suggestions: ['Completa uno', 'Elimina uno']
      };
    }
    
    case 'SHOW_EVENTS': {
      const events = await dataService.listEvents(userId);
      if (events.length === 0) {
        return { message: '✅ Non hai eventi in programma.', source: 'stateful' };
      }
      const eventList = events.map((e, i) => `${i + 1}. ${e.title}`).join('\n');
      await setActiveIntent(userId, 'MANAGE_EVENTS', { lastShownIds: events.map(e => e.id) }, []);
      await setLastAction(userId, 'SHOW_EVENTS', { ids: events.map(e => e.id) });
      return {
        message: `📅 I tuoi eventi (${events.length}):\n${eventList}`,
        source: 'stateful',
        suggestions: ['Elimina uno']
      };
    }
    
    case 'SHOW_EXPENSES': {
      const expenses = await dataService.listExpenses(userId);
      if (expenses.length === 0) {
        return { message: '✅ Non hai spese registrate.', source: 'stateful' };
      }
      const expenseList = expenses.slice(0, 10).map((e, i) => `${i + 1}. ${e.category || 'Spesa'}: €${e.amount}`).join('\n');
      await setActiveIntent(userId, 'MANAGE_EXPENSES', { lastShownIds: expenses.map(e => e.id) }, []);
      await setLastAction(userId, 'SHOW_EXPENSES', { ids: expenses.map(e => e.id) });
      return {
        message: `💰 Le tue spese recenti:\n${expenseList}`,
        source: 'stateful',
        suggestions: ['Elimina una']
      };
    }
    
    case 'DELETE_ONE': {
      // Check last action to know what to delete
      if (state.last_action_type === 'SHOW_TASKS') {
        const ids = (state.last_action_payload as any)?.ids || [];
        if (ids.length > 0) {
          // Delete the first one
          await dataService.deleteTask(userId, ids[0]);
          await clearActiveIntent(userId);
          return { 
            message: '✅ Task eliminato.', 
            source: 'stateful',
            actionExecuted: true 
          };
        }
      }
      if (state.last_action_type === 'SHOW_EVENTS') {
        const ids = (state.last_action_payload as any)?.ids || [];
        if (ids.length > 0) {
          await dataService.deleteEvent(userId, ids[0]);
          await clearActiveIntent(userId);
          return { 
            message: '✅ Evento eliminato.', 
            source: 'stateful',
            actionExecuted: true 
          };
        }
      }
      // No context - ask what to delete
      return {
        message: '❓ Cosa vuoi eliminare: un task, un evento o una spesa?',
        source: 'stateful',
        suggestions: ['Mostra task', 'Mostra eventi', 'Mostra spese']
      };
    }
    
    case 'COMPLETE_ONE': {
      if (state.last_action_type === 'SHOW_TASKS') {
        const ids = (state.last_action_payload as any)?.ids || [];
        if (ids.length > 0) {
          await dataService.completeTask(userId, ids[0]);
          await clearActiveIntent(userId);
          return { 
            message: '✅ Task completato!', 
            source: 'stateful',
            actionExecuted: true 
          };
        }
      }
      // No context - show tasks first
      const tasks = await dataService.listTasks(userId);
      if (tasks.length === 0) {
        return { message: '✅ Non hai task da completare.', source: 'stateful' };
      }
      const taskList = tasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n');
      await setActiveIntent(userId, 'MANAGE_TASKS', { lastShownIds: tasks.map(t => t.id) }, []);
      await setLastAction(userId, 'SHOW_TASKS', { ids: tasks.map(t => t.id) });
      return {
        message: `📋 Quale task vuoi completare?\n${taskList}`,
        source: 'stateful'
      };
    }
    
    // ========== CREATION FLOW STARTERS (from Conversation Gate & buttons) ==========
    case 'CREATE_TASK':
    case 'ADD_TASK':
      await setActiveIntent(userId, 'CREATE_TASK', {}, ['title']);
      return { message: 'Cosa devi fare?', source: 'stateful' };
    
    case 'CREATE_EVENT':
      await setActiveIntent(userId, 'CREATE_EVENT', {}, ['title', 'date', 'time']);
      return { message: 'Come si chiama l\'evento e quando?', source: 'stateful' };
    
    case 'ADD_EXPENSE':
      // Use CREATE_GENERIC with expense type pre-selected for expense flow
      await setActiveIntent(userId, 'CREATE_GENERIC', { type: 'expense' }, ['amount']);
      return { message: 'Quanto hai speso e per cosa?', source: 'stateful' };
    
    // ========== BULK ACTIONS ==========
    case 'DELETE_ALL':
    case 'DELETE_ALL_TASKS': {
      // Use last action context if available, otherwise default to tasks
      const targetType = state.last_action_type === 'SHOW_EVENTS' ? 'events' 
                       : state.last_action_type === 'SHOW_EXPENSES' ? 'expenses' 
                       : 'tasks';
      return await handleBulkDeleteRequest(userId, targetType, state);
    }
    
    case 'DELETE_ALL_EVENTS':
      return await handleBulkDeleteRequest(userId, 'events', state);
    
    case 'DELETE_ALL_EXPENSES':
      return await handleBulkDeleteRequest(userId, 'expenses', state);
    
    case 'COMPLETE_ALL':
    case 'COMPLETE_ALL_TASKS':
      return await handleBulkCompleteRequest(userId, 'tasks', state);
    
    case 'DELETE_THESE': {
      // "eliminali" - use context from last action
      if (state.last_action_type === 'SHOW_TASKS') {
        return await handleBulkDeleteRequest(userId, 'tasks', state);
      }
      if (state.last_action_type === 'SHOW_EVENTS') {
        return await handleBulkDeleteRequest(userId, 'events', state);
      }
      if (state.last_action_type === 'SHOW_EXPENSES') {
        return await handleBulkDeleteRequest(userId, 'expenses', state);
      }
      // No context - ask
      return {
        message: '❓ Cosa vuoi eliminare: task, eventi o spese?',
        source: 'stateful',
        suggestions: ['Mostra task', 'Mostra eventi', 'Mostra spese']
      };
    }
    
    default:
      return { message: SAFE_FALLBACK_MESSAGE, source: 'stateful' };
  }
}

/**
 * Handle bulk delete requests with confirmation
 * GRAMMAR: Proper singular/plural in Italian
 */
async function handleBulkDeleteRequest(
  userId: string,
  type: string,
  state: AssistantState
): Promise<StatefulResponse> {
  // Get count of items
  let count = 0;
  let itemNameSingular = '';
  let itemNamePlural = '';
  
  switch (type) {
    case 'tasks': {
      const tasks = await dataService.listTasks(userId);
      count = tasks.length;
      itemNameSingular = 'task';
      itemNamePlural = 'task';
      break;
    }
    case 'events': {
      const events = await dataService.listEvents(userId);
      count = events.length;
      itemNameSingular = 'evento';
      itemNamePlural = 'eventi';
      break;
    }
    case 'expenses': {
      const expenses = await dataService.listExpenses(userId);
      count = expenses.length;
      itemNameSingular = 'spesa';
      itemNamePlural = 'spese';
      break;
    }
  }
  
  // N=0: "Nessun task da eliminare."
  if (count === 0) {
    const noItemText = type === 'expenses' ? `Nessuna ${itemNameSingular}` : `Nessun ${itemNameSingular}`;
    return { message: `✅ ${noItemText} da eliminare.`, source: 'stateful' };
  }
  
  // Set pending confirmation state
  await setActiveIntent(userId, 'CONFIRM_BULK_DELETE', { deleteType: type as 'tasks' | 'events' | 'expenses', count }, []);
  
  // N=1: "Vuoi eliminare 1 task?" / N>1: "Vuoi eliminare i 5 task?"
  const itemText = count === 1 ? `1 ${itemNameSingular}` : `${count} ${itemNamePlural}`;
  
  return {
    message: `⚠️ Vuoi eliminare ${count === 1 ? '' : 'tutti '}${count === 1 ? 'il' : 'i'} ${itemText}? Scrivi "sì" per confermare o "no" per annullare.`,
    source: 'stateful'
  };
}

/**
 * Handle bulk complete requests with confirmation
 */
async function handleBulkCompleteRequest(
  userId: string,
  type: string,
  state: AssistantState
): Promise<StatefulResponse> {
  if (type !== 'tasks') {
    return { message: 'Solo i task possono essere completati.', source: 'stateful' };
  }
  
  const tasks = await dataService.listTasks(userId);
  const count = tasks.length;
  
  if (count === 0) {
    return { message: '✅ Non hai task da completare.', source: 'stateful' };
  }
  
  // Set pending confirmation state for complete
  await setActiveIntent(userId, 'CONFIRM_BULK_COMPLETE', { deleteType: 'tasks' as const, count }, []);
  
  return {
    message: `⚠️ Vuoi completare ${count === 1 ? 'il' : 'tutti i'} ${count} task? Scrivi "sì" per confermare o "no" per annullare.`,
    source: 'stateful'
  };
}

interface IntentClassification {
  intent: ActiveIntent;
  payload: IntentPayload;
  missingFields: string[];
}

/**
 * Classify a new message (when no active intent)
 * CRITICAL: Uses robust title extraction to avoid "una", "un" as titles
 */
function classifyNewIntent(message: string): IntentClassification {
  const lower = message.toLowerCase().trim();
  
  // Query tasks
  if (QUERY_TASK_PATTERNS.some(p => p.test(lower))) {
    return { intent: 'QUERY_TASKS', payload: {}, missingFields: [] };
  }
  
  // Query events
  if (QUERY_EVENT_PATTERNS.some(p => p.test(lower))) {
    return { intent: 'QUERY_EVENTS', payload: {}, missingFields: [] };
  }
  
  // Create patterns
  for (const pattern of CREATE_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      const content = match[2]?.trim() || '';
      
      // Check if it specifies task or event
      if (/task/i.test(content)) {
        // Use robust title extraction
        const title = extractTitleFromMessage(content, 'task');
        return {
          intent: 'CREATE_TASK',
          payload: { title: title || undefined },
          missingFields: title ? [] : ['title']
        };
      }
      
      if (/evento|appuntamento/i.test(content)) {
        const title = extractTitleFromMessage(content, 'event');
        return {
          intent: 'CREATE_EVENT',
          payload: { title: title || undefined },
          missingFields: title ? ['date', 'time'] : ['title', 'date', 'time']
        };
      }
      
      // Generic create (user said "crea padel" without specifying type)
      // Validate content is meaningful
      const validTitle = isValidTitle(content) ? content : undefined;
      return {
        intent: 'CREATE_GENERIC',
        payload: { title: validTitle },
        missingFields: ['type']
      };
    }
  }
  
  return { intent: 'NONE', payload: {}, missingFields: [] };
}

/**
 * Handle follow-up message for active intent
 */
async function handleFollowUp(
  userId: string,
  message: string,
  state: AssistantState
): Promise<StatefulResponse> {
  const followUpType = classifyFollowUp(message);
  console.log('[StatefulHandler] Follow-up type:', followUpType);
  
  switch (state.active_intent) {
    case 'CREATE_GENERIC':
      return await handleCreateGenericFollowUp(userId, message, state, followUpType);
    
    case 'CREATE_TASK':
      return await handleCreateTaskFollowUp(userId, message, state, followUpType);
    
    case 'CREATE_EVENT':
      return await handleCreateEventFollowUp(userId, message, state, followUpType);
    
    case 'QUERY_TASKS':
    case 'MANAGE_TASKS':
      return await handleManageTasksFollowUp(userId, message, state, followUpType);
    
    case 'QUERY_EVENTS':
    case 'MANAGE_EVENTS':
      return await handleManageEventsFollowUp(userId, message, state, followUpType);
    
    case 'CONFIRM_BULK_DELETE':
      return await handleBulkDeleteConfirmation(userId, message, state, followUpType);
    
    case 'CONFIRM_BULK_COMPLETE':
      return await handleBulkCompleteConfirmation(userId, message, state, followUpType);
    
    default:
      // Unknown active intent, clear and process as new
      await clearActiveIntent(userId);
      return handleStatefulMessage(userId, message);
  }
}

/**
 * Handle confirmation for bulk delete
 * CRITICAL: Must respond to sì/no without loop
 */
async function handleBulkDeleteConfirmation(
  userId: string,
  message: string,
  state: AssistantState,
  followUpType: FollowUpType
): Promise<StatefulResponse> {
  const { deleteType, count } = state.intent_payload;
  console.log('[StatefulHandler] Bulk delete confirmation:', { deleteType, count, followUpType, message });
  
  // CRITICAL: Also check message directly for "sì" in case followUpType missed it
  const lower = message.trim().toLowerCase();
  const isConfirmYes = followUpType === 'CONFIRM_YES' || /^s[iì]$/i.test(lower) || /^ok$/i.test(lower);
  const isConfirmNo = followUpType === 'CONFIRM_NO' || /^no$/i.test(lower);
  
  if (isConfirmNo) {
    await clearAllAssistantState(userId);
    return { message: '✅ Ok, annullato.', source: 'stateful' };
  }
  
  if (isConfirmYes) {
    await clearActiveIntent(userId);
    
    switch (deleteType) {
      case 'tasks':
        await dataService.deleteAllTasks(userId);
        // N=1: "1 task eliminato." / N>1: "{N} task eliminati."
        return { 
          message: count === 0 ? '✅ Nessun task da eliminare.' :
                   count === 1 ? '✅ 1 task eliminato.' : 
                   `✅ ${count} task eliminati.`, 
          source: 'stateful',
          actionExecuted: true 
        };
      case 'events':
        await dataService.deleteAllEvents(userId);
        return { 
          message: count === 0 ? '✅ Nessun evento da eliminare.' :
                   count === 1 ? '✅ 1 evento eliminato.' : 
                   `✅ ${count} eventi eliminati.`, 
          source: 'stateful',
          actionExecuted: true 
        };
      case 'expenses':
        await dataService.deleteAllExpenses(userId);
        return { 
          message: count === 0 ? '✅ Nessuna spesa da eliminare.' :
                   count === 1 ? '✅ 1 spesa eliminata.' : 
                   `✅ ${count} spese eliminate.`, 
          source: 'stateful',
          actionExecuted: true 
        };
      default:
        await clearActiveIntent(userId);
        return { message: SAFE_FALLBACK_MESSAGE, source: 'stateful' };
    }
  }
  
  // User didn't say yes or no - ONE reminder only, then default to no
  const itemName = deleteType === 'tasks' ? 'task' : deleteType === 'events' ? 'evento/i' : 'spesa/e';
  return {
    message: `Scrivi "sì" per eliminare ${count === 1 ? 'il' : 'i'} ${count} ${itemName}, o "no" per annullare.`,
    source: 'stateful'
  };
}

/**
 * Handle confirmation for bulk complete
 * CRITICAL: Must respond to sì/no without loop
 */
async function handleBulkCompleteConfirmation(
  userId: string,
  message: string,
  state: AssistantState,
  followUpType: FollowUpType
): Promise<StatefulResponse> {
  const { count } = state.intent_payload;
  console.log('[StatefulHandler] Bulk complete confirmation:', { count, followUpType, message });
  
  // CRITICAL: Also check message directly for "sì" in case followUpType missed it
  const lower = message.trim().toLowerCase();
  const isConfirmYes = followUpType === 'CONFIRM_YES' || /^s[iì]$/i.test(lower) || /^ok$/i.test(lower);
  const isConfirmNo = followUpType === 'CONFIRM_NO' || /^no$/i.test(lower);
  
  if (isConfirmNo) {
    await clearAllAssistantState(userId);
    return { message: '✅ Ok, annullato.', source: 'stateful' };
  }
  
  if (isConfirmYes) {
    await clearActiveIntent(userId);
    await dataService.completeAllTasks(userId);
    return { 
      message: `✅ ${count === 1 ? 'Task completato' : `Tutti i ${count} task completati`}!`, 
      source: 'stateful',
      actionExecuted: true 
    };
  }
  
  // User didn't say yes or no - ONE reminder only
  return {
    message: `Scrivi "sì" per completare ${count === 1 ? 'il' : `i ${count}`} task, o "no" per annullare.`,
    source: 'stateful'
  };
}

/**
 * Handle follow-up for CREATE_GENERIC (user said "crea X", need to know task/event)
 * Also handles expense flow when type='expense' is pre-set from Conversation Gate
 * 
 * CRITICAL: "task" or "evento" replies MUST complete the choice, not re-route to menu
 */
async function handleCreateGenericFollowUp(
  userId: string,
  message: string,
  state: AssistantState,
  followUpType: FollowUpType
): Promise<StatefulResponse> {
  const title = state.intent_payload.title || '';
  const presetType = state.intent_payload.type;
  const lower = message.trim().toLowerCase();
  
  console.log('[StatefulHandler] CREATE_GENERIC follow-up:', { title, presetType, followUpType, message: lower });
  
  // If type is pre-set as 'expense' (from Conversation Gate ADD_EXPENSE)
  if (presetType === 'expense') {
    // Try to extract amount from message
    const amountMatch = message.match(/(\d+(?:[.,]\d{1,2})?)/);
    if (amountMatch) {
      const amount = parseFloat(amountMatch[1].replace(',', '.'));
      // Try to extract category from remaining text
      const category = message.replace(amountMatch[0], '').replace(/€|euro|eur/gi, '').trim() || 'Altro';
      
      try {
        await dataService.createExpense(userId, amount, category);
        await clearActiveIntent(userId);
        return {
          message: `✅ Registrata spesa di €${amount.toFixed(2)} per "${category}".`,
          source: 'stateful',
          actionExecuted: true
        };
      } catch (e) {
        console.error('[StatefulHandler] Error creating expense:', e);
        return { message: 'Errore nel registrare la spesa.', source: 'stateful' };
      }
    }
    
    // No amount found - ask again
    return { message: 'Inserisci l\'importo (es: "15 euro pranzo")', source: 'stateful' };
  }
  
  // ========== CRITICAL: Check for "task" or "evento" FIRST (disambiguation) ==========
  // This MUST come before followUpType switch to ensure "task"/"evento" always work
  if (/^task$/i.test(lower) || followUpType === 'CHOOSE_TASK') {
    console.log('[StatefulHandler] User chose TASK');
    // If we have a valid title, create immediately
    if (title && isValidTitle(title)) {
      return await executeCreateTask(userId, title);
    }
    // No title or invalid title - ask for it
    await setActiveIntent(userId, 'CREATE_TASK', {}, ['title']);
    return { message: 'Che titolo?', source: 'stateful' };
  }
  
  if (/^(?:evento|appuntamento)$/i.test(lower) || followUpType === 'CHOOSE_EVENT') {
    console.log('[StatefulHandler] User chose EVENT');
    // If we have a valid title, ask for when
    if (title && isValidTitle(title)) {
      await setActiveIntent(userId, 'CREATE_EVENT', { title }, ['date', 'time']);
      return { message: 'Quando? (es. "venerdì 18:30")', source: 'stateful' };
    }
    // No title - ask for event details
    await setActiveIntent(userId, 'CREATE_EVENT', {}, ['title', 'date', 'time']);
    return { message: 'Come si chiama l\'evento e quando?', source: 'stateful' };
  }
  
  switch (followUpType) {
    case 'CONFIRM_YES':
      // "sì" without context - default to task if we have title
      if (title && isValidTitle(title)) {
        return await executeCreateTask(userId, title);
      }
      await setActiveIntent(userId, 'CREATE_TASK', {}, ['title']);
      return { message: 'Cosa vuoi aggiungere come task?', source: 'stateful' };
    
    case 'CONFIRM_NO':
      await clearActiveIntent(userId);
      return { message: 'Ok, lasciamo stare.', source: 'stateful' };
    
    default:
      // Check if message contains "task" or "evento" (not standalone)
      if (/task/i.test(lower)) {
        // Try to extract title from the message
        const extractedTitle = extractTitleFromMessage(message, 'task');
        if (extractedTitle) {
          return await executeCreateTask(userId, extractedTitle);
        }
        await setActiveIntent(userId, 'CREATE_TASK', {}, ['title']);
        return { message: 'Che titolo?', source: 'stateful' };
      }
      if (/evento|appuntamento/i.test(lower)) {
        const extractedTitle = extractTitleFromMessage(message, 'event');
        await setActiveIntent(userId, 'CREATE_EVENT', { title: extractedTitle || undefined }, ['date', 'time']);
        return { message: 'Quando?', source: 'stateful' };
      }
      
      // Still unclear - repeat the question
      return {
        message: 'Task o evento?',
        source: 'stateful',
        suggestions: ['Task', 'Evento']
      };
  }
}

/**
 * Handle follow-up for CREATE_TASK
 * CRITICAL: Validate title is meaningful (not just "una", "un", etc.)
 */
async function handleCreateTaskFollowUp(
  userId: string,
  message: string,
  state: AssistantState,
  followUpType: FollowUpType
): Promise<StatefulResponse> {
  let title = state.intent_payload.title;
  
  switch (followUpType) {
    case 'CONFIRM_NO':
      await clearActiveIntent(userId);
      return { message: 'Ok, annullato.', source: 'stateful' };
    
    case 'CONFIRM_YES':
      if (title && isValidTitle(title)) {
        return await executeCreateTask(userId, title);
      }
      return { message: 'Che titolo?', source: 'stateful' };
    
    default:
      // Try to use the message as title
      const extractedTitle = extractTitleFromMessage(message, 'task');
      
      if (extractedTitle) {
        return await executeCreateTask(userId, extractedTitle);
      }
      
      // Invalid or empty title - ask again
      return { message: 'Che titolo?', source: 'stateful' };
  }
}

/**
 * Handle follow-up for CREATE_EVENT
 * 
 * MERGE LOGIC:
 * - PROVIDE_DATETIME: extract both date & time, complete if possible
 * - PROVIDE_DATE: store in pending_date, ask for time if missing
 * - PROVIDE_TIME: store in pending_time, ask for date if missing
 * - When both pending_date + pending_time exist, merge to start_at
 */
async function handleCreateEventFollowUp(
  userId: string,
  message: string,
  state: AssistantState,
  followUpType: FollowUpType
): Promise<StatefulResponse> {
  const payload = { ...state.intent_payload };
  
  // Helper to merge pending date/time into start_at
  const tryMergeDateTime = () => {
    if (payload.pending_date && payload.pending_time && !payload.start_at) {
      payload.start_at = buildDateTime(payload.pending_date, payload.pending_time);
      payload.date = payload.pending_date;
      payload.time = payload.pending_time;
    }
    // Also check date + time (for backward compatibility)
    if (payload.date && payload.time && !payload.start_at) {
      payload.start_at = buildDateTime(payload.date, payload.time);
    }
  };
  
  switch (followUpType) {
    case 'CONFIRM_NO':
      await clearActiveIntent(userId);
      return { message: 'Ok, annullato.', source: 'stateful' };
    
    case 'PROVIDE_DATETIME': {
      // Extract both date AND time from the message
      const date = extractDate(message);
      const time = extractTime(message);
      
      if (date) {
        payload.pending_date = date;
        payload.date = date;
      }
      if (time) {
        payload.pending_time = time;
        payload.time = time;
      }
      
      tryMergeDateTime();
      await updateIntentPayload(userId, payload);
      
      // If we have everything, create the event
      if (payload.title && payload.start_at) {
        return await executeCreateEvent(userId, payload.title, payload.start_at);
      }
      
      // Ask for what's still missing
      if (!payload.title) {
        return { message: 'Come si chiama l\'evento?', source: 'stateful' };
      }
      if (!payload.pending_date && !payload.date) {
        return { message: 'Che giorno?', source: 'stateful' };
      }
      if (!payload.pending_time && !payload.time) {
        return { message: 'A che ora?', source: 'stateful' };
      }
      break;
    }
    
    case 'PROVIDE_DATE': {
      const date = extractDate(message);
      if (date) {
        payload.pending_date = date;
        payload.date = date;
      }
      
      tryMergeDateTime();
      await updateIntentPayload(userId, payload);
      
      if (payload.title && payload.start_at) {
        return await executeCreateEvent(userId, payload.title, payload.start_at);
      }
      
      // Date received, now ask for time only
      if (!payload.pending_time && !payload.time) {
        return { message: 'A che ora?', source: 'stateful' };
      }
      
      if (!payload.title) {
        return { message: 'Come si chiama l\'evento?', source: 'stateful' };
      }
      break;
    }
    
    case 'PROVIDE_TIME': {
      const time = extractTime(message);
      if (time) {
        payload.pending_time = time;
        payload.time = time;
      }
      
      tryMergeDateTime();
      await updateIntentPayload(userId, payload);
      
      if (payload.title && payload.start_at) {
        return await executeCreateEvent(userId, payload.title, payload.start_at);
      }
      
      // Time received, now ask for date only
      if (!payload.pending_date && !payload.date) {
        return { message: 'Che giorno?', source: 'stateful' };
      }
      
      if (!payload.title) {
        return { message: 'Come si chiama l\'evento?', source: 'stateful' };
      }
      break;
    }
    
    case 'CONFIRM_YES':
      tryMergeDateTime();
      
      if (payload.title && payload.start_at) {
        return await executeCreateEvent(userId, payload.title, payload.start_at);
      }
      // Ask for missing
      if (!payload.pending_date && !payload.date) {
        return { message: 'Che giorno?', source: 'stateful' };
      }
      if (!payload.pending_time && !payload.time) {
        return { message: 'A che ora?', source: 'stateful' };
      }
      break;
    
    default: {
      // Try to extract any date/time info from the message
      const dateFromMsg = extractDate(message);
      const timeFromMsg = extractTime(message);
      
      if (dateFromMsg) {
        payload.pending_date = dateFromMsg;
        payload.date = dateFromMsg;
      }
      if (timeFromMsg) {
        payload.pending_time = timeFromMsg;
        payload.time = timeFromMsg;
      }
      
      // If no title yet and no date/time extracted, maybe message is the title
      if (!payload.title && !dateFromMsg && !timeFromMsg) {
        payload.title = message.trim();
      }
      
      tryMergeDateTime();
      await updateIntentPayload(userId, payload);
      
      if (payload.title && payload.start_at) {
        return await executeCreateEvent(userId, payload.title, payload.start_at);
      }
      
      // Ask for what's missing (one question at a time)
      if (!payload.title) {
        return { message: 'Come si chiama l\'evento?', source: 'stateful' };
      }
      if (!payload.pending_date && !payload.date) {
        return { message: 'Che giorno?', source: 'stateful' };
      }
      if (!payload.pending_time && !payload.time) {
        return { message: 'A che ora?', source: 'stateful' };
      }
    }
  }
  
  // Final fallback - should rarely reach here
  tryMergeDateTime();
  if (payload.title && payload.start_at) {
    return await executeCreateEvent(userId, payload.title, payload.start_at);
  }
  
  return { message: 'Quando vuoi metterlo?', source: 'stateful' };
}

/**
 * Handle follow-up for task management (after showing tasks)
 */
async function handleManageTasksFollowUp(
  userId: string,
  message: string,
  state: AssistantState,
  followUpType: FollowUpType
): Promise<StatefulResponse> {
  switch (followUpType) {
    case 'DELETE_THESE':
    case 'COMPLETE_THESE':
      // Check if we have last shown tasks
      if (state.last_action_type === 'SHOW_TASKS' && state.last_action_payload.ids) {
        const ids = state.last_action_payload.ids;
        const action = followUpType === 'DELETE_THESE' ? 'eliminati' : 'completati';
        // TODO: Execute bulk delete/complete
        await clearActiveIntent(userId);
        return {
          message: `Ok, ${ids.length} task ${action}.`,
          source: 'stateful',
          actionExecuted: true
        };
      }
      return {
        message: 'Quali task vuoi gestire? Mostra prima i task.',
        source: 'stateful'
      };
    
    case 'CONFIRM_NO':
      await clearActiveIntent(userId);
      return { message: 'Ok.', source: 'stateful' };
    
    default:
      await clearActiveIntent(userId);
      return handleStatefulMessage(userId, message);
  }
}

/**
 * Handle follow-up for event management
 */
async function handleManageEventsFollowUp(
  userId: string,
  message: string,
  state: AssistantState,
  followUpType: FollowUpType
): Promise<StatefulResponse> {
  switch (followUpType) {
    case 'DELETE_THESE':
      if (state.last_action_type === 'SHOW_EVENTS' && state.last_action_payload.ids) {
        const ids = state.last_action_payload.ids;
        await clearActiveIntent(userId);
        return {
          message: `Ok, ${ids.length} eventi eliminati.`,
          source: 'stateful',
          actionExecuted: true
        };
      }
      return {
        message: 'Quali eventi vuoi eliminare?',
        source: 'stateful'
      };
    
    case 'CONFIRM_NO':
      await clearActiveIntent(userId);
      return { message: 'Ok.', source: 'stateful' };
    
    default:
      await clearActiveIntent(userId);
      return handleStatefulMessage(userId, message);
  }
}

/**
 * Route new intent to appropriate handler
 */
async function routeIntent(
  userId: string,
  message: string,
  intentResult: IntentClassification
): Promise<StatefulResponse> {
  switch (intentResult.intent) {
    case 'QUERY_TASKS':
      return await handleQueryTasks(userId);
    
    case 'QUERY_EVENTS':
      return await handleQueryEvents(userId);
    
    case 'CREATE_TASK':
      if (intentResult.payload.title && intentResult.missingFields.length === 0) {
        return await executeCreateTask(userId, intentResult.payload.title);
      }
      await setActiveIntent(userId, 'CREATE_TASK', intentResult.payload, intentResult.missingFields);
      return {
        message: 'Cosa vuoi aggiungere?',
        source: 'stateful'
      };
    
    case 'CREATE_EVENT':
      await setActiveIntent(userId, 'CREATE_EVENT', intentResult.payload, intentResult.missingFields);
      if (!intentResult.payload.title) {
        return { message: 'Come si chiama l\'evento?', source: 'stateful' };
      }
      return { message: 'Quando?', source: 'stateful' };
    
    case 'CREATE_GENERIC':
      await setActiveIntent(userId, 'CREATE_GENERIC', intentResult.payload, ['type']);
      return {
        message: 'Task o evento?',
        source: 'stateful',
        suggestions: ['Task', 'Evento']
      };
    
    default:
      // Not a stateful intent, let the old system handle it
      return {
        message: '',
        source: 'local'
      };
  }
}

/**
 * Handle delete/manage commands
 * Routes based on last_action_type context
 */
async function handleDeleteCommand(
  userId: string,
  message: string,
  state: AssistantState
): Promise<StatefulResponse> {
  const lower = message.toLowerCase();
  
  // Check for bulk delete (needs confirmation)
  if (BULK_DELETE_PATTERNS.some(p => p.test(lower))) {
    // Determine what type
    let deleteType: 'tasks' | 'events' | 'expenses' = 'tasks';
    if (/eventi/i.test(lower)) deleteType = 'events';
    if (/spese/i.test(lower)) deleteType = 'expenses';
    
    // Set active intent to await confirmation
    await setActiveIntent(userId, 'CONFIRM_BULK_DELETE' as any, { deleteType }, []);
    
    const typeText = deleteType === 'tasks' ? 'TUTTI i task' : 
                     deleteType === 'events' ? 'TUTTI gli eventi' : 'TUTTE le spese';
    
    return {
      message: `⚠️ Vuoi eliminare ${typeText}? Scrivi "sì" per confermare o "no" per annullare.`,
      source: 'stateful',
      suggestions: ['Sì', 'No']
    };
  }
  
  // Deterministic routing based on last action
  const lastAction = state.last_action_type;
  
  if (lastAction === 'SHOW_TASKS') {
    // User saw tasks, now wants to delete them
    const ids = state.last_action_payload?.ids || [];
    if (ids.length > 0) {
      // Set intent and ask for confirmation if multiple
      if (ids.length > 1) {
        await setActiveIntent(userId, 'MANAGE_TASKS', { action: 'delete', ids }, []);
        return {
          message: `Vuoi eliminare tutti i ${ids.length} task mostrati?`,
          source: 'stateful',
          suggestions: ['Sì, eliminali', 'No']
        };
      }
      // Single task, ask which action
      await setActiveIntent(userId, 'MANAGE_TASKS', { action: 'manage', ids }, []);
      return {
        message: 'Vuoi completare o eliminare questo task?',
        source: 'stateful',
        suggestions: ['Completa', 'Elimina']
      };
    }
  }
  
  if (lastAction === 'SHOW_EVENTS') {
    const ids = state.last_action_payload?.ids || [];
    if (ids.length > 0) {
      await setActiveIntent(userId, 'MANAGE_EVENTS', { action: 'delete', ids }, []);
      return {
        message: `Vuoi eliminare ${ids.length > 1 ? 'tutti gli' : 'l\''} eventi mostrati?`,
        source: 'stateful',
        suggestions: ['Sì', 'No']
      };
    }
  }
  
  if (lastAction === 'SHOW_EXPENSES') {
    const ids = state.last_action_payload?.ids || [];
    if (ids.length > 0) {
      await setActiveIntent(userId, 'MANAGE_EXPENSES' as any, { action: 'delete', ids }, []);
      return {
        message: `Vuoi eliminare ${ids.length > 1 ? 'tutte le' : 'la'} spese mostrate?`,
        source: 'stateful',
        suggestions: ['Sì', 'No']
      };
    }
  }
  
  // No context - ask what to delete
  return {
    message: '❓ Cosa vuoi eliminare: task, eventi o spese?',
    source: 'stateful',
    suggestions: ['Task', 'Eventi', 'Spese']
  };
}

// ===== ACTION EXECUTORS =====

async function executeCreateTask(userId: string, title: string): Promise<StatefulResponse> {
  const result = await dataService.createTask(userId, title, 'medium');
  await clearActiveIntent(userId);
  
  if (result.success) {
    return {
      message: `✅ Fatto! Ho aggiunto "${title}".`,
      source: 'stateful',
      actionExecuted: true,
      actionResult: { success: true, data: result.data }
    };
  }
  
  return {
    message: 'Non sono riuscito a creare il task. Riprova.',
    source: 'stateful',
    actionExecuted: false,
    actionResult: { success: false }
  };
}

async function executeCreateEvent(
  userId: string,
  title: string,
  startAt: string
): Promise<StatefulResponse> {
  // Calculate end time (1 hour after start)
  const startDate = new Date(startAt);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  
  const result = await dataService.createEvent(
    userId,
    title,
    startAt,
    endDate.toISOString()
  );
  
  await clearActiveIntent(userId);
  
  if (result.success) {
    const formattedDate = format(startDate, 'EEEE d MMMM', { locale: it });
    const formattedTime = format(startDate, 'HH:mm');
    return {
      message: `✅ Evento creato: "${title}" - ${formattedDate} alle ${formattedTime}`,
      source: 'stateful',
      actionExecuted: true,
      actionResult: { success: true, data: result.data }
    };
  }
  
  return {
    message: 'Non sono riuscito a creare l\'evento. Riprova.',
    source: 'stateful',
    actionExecuted: false,
    actionResult: { success: false }
  };
}

async function handleQueryTasks(userId: string): Promise<StatefulResponse> {
  const result = await dataService.getTasks(userId, 'pending');
  const tasks = result.data || [];
  
  // Save last action for "eliminali" context
  await setLastAction(userId, 'SHOW_TASKS', {
    ids: tasks.map((t: any) => t.id),
    titles: tasks.map((t: any) => t.title),
    count: tasks.length
  });
  
  // Set active intent to allow follow-up commands
  await setActiveIntent(userId, 'QUERY_TASKS', {}, []);
  
  if (tasks.length === 0) {
    await clearActiveIntent(userId);
    return {
      message: '🎉 Nessun task in sospeso!',
      source: 'stateful',
      suggestions: ['Aggiungi un task']
    };
  }
  
  const taskList = tasks.slice(0, 5).map((t: any) => {
    const priority = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
    return `${priority} ${t.title}`;
  }).join('\n');
  
  const moreText = tasks.length > 5 ? `\n\n...e altri ${tasks.length - 5}` : '';
  
  return {
    message: `📋 I tuoi task (${tasks.length}):\n\n${taskList}${moreText}`,
    source: 'stateful',
    suggestions: ['Completa tutti', 'Elimina tutti', 'Aggiungi task']
  };
}

async function handleQueryEvents(userId: string): Promise<StatefulResponse> {
  const result = await dataService.getEvents(userId, 'week');
  const events = result.data || [];
  
  await setLastAction(userId, 'SHOW_EVENTS', {
    ids: events.map((e: any) => e.id),
    titles: events.map((e: any) => e.title),
    count: events.length
  });
  
  await setActiveIntent(userId, 'QUERY_EVENTS', {}, []);
  
  if (events.length === 0) {
    await clearActiveIntent(userId);
    return {
      message: '📅 Nessun evento in programma questa settimana.',
      source: 'stateful',
      suggestions: ['Aggiungi evento']
    };
  }
  
  const eventList = events.slice(0, 5).map((e: any) => {
    const date = new Date(e.start_time);
    return `⏰ ${format(date, 'EEE d', { locale: it })} ${format(date, 'HH:mm')} - ${e.title}`;
  }).join('\n');
  
  return {
    message: `📅 Prossimi eventi:\n\n${eventList}`,
    source: 'stateful',
    suggestions: ['Aggiungi evento']
  };
}

/**
 * Check if message should be handled by stateful system
 * CRITICAL: Safety words MUST go through stateful to prevent task creation
 */
export function shouldUseStatefulHandler(message: string): boolean {
  const lower = message.toLowerCase().trim();
  
  // FIRST: Safety words MUST be handled by stateful (to prevent legacy creating tasks)
  if (isSafetyWord(message)) {
    return true;
  }
  
  // Cancel patterns MUST be handled by stateful - use centralized function
  if (isCancelPattern(message)) {
    return true;
  }
  
  // Delete commands MUST be handled by stateful
  if (/(?:elimina|cancella|rimuovi|togli)/i.test(lower)) {
    return true;
  }
  
  // Stateful patterns
  const patterns = [
    ...CREATE_PATTERNS,
    ...QUERY_TASK_PATTERNS,
    ...QUERY_EVENT_PATTERNS,
    // Simple responses that might be follow-ups
    /^(s[iì]|no|ok|task|evento|domani|oggi)$/i
  ];
  
  return patterns.some(p => p.test(lower));
}

/**
 * Check if user has an active intent (for external callers)
 */
export async function userHasActiveIntent(userId: string): Promise<boolean> {
  const state = await getState(userId);
  return hasActiveIntent(state);
}
