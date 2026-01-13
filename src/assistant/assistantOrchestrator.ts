/**
 * ASSISTANT ORCHESTRATOR - Main Entry Point
 * 
 * ARCHITECTURE RESET: Separazione netta FREE / PREMIUM
 * 
 * FREE (Operator):
 * - Esegue SOLO azioni esplicite
 * - Chiede chiarimenti se ambiguo
 * - Chiede conferma prima di scrivere
 * - NON suggerisce, NON consiglia
 * 
 * PREMIUM (Coach):
 * - Analizza, consiglia, pianifica
 * - NON può scrivere direttamente nel DB
 * - Ogni proposta termina con richiesta conferma
 * 
 * ROUTING DETERMINISTICO:
 * - Action verbs → Operator
 * - Reflection/advice → Coach (premium gating)
 * - Ambiguous → Operator asks clarification
 */

import {
  parseExplicitCommand,
  executeCreateTask,
  executeCreateEvent,
  executeRecordExpense,
  executeShowTasks,
  executeShowEvents,
  executeShowExpenses,
  askTypeChoice,
  handleCancel,
  handleAmbiguous,
  isPremiumRequest,
  type OperatorResponse,
  type OperatorContext
} from './freeOperator';
import {
  getCoaching,
  getPremiumUpgradeMessage,
  type CoachResponse
} from './premiumCoach';
import {
  routeMessage,
  hasPremiumAccess,
  isDataInput,
  extractData,
  type RouteDecision
} from './messageRouter';
import { loadUserContext } from './contextLoader';
import {
  getState,
  setActiveIntent,
  clearActiveIntent,
  updateIntentPayload,
  setLastAction,
  type AssistantState,
  type IntentPayload
} from '@/services/assistantStateService';
import * as dataService from '@/services/dataService';
import { addToConversationHistory, getConversationHistory } from './contextStore';
import type { ConversationMessage } from './types';

// ========== TYPES ==========

export interface AssistantResponse {
  message: string;
  source: 'operator' | 'coach' | 'local';
  actionExecuted: boolean;
  suggestions?: string[];
  data?: any;
}

// ========== STATE MANAGEMENT ==========

/**
 * Get operator context from state
 */
function getOperatorContext(state: AssistantState): OperatorContext {
  const payload = state.intent_payload;
  return {
    pendingIntent: state.active_intent as any,
    pendingData: {
      title: payload.title,
      date: payload.date,
      startTime: payload.startTime,
      amount: payload.amount,
      category: payload.category
    },
    lastShownList: payload.last_list_context,
    lastSingleItem: payload.last_single_context
  };
}

// ========== MAIN ORCHESTRATOR ==========

/**
 * Process user message through the deterministic pipeline
 * 
 * FLOW:
 * 1. Check for active state (follow-up handling)
 * 2. Route message (Operator vs Coach)
 * 3. Premium gating if needed
 * 4. Execute or clarify
 */
export async function processMessage(
  userId: string,
  message: string
): Promise<AssistantResponse> {
  console.log('=== Assistant Orchestrator ===');
  console.log('User:', userId);
  console.log('Message:', message);
  
  const trimmed = message.trim();
  
  // ========== PHASE 1: LOAD STATE ==========
  const state = await getState(userId);
  const context = getOperatorContext(state);
  const hasActiveState = state.active_intent && state.active_intent !== 'NONE';
  
  console.log('Active state:', hasActiveState ? state.active_intent : 'NONE');
  
  // ========== PHASE 2: CANCEL DETECTION (ALWAYS FIRST) ==========
  const parsed = parseExplicitCommand(trimmed);
  
  if (parsed.intent === 'CANCEL') {
    console.log('Cancel detected - clearing state');
    await clearActiveIntent(userId);
    const response = handleCancel();
    await saveConversation(userId, message, response.message);
    return toAssistantResponse(response);
  }
  
  // ========== PHASE 3: ACTIVE STATE HANDLING (FOLLOW-UP) ==========
  if (hasActiveState) {
    console.log('Handling follow-up for:', state.active_intent);
    const followUpResponse = await handleFollowUp(userId, message, state);
    if (followUpResponse) {
      await saveConversation(userId, message, followUpResponse.message);
      return followUpResponse;
    }
    // If follow-up handler returned null, fall through to route as new message
  }
  
  // ========== PHASE 4: ROUTE MESSAGE ==========
  const route = routeMessage(trimmed);
  console.log('Route decision:', route.target, route.intent);
  
  // ========== PHASE 5: PREMIUM GATING ==========
  if (route.isPremiumRequired) {
    const isPremium = hasPremiumAccess(userId);
    
    if (!isPremium) {
      console.log('Premium feature requested by free user');
      const upgradeMsg = getPremiumUpgradeMessage();
      await saveConversation(userId, message, upgradeMsg.message);
      return {
        message: upgradeMsg.message,
        source: 'coach',
        actionExecuted: false,
        suggestions: upgradeMsg.suggestions
      };
    }
    
    // Premium user - get coaching
    console.log('Premium coaching requested');
    const userContext = await loadUserContext(userId);
    const history = getConversationHistory(userId);
    const coaching = await getCoaching(message, userContext, history);
    
    await setLastAction(userId, 'ADVICE', {});
    await saveConversation(userId, message, coaching.message);
    
    return {
      message: coaching.message,
      source: 'coach',
      actionExecuted: false,
      suggestions: coaching.suggestions
    };
  }
  
  // ========== PHASE 6: EXECUTE OPERATOR COMMAND ==========
  if (route.target === 'OPERATOR' && route.intent !== 'NONE') {
    const operatorResponse = await executeOperatorCommand(
      userId, 
      route.intent, 
      route.extracted,
      message
    );
    
    await saveConversation(userId, message, operatorResponse.message);
    return toAssistantResponse(operatorResponse);
  }
  
  // ========== PHASE 7: AMBIGUOUS INPUT ==========
  console.log('Ambiguous input - asking for clarification');
  const ambiguous = handleAmbiguous();
  await saveConversation(userId, message, ambiguous.message);
  return toAssistantResponse(ambiguous);
}

