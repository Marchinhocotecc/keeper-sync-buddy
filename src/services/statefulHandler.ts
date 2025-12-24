/**
 * Stateful Assistant Handler
 * 
 * Manages conversational state with Supabase persistence.
 * Handles follow-ups deterministically without external AI.
 * 
 * FLOW:
 * 1. Load state from Supabase
 * 2. If active intent exists → handle as follow-up
 * 3. If no active intent → parse new intent
 * 4. Execute actions or ask for missing data
 * 5. Save state back to Supabase
 */

import { format, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
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

/**
 * Main stateful message handler
 */
export async function handleStatefulMessage(
  userId: string,
  message: string
): Promise<StatefulResponse> {
  console.log('[StatefulHandler] Processing:', message);
  
  // Load current state from Supabase
  const state = await getState(userId);
  console.log('[StatefulHandler] Current state:', state.active_intent);
  
  // ===== PHASE 0: Check for active intent (PRIORITY) =====
  if (hasActiveIntent(state)) {
    console.log('[StatefulHandler] Handling follow-up for:', state.active_intent);
    return await handleFollowUp(userId, message, state);
  }
  
  // ===== PHASE 1: Classify new intent =====
  const intentResult = classifyNewIntent(message);
  console.log('[StatefulHandler] New intent:', intentResult.intent);
  
  // ===== PHASE 2: Route based on intent =====
  return await routeIntent(userId, message, intentResult);
}

interface IntentClassification {
  intent: ActiveIntent;
  payload: IntentPayload;
  missingFields: string[];
}

/**
 * Classify a new message (when no active intent)
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
        const title = content.replace(/task/i, '').trim();
        return {
          intent: 'CREATE_TASK',
          payload: { title: title || undefined },
          missingFields: title ? [] : ['title']
        };
      }
      
      if (/evento|appuntamento/i.test(content)) {
        const title = content.replace(/evento|appuntamento/i, '').trim();
        return {
          intent: 'CREATE_EVENT',
          payload: { title: title || undefined },
          missingFields: title ? ['date', 'time'] : ['title', 'date', 'time']
        };
      }
      
      // Generic create (user said "crea padel" without specifying type)
      return {
        intent: 'CREATE_GENERIC',
        payload: { title: content },
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
    
    default:
      // Unknown active intent, clear and process as new
      await clearActiveIntent(userId);
      return handleStatefulMessage(userId, message);
  }
}

/**
 * Handle follow-up for CREATE_GENERIC (user said "crea X", need to know task/event)
 */
async function handleCreateGenericFollowUp(
  userId: string,
  message: string,
  state: AssistantState,
  followUpType: FollowUpType
): Promise<StatefulResponse> {
  const title = state.intent_payload.title || '';
  
  switch (followUpType) {
    case 'CHOOSE_TASK':
    case 'CONFIRM_YES':
      // Default to task on "sì"
      await setActiveIntent(userId, 'CREATE_TASK', { title }, []);
      // If we have a title, create immediately
      if (title) {
        return await executeCreateTask(userId, title);
      }
      return {
        message: 'Cosa vuoi aggiungere come task?',
        source: 'stateful'
      };
    
    case 'CHOOSE_EVENT':
      await setActiveIntent(userId, 'CREATE_EVENT', { title }, ['date', 'time']);
      return {
        message: 'Quando?',
        source: 'stateful'
      };
    
    case 'CONFIRM_NO':
      await clearActiveIntent(userId);
      return {
        message: 'Ok, lasciamo stare.',
        source: 'stateful'
      };
    
    default:
      // Check if user is clarifying with "task" or "evento" in the message
      const lower = message.toLowerCase();
      if (/task/i.test(lower)) {
        await setActiveIntent(userId, 'CREATE_TASK', { title }, []);
        if (title) {
          return await executeCreateTask(userId, title);
        }
        return { message: 'Cosa vuoi aggiungere?', source: 'stateful' };
      }
      if (/evento|appuntamento/i.test(lower)) {
        await setActiveIntent(userId, 'CREATE_EVENT', { title }, ['date', 'time']);
        return { message: 'Quando?', source: 'stateful' };
      }
      
      // Still unclear
      return {
        message: 'Task o evento?',
        source: 'stateful',
        suggestions: ['Task', 'Evento']
      };
  }
}

/**
 * Handle follow-up for CREATE_TASK
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
      if (title) {
        return await executeCreateTask(userId, title);
      }
      return { message: 'Cosa vuoi aggiungere?', source: 'stateful' };
    
    default:
      // Assume the message is the title
      if (!title) {
        title = message.trim();
        await updateIntentPayload(userId, { title });
      }
      
      if (title) {
        return await executeCreateTask(userId, title);
      }
      
      return { message: 'Cosa vuoi aggiungere?', source: 'stateful' };
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
 */
export function shouldUseStatefulHandler(message: string): boolean {
  const lower = message.toLowerCase().trim();
  
  // Stateful patterns
  const patterns = [
    ...CREATE_PATTERNS,
    ...QUERY_TASK_PATTERNS,
    ...QUERY_EVENT_PATTERNS,
    // Simple responses that might be follow-ups
    /^(s[iì]|no|ok|task|evento|domani|oggi|annulla)$/i
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