// ========== FOLLOW-UP HANDLER ==========

/**
 * Handle follow-up for active state
 * Returns null if should be treated as new message
 */
async function handleFollowUp(
  userId: string,
  message: string,
  state: AssistantState
): Promise<AssistantResponse | null> {
  const activeIntent = state.active_intent;
  const payload = state.intent_payload;
  const expectedInput = payload.expectedInput || 'NONE';
  
  console.log('Follow-up - expected:', expectedInput);
  
  // Check for explicit topic change
  const parsed = parseExplicitCommand(message);
  if (parsed.intent !== 'NONE' && parsed.intent !== 'CONFIRM' && parsed.intent !== 'CANCEL') {
    // New explicit command - clear state and process as new
    console.log('Topic change detected - clearing state');
    await clearActiveIntent(userId);
    return null;
  }
  
  // Handle by active intent type
  switch (activeIntent) {
    case 'CREATE_TASK':
      return await handleCreateTaskFollowUp(userId, message, payload);
    
    case 'CREATE_EVENT':
      return await handleCreateEventFollowUp(userId, message, payload);
    
    case 'RECORD_EXPENSE':
      return await handleRecordExpenseFollowUp(userId, message, payload);
    
    case 'CREATE_GENERIC':
    case 'CHOOSE_TYPE':
      return await handleChooseTypeFollowUp(userId, message, payload);
    
    case 'MANAGE_TASKS':
    case 'MANAGE_EVENTS':
      return await handleManageFollowUp(userId, message, state);
    
    case 'CONFIRM_BULK_DELETE':
    case 'CONFIRM_BULK_COMPLETE':
      return await handleConfirmFollowUp(userId, message, state);
    
    default:
      return null;
  }
}

// ========== INTENT-SPECIFIC FOLLOW-UP HANDLERS ==========

async function handleCreateTaskFollowUp(
  userId: string,
  message: string,
  payload: IntentPayload
): Promise<AssistantResponse> {
  // User is providing title
  const title = payload.title || message.trim();
  
  if (!title || title.length < 2) {
    return {
      message: '❓ Che task?',
      source: 'operator',
      actionExecuted: false
    };
  }
  
  const response = await executeCreateTask(userId, title);
  if (response.actionExecuted) {
    await clearActiveIntent(userId);
    await setLastAction(userId, 'CREATE_TASK', { title });
  }
  
  return toAssistantResponse(response);
}

async function handleCreateEventFollowUp(
  userId: string,
  message: string,
  payload: IntentPayload
): Promise<AssistantResponse> {
  const expectedInput = payload.expectedInput || 'TITLE';
  let updatedPayload = { ...payload };
  
  // Extract data based on what's expected
  if (expectedInput === 'TITLE' || !payload.title) {
    updatedPayload.title = message.trim();
    if (!updatedPayload.date) {
      updatedPayload.expectedInput = 'DATE';
      await updateIntentPayload(userId, updatedPayload);
      return {
        message: '❓ Quando?',
        source: 'operator',
        actionExecuted: false
      };
    }
  }
  
  if (expectedInput === 'DATE' || !payload.date) {
    const date = extractData(message, 'DATE') as string | null;
    const time = extractData(message, 'TIME') as string | null;
    
    if (date) updatedPayload.date = date;
    if (time) updatedPayload.startTime = time;
    
    if (!updatedPayload.date) {
      return {
        message: '❓ Che giorno?',
        source: 'operator',
        actionExecuted: false
      };
    }
    
    if (!updatedPayload.startTime) {
      updatedPayload.expectedInput = 'TIME';
      await updateIntentPayload(userId, updatedPayload);
      return {
        message: '❓ A che ora?',
        source: 'operator',
        actionExecuted: false
      };
    }
  }
  
  if (expectedInput === 'TIME' || !payload.startTime) {
    const time = extractData(message, 'TIME') as string | null;
    if (time) updatedPayload.startTime = time;
    
    if (!updatedPayload.startTime) {
      return {
        message: '❓ A che ora?',
        source: 'operator',
        actionExecuted: false
      };
    }
  }
  
  // All data collected - create event
  const response = await executeCreateEvent(userId, {
    title: updatedPayload.title,
    date: updatedPayload.date,
    startTime: updatedPayload.startTime
  });
  
  if (response.actionExecuted) {
    await clearActiveIntent(userId);
    await setLastAction(userId, 'CREATE_EVENT', updatedPayload);
  }
  
  return toAssistantResponse(response);
}

async function handleRecordExpenseFollowUp(
  userId: string,
  message: string,
  payload: IntentPayload
): Promise<AssistantResponse> {
  const expectedInput = payload.expectedInput || 'AMOUNT';
  let updatedPayload = { ...payload };
  
  if (expectedInput === 'AMOUNT' || !payload.amount) {
    const amount = extractData(message, 'AMOUNT') as number | null;
    if (amount) updatedPayload.amount = amount;
    
    if (!updatedPayload.amount) {
      return {
        message: '❓ Quanto?',
        source: 'operator',
        actionExecuted: false
      };
    }
    
    if (!updatedPayload.category) {
      updatedPayload.expectedInput = 'CATEGORY';
      await updateIntentPayload(userId, updatedPayload);
      return {
        message: '❓ Per cosa?',
        source: 'operator',
        actionExecuted: false
      };
    }
  }
  
  if (expectedInput === 'CATEGORY' || !payload.category) {
    updatedPayload.category = message.trim();
    
    if (!updatedPayload.category || updatedPayload.category.length < 2) {
      return {
        message: '❓ Per cosa?',
        source: 'operator',
        actionExecuted: false
      };
    }
  }
  
  // All data collected - record expense
  const response = await executeRecordExpense(userId, {
    amount: updatedPayload.amount,
    category: updatedPayload.category
  });
  
  if (response.actionExecuted) {
    await clearActiveIntent(userId);
    await setLastAction(userId, 'RECORD_EXPENSE', updatedPayload);
  }
  
  return toAssistantResponse(response);
}

async function handleChooseTypeFollowUp(
  userId: string,
  message: string,
  payload: IntentPayload
): Promise<AssistantResponse> {
  const type = extractData(message, 'TYPE') as string | null;
  
  if (!type) {
    return {
      message: '❓ Task o evento?',
      source: 'operator',
      actionExecuted: false,
      suggestions: ['Task', 'Evento']
    };
  }
  
  const title = payload.title || payload.pendingTitle;
  
  if (type === 'task') {
    if (title && title.length >= 2) {
      // We have title, create directly
      const response = await executeCreateTask(userId, title);
      if (response.actionExecuted) {
        await clearActiveIntent(userId);
      }
      return toAssistantResponse(response);
    }
    
    // Need title
    await setActiveIntent(userId, 'CREATE_TASK', { expectedInput: 'TITLE' }, ['title']);
    return {
      message: '❓ Che task?',
      source: 'operator',
      actionExecuted: false
    };
  }
  
  if (type === 'event') {
    await setActiveIntent(userId, 'CREATE_EVENT', { 
      title,
      expectedInput: title ? 'DATE' : 'TITLE' 
    }, title ? ['date', 'startTime'] : ['title', 'date', 'startTime']);
    
    return {
      message: title ? '❓ Quando?' : '❓ Che evento?',
      source: 'operator',
      actionExecuted: false
    };
  }
  
  return {
    message: '❓ Task o evento?',
    source: 'operator',
    actionExecuted: false,
    suggestions: ['Task', 'Evento']
  };
}

async function handleManageFollowUp(
  userId: string,
  message: string,
  state: AssistantState
): Promise<AssistantResponse> {
  const payload = state.intent_payload;
  const listContext = payload.last_list_context;
  const expectedInput = payload.expectedInput;
  
  // Check for index selection
  if (expectedInput === 'CHOOSE_INDEX' && listContext) {
    const indexMatch = message.match(/^(\d+)$/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1], 10) - 1;
      
      if (index >= 0 && index < listContext.ids.length) {
        const id = listContext.ids[index];
        const title = listContext.titles?.[index];
        const pendingAction = payload.pendingAction;
        
        if (pendingAction === 'delete') {
          if (listContext.type === 'TASK') {
            await dataService.deleteTask(userId, id);
          } else if (listContext.type === 'EVENT') {
            await dataService.deleteEvent(userId, id);
          }
          await clearActiveIntent(userId);
          return {
            message: title ? `✅ "${title}" eliminato.` : '✅ Eliminato.',
            source: 'operator',
            actionExecuted: true
          };
        }
        
        if (pendingAction === 'complete' && listContext.type === 'TASK') {
          await dataService.completeTask(userId, id);
          await clearActiveIntent(userId);
          return {
            message: title ? `✅ "${title}" completato!` : '✅ Completato!',
            source: 'operator',
            actionExecuted: true
          };
        }
      }
      
      return {
        message: `❓ Scegli da 1 a ${listContext.ids.length}.`,
        source: 'operator',
        actionExecuted: false
      };
    }
  }
  
  // Not a valid selection
  return {
    message: '❓ Quale numero?',
    source: 'operator',
    actionExecuted: false
  };
}

async function handleConfirmFollowUp(
  userId: string,
  message: string,
  state: AssistantState
): Promise<AssistantResponse> {
  const parsed = parseExplicitCommand(message);
  
  if (parsed.intent === 'CONFIRM') {
    const payload = state.intent_payload;
    const targetType = payload.targetType;
    
    if (state.active_intent === 'CONFIRM_BULK_DELETE') {
      // Execute bulk delete
      if (targetType === 'tasks') {
        await dataService.deleteAllTasks(userId);
      } else if (targetType === 'events') {
        await dataService.deleteAllEvents(userId);
      } else if (targetType === 'expenses') {
        await dataService.deleteAllExpenses(userId);
      }
      
      await clearActiveIntent(userId);
      return {
        message: '✅ Eliminati.',
        source: 'operator',
        actionExecuted: true
      };
    }
    
    if (state.active_intent === 'CONFIRM_BULK_COMPLETE') {
      await dataService.completeAllTasks(userId);
      await clearActiveIntent(userId);
      return {
        message: '✅ Completati tutti!',
        source: 'operator',
        actionExecuted: true
      };
    }
  }
  
  if (parsed.intent === 'CANCEL') {
    await clearActiveIntent(userId);
    return {
      message: '✅ Ok, annullato.',
      source: 'operator',
      actionExecuted: false
    };
  }
  
  return {
    message: '❓ Confermi? (Sì/No)',
    source: 'operator',
    actionExecuted: false,
    suggestions: ['Sì', 'No']
  };
}

// ========== COMMAND EXECUTOR ==========

async function executeOperatorCommand(
  userId: string,
  intent: string,
  extracted?: string,
  rawMessage?: string
): Promise<OperatorResponse> {
  console.log('Executing operator command:', intent, extracted);
  
  switch (intent) {
    case 'SHOW_TASKS': {
      const response = await executeShowTasks(userId);
      if (response.data?.ids?.length > 0) {
        await updateIntentPayload(userId, {
          last_list_context: response.data,
          last_single_context: response.data.ids.length === 1 
            ? { type: 'TASK', id: response.data.ids[0], title: response.data.titles?.[0] }
            : undefined
        });
        await setLastAction(userId, 'SHOW_TASKS', response.data);
      }
      return response;
    }
    
    case 'SHOW_EVENTS': {
      const response = await executeShowEvents(userId);
      if (response.data?.ids?.length > 0) {
        await updateIntentPayload(userId, {
          last_list_context: response.data,
          last_single_context: response.data.ids.length === 1
            ? { type: 'EVENT', id: response.data.ids[0], title: response.data.titles?.[0] }
            : undefined
        });
        await setLastAction(userId, 'SHOW_EVENTS', response.data);
      }
      return response;
    }
    
    case 'SHOW_EXPENSES': {
      const response = await executeShowExpenses(userId);
      await setLastAction(userId, 'SHOW_EXPENSES', response.data);
      return response;
    }
    
    case 'CREATE_TASK': {
      if (extracted && extracted.length >= 2) {
        const response = await executeCreateTask(userId, extracted);
        if (response.actionExecuted) {
          await setLastAction(userId, 'CREATE_TASK', { title: extracted });
        }
        return response;
      }
      // Need title
      await setActiveIntent(userId, 'CREATE_TASK', { expectedInput: 'TITLE' }, ['title']);
      return {
        message: '❓ Che task?',
        source: 'operator',
        actionExecuted: false,
        nextExpected: 'TITLE'
      };
    }
    
    case 'CREATE_EVENT': {
      // Parse what we have from the message
      const dateFromMsg = rawMessage ? extractData(rawMessage, 'DATE') as string | null : null;
      const timeFromMsg = rawMessage ? extractData(rawMessage, 'TIME') as string | null : null;
      
      if (extracted && extracted.length >= 2 && dateFromMsg && timeFromMsg) {
        // We have everything
        const response = await executeCreateEvent(userId, {
          title: extracted,
          date: dateFromMsg,
          startTime: timeFromMsg
        });
        if (response.actionExecuted) {
          await setLastAction(userId, 'CREATE_EVENT', { title: extracted, date: dateFromMsg, startTime: timeFromMsg });
        }
        return response;
      }
      
      // Need more data - set up state
      await setActiveIntent(userId, 'CREATE_EVENT', {
        title: extracted,
        date: dateFromMsg || undefined,
        startTime: timeFromMsg || undefined,
        expectedInput: !extracted ? 'TITLE' : !dateFromMsg ? 'DATE' : 'TIME'
      }, []);
      
      if (!extracted) {
        return { message: '❓ Che evento?', source: 'operator', actionExecuted: false, nextExpected: 'TITLE' };
      }
      if (!dateFromMsg) {
        return { message: '❓ Quando?', source: 'operator', actionExecuted: false, nextExpected: 'DATE' };
      }
      return { message: '❓ A che ora?', source: 'operator', actionExecuted: false, nextExpected: 'TIME' };
    }
    
    case 'RECORD_EXPENSE': {
      // Parse amount and category from message
      const amountFromMsg = rawMessage ? extractData(rawMessage, 'AMOUNT') as number | null : null;
      
      if (extracted) {
        // Try to get amount and category from extracted
        const amountMatch = extracted.match(/(\d+(?:[.,]\d+)?)/);
        const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : amountFromMsg;
        const category = extracted.replace(/€?\s*\d+(?:[.,]\d+)?\s*(?:euro|€)?/gi, '').trim();
        
        if (amount && category && category.length >= 2) {
          const response = await executeRecordExpense(userId, { amount, category });
          if (response.actionExecuted) {
            await setLastAction(userId, 'RECORD_EXPENSE', { amount, category });
          }
          return response;
        }
        
        // Need more data
        await setActiveIntent(userId, 'RECORD_EXPENSE', {
          amount,
          category: category.length >= 2 ? category : undefined,
          expectedInput: !amount ? 'AMOUNT' : 'CATEGORY'
        }, []);
        
        if (!amount) {
          return { message: '❓ Quanto?', source: 'operator', actionExecuted: false, nextExpected: 'AMOUNT' };
        }
        return { message: '❓ Per cosa?', source: 'operator', actionExecuted: false, nextExpected: 'CATEGORY' };
      }
      
      // No extracted data
      await setActiveIntent(userId, 'RECORD_EXPENSE', { expectedInput: 'AMOUNT' }, ['amount', 'category']);
      return { message: '❓ Quanto hai speso?', source: 'operator', actionExecuted: false, nextExpected: 'AMOUNT' };
    }
    
    case 'CHOOSE_TYPE': {
      await setActiveIntent(userId, 'CREATE_GENERIC', {
        pendingTitle: extracted,
        expectedInput: 'TYPE'
      }, ['type']);
      return askTypeChoice(extracted);
    }
    
    case 'COMPLETE_TASK': {
      // TODO: Implement complete specific task
      return handleAmbiguous();
    }
    
    case 'DELETE_TASK':
    case 'DELETE_EVENT':
    case 'DELETE_EXPENSE': {
      // TODO: Implement delete specific item
      return handleAmbiguous();
    }
    
    default:
      return handleAmbiguous();
  }
}

// ========== HELPERS ==========

function toAssistantResponse(response: OperatorResponse): AssistantResponse {
  return {
    message: response.message,
    source: 'operator',
    actionExecuted: response.actionExecuted,
    suggestions: response.suggestions,
    data: response.data
  };
}

async function saveConversation(userId: string, userMessage: string, assistantResponse: string): Promise<void> {
  try {
    await addToConversationHistory(userId, {
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    });
    await addToConversationHistory(userId, {
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Failed to save conversation:', error);
  }
}

// Re-export for compatibility
export { processMessage as orchestrateMessage };
