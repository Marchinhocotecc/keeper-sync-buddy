/**
 * ASSISTANT ORCHESTRATOR - Main Entry Point
 * 
 * ABSOLUTE INVARIANT:
 * NO WRITE ACTION (create/delete/update) SHALL EVER OCCUR WITHOUT EXPLICIT "SÌ" CONFIRMATION
 * 
 * TWO-PHASE FLOW FOR ALL WRITES:
 * 
 * PHASE 1 - INTENTION (READ ONLY)
 *   - User says something
 *   - Assistant collects required data
 *   - Assistant summarizes what it understood
 *   - Assistant asks: "Vuoi che lo faccia? (sì/no)"
 * 
 * PHASE 2 - CONFIRMATION
 *   - ONLY "sì" enables the action
 *   - Any other response = cancellation
 * 
 * ARCHITECTURE:
 * - FREE (Operator): Executes explicit actions with confirmation
 * - PREMIUM (Coach): Analyzes, advises, plans (not implemented yet)
 */

import {
  parseExplicitCommand,
  executeCreateTask,
  executeCreateEvent,
  executeRecordExpense,
  executeShowTasks,
  executeShowEvents,
  executeShowExpenses,
  buildTaskConfirmation,
  buildEventConfirmation,
  buildExpenseConfirmation,
  askTypeChoice,
  handleCancel,
  handleAmbiguous,
  isPremiumRequest,
  isValidTitle,
  isForbiddenTitle,
  isCancel,
  isConfirmation,
  normalizeTitle,
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

// ========== MAIN ORCHESTRATOR ==========

/**
 * Process user message through the deterministic pipeline
 * 
 * FLOW:
 * 1. CANCEL always first priority
 * 2. Check for active state (confirmation or data collection)
 * 3. Route new messages
 * 4. Execute or ask for data
 */
export async function processMessage(
  userId: string,
  message: string
): Promise<AssistantResponse> {
  console.log('=== Assistant Orchestrator ===');
  console.log('User:', userId);
  console.log('Message:', message);
  
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();
  
  // ========== PHASE 0: LOAD STATE ==========
  const state = await getState(userId);
  const hasActiveState = state.active_intent && state.active_intent !== 'NONE';
  const isAwaitingConfirmation = state.intent_payload.awaitingConfirmation === true;
  
  console.log('Active state:', hasActiveState ? state.active_intent : 'NONE');
  console.log('Awaiting confirmation:', isAwaitingConfirmation);
  
  // ========== PHASE 1: CANCEL IS ALWAYS PRIORITY ==========
  if (isCancel(lower)) {
    console.log('Cancel detected - clearing state');
    await clearActiveIntent(userId);
    const response = handleCancel();
    await saveConversation(userId, message, response.message);
    return toAssistantResponse(response);
  }
  
  // ========== PHASE 2: HANDLE CONFIRMATION RESPONSE ==========
  if (isAwaitingConfirmation) {
    console.log('Processing confirmation response');
    const confirmationResponse = await handleConfirmationResponse(userId, message, state);
    await saveConversation(userId, message, confirmationResponse.message);
    return confirmationResponse;
  }
  
  // ========== PHASE 3: HANDLE ACTIVE DATA COLLECTION ==========
  if (hasActiveState && !isAwaitingConfirmation) {
    console.log('Handling data collection for:', state.active_intent);
    
    // Check if this is a topic change (new explicit command)
    const parsed = parseExplicitCommand(trimmed);
    if (parsed.intent !== 'NONE' && parsed.intent !== 'CONFIRM' && parsed.intent !== 'CANCEL') {
      console.log('Topic change detected - processing as new command');
      await clearActiveIntent(userId);
      // Fall through to process as new message
    } else {
      const dataResponse = await handleDataCollection(userId, message, state);
      if (dataResponse) {
        await saveConversation(userId, message, dataResponse.message);
        return dataResponse;
      }
    }
  }
  
  // ========== PHASE 4: ROUTE NEW MESSAGE ==========
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
    const history = await getConversationHistory(userId);
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
    const operatorResponse = await handleOperatorCommand(
      userId, 
      route.intent, 
      route.extracted,
      message
    );
    
    await saveConversation(userId, message, operatorResponse.message);
    return toAssistantResponse(operatorResponse);
  }
  
  // ========== PHASE 7: AMBIGUOUS INPUT ==========
  // RULE: Do NOT interpret vague input. Ask conversationally.
  console.log('Ambiguous/vague input - responding conversationally');
  const ambiguous = handleAmbiguous();
  await saveConversation(userId, message, ambiguous.message);
  return toAssistantResponse(ambiguous);
}

// ========== CONFIRMATION HANDLER ==========

/**
 * Handle user response to a confirmation request
 * ONLY "sì" executes the action - everything else cancels
 */
async function handleConfirmationResponse(
  userId: string,
  message: string,
  state: AssistantState
): Promise<AssistantResponse> {
  const payload = state.intent_payload;
  const activeIntent = state.active_intent;
  
  // Check for explicit "sì"
  if (isConfirmation(message)) {
    console.log('User confirmed - executing action');
    
    // Execute based on intent
    switch (activeIntent) {
      case 'CREATE_TASK': {
        const response = await executeCreateTask(userId, payload.title!);
        await clearActiveIntent(userId);
        if (response.actionExecuted) {
          await setLastAction(userId, 'CREATE_TASK', { title: payload.title });
        }
        return toAssistantResponse(response);
      }
      
      case 'CREATE_EVENT': {
        const response = await executeCreateEvent(userId, {
          title: payload.title,
          date: payload.date,
          startTime: payload.startTime || payload.time
        });
        await clearActiveIntent(userId);
        if (response.actionExecuted) {
          await setLastAction(userId, 'CREATE_EVENT', { 
            title: payload.title,
            date: payload.date,
            startTime: payload.startTime
          });
        }
        return toAssistantResponse(response);
      }
      
      case 'RECORD_EXPENSE': {
        const response = await executeRecordExpense(userId, {
          amount: payload.amount,
          category: payload.category
        });
        await clearActiveIntent(userId);
        if (response.actionExecuted) {
          await setLastAction(userId, 'RECORD_EXPENSE', { 
            amount: payload.amount,
            category: payload.category
          });
        }
        return toAssistantResponse(response);
      }
      
      case 'CONFIRM_BULK_DELETE': {
        const targetType = payload.targetType;
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
      
      case 'CONFIRM_BULK_COMPLETE': {
        await dataService.completeAllTasks(userId);
        await clearActiveIntent(userId);
        return {
          message: '✅ Completati tutti!',
          source: 'operator',
          actionExecuted: true
        };
      }
      
      default:
        await clearActiveIntent(userId);
        return toAssistantResponse(handleAmbiguous());
    }
  }
  
  // NOT a confirmation - cancel the pending action
  console.log('User did not confirm - cancelling');
  await clearActiveIntent(userId);
  return {
    message: 'Ok, annullato 🙂 Dimmi pure cosa vuoi fare.',
    source: 'operator',
    actionExecuted: false
  };
}

// ========== DATA COLLECTION HANDLER ==========

/**
 * Handle data collection for incomplete intents
 * Once all data is collected, ask for confirmation
 */
async function handleDataCollection(
  userId: string,
  message: string,
  state: AssistantState
): Promise<AssistantResponse | null> {
  const activeIntent = state.active_intent;
  const payload = state.intent_payload;
  const expectedInput = payload.expectedInput || 'NONE';
  const userInput = message.trim();
  
  console.log('Data collection - expected:', expectedInput);
  
  // ANTI-STUPIDITY: Reject vague input in data collection
  if (isForbiddenTitle(userInput) && ['TITLE', 'CATEGORY'].includes(expectedInput as string)) {
    return {
      message: '❓ Puoi essere più specifico?',
      source: 'operator',
      actionExecuted: false
    };
  }
  
  switch (activeIntent) {
    case 'CREATE_TASK':
      return await collectTaskData(userId, userInput, payload);
    
    case 'CREATE_EVENT':
      return await collectEventData(userId, userInput, payload);
    
    case 'RECORD_EXPENSE':
      return await collectExpenseData(userId, userInput, payload);
    
    case 'CREATE_GENERIC':
    case 'CHOOSE_TYPE':
      return await handleTypeChoice(userId, userInput, payload);
    
    case 'MANAGE_TASKS':
    case 'MANAGE_EVENTS':
      return await handleIndexSelection(userId, userInput, state);
    
    default:
      return null;
  }
}

// ========== DATA COLLECTORS ==========

async function collectTaskData(
  userId: string,
  userInput: string,
  payload: IntentPayload
): Promise<AssistantResponse> {
  // Expecting title
  if (!isValidTitle(userInput)) {
    return {
      message: '❓ Che task vuoi creare?',
      source: 'operator',
      actionExecuted: false
    };
  }
  
  const title = normalizeTitle(userInput);
  
  // All data collected - ask for confirmation
  await updateIntentPayload(userId, { 
    title, 
    awaitingConfirmation: true,
    expectedInput: 'NONE'
  });
  
  return toAssistantResponse(buildTaskConfirmation(title));
}

async function collectEventData(
  userId: string,
  userInput: string,
  payload: IntentPayload
): Promise<AssistantResponse> {
  const expectedInput = payload.expectedInput || 'TITLE';
  let updatedPayload = { ...payload };
  
  // Collect title
  if (expectedInput === 'TITLE' || !payload.title) {
    if (!isValidTitle(userInput)) {
      return {
        message: '❓ Che evento vuoi creare?',
        source: 'operator',
        actionExecuted: false
      };
    }
    
    updatedPayload.title = normalizeTitle(userInput);
    updatedPayload.expectedInput = 'DATE';
    await updateIntentPayload(userId, updatedPayload);
    
    return {
      message: '❓ Quando?',
      source: 'operator',
      actionExecuted: false
    };
  }
  
  // Collect date
  if (expectedInput === 'DATE' || !payload.date) {
    const date = extractData(userInput, 'DATE') as string | null;
    const time = extractData(userInput, 'TIME') as string | null;
    
    if (!date) {
      return {
        message: '❓ Che giorno? (es. domani, lunedì, 15/01)',
        source: 'operator',
        actionExecuted: false
      };
    }
    
    updatedPayload.date = date;
    if (time) updatedPayload.startTime = time;
    
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
  
  // Collect time
  if (expectedInput === 'TIME' || !payload.startTime) {
    const time = extractData(userInput, 'TIME') as string | null;
    
    if (!time) {
      return {
        message: '❓ A che ora? (es. 15:00, alle 10)',
        source: 'operator',
        actionExecuted: false
      };
    }
    
    updatedPayload.startTime = time;
  }
  
  // All data collected - ask for confirmation
  updatedPayload.awaitingConfirmation = true;
  updatedPayload.expectedInput = 'NONE';
  await updateIntentPayload(userId, updatedPayload);
  
  return toAssistantResponse(buildEventConfirmation({
    title: updatedPayload.title!,
    date: updatedPayload.date!,
    startTime: updatedPayload.startTime!
  }));
}

async function collectExpenseData(
  userId: string,
  userInput: string,
  payload: IntentPayload
): Promise<AssistantResponse> {
  const expectedInput = payload.expectedInput || 'AMOUNT';
  let updatedPayload = { ...payload };
  
  // Collect amount
  if (expectedInput === 'AMOUNT' || !payload.amount) {
    const amount = extractData(userInput, 'AMOUNT') as number | null;
    
    if (!amount || amount <= 0) {
      return {
        message: '❓ Quanto hai speso? (es. 25, 12.50)',
        source: 'operator',
        actionExecuted: false
      };
    }
    
    updatedPayload.amount = amount;
    updatedPayload.expectedInput = 'CATEGORY';
    await updateIntentPayload(userId, updatedPayload);
    
    return {
      message: '❓ Per cosa?',
      source: 'operator',
      actionExecuted: false
    };
  }
  
  // Collect category
  if (expectedInput === 'CATEGORY' || !payload.category) {
    if (!isValidTitle(userInput)) {
      return {
        message: '❓ Per cosa era la spesa?',
        source: 'operator',
        actionExecuted: false
      };
    }
    
    updatedPayload.category = normalizeTitle(userInput);
  }
  
  // All data collected - ask for confirmation
  updatedPayload.awaitingConfirmation = true;
  updatedPayload.expectedInput = 'NONE';
  await updateIntentPayload(userId, updatedPayload);
  
  return toAssistantResponse(buildExpenseConfirmation({
    amount: updatedPayload.amount!,
    category: updatedPayload.category!
  }));
}

async function handleTypeChoice(
  userId: string,
  userInput: string,
  payload: IntentPayload
): Promise<AssistantResponse> {
  const type = extractData(userInput, 'TYPE') as string | null;
  
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
    if (title && isValidTitle(title)) {
      // Have title - ask for confirmation
      await setActiveIntent(userId, 'CREATE_TASK', { 
        title: normalizeTitle(title),
        awaitingConfirmation: true,
        expectedInput: 'NONE'
      }, []);
      return toAssistantResponse(buildTaskConfirmation(normalizeTitle(title)));
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

async function handleIndexSelection(
  userId: string,
  userInput: string,
  state: AssistantState
): Promise<AssistantResponse> {
  const payload = state.intent_payload;
  const listContext = payload.last_list_context;
  
  if (!listContext) {
    await clearActiveIntent(userId);
    return toAssistantResponse(handleAmbiguous());
  }
  
  const indexMatch = userInput.match(/^(\d+)$/);
  if (!indexMatch) {
    return {
      message: `❓ Quale numero? (1-${listContext.ids.length})`,
      source: 'operator',
      actionExecuted: false
    };
  }
  
  const index = parseInt(indexMatch[1], 10) - 1;
  
  if (index < 0 || index >= listContext.ids.length) {
    return {
      message: `❓ Scegli da 1 a ${listContext.ids.length}.`,
      source: 'operator',
      actionExecuted: false
    };
  }
  
  const id = listContext.ids[index];
  const title = listContext.titles?.[index];
  const pendingAction = payload.pendingAction;
  
  // Ask for confirmation before delete/complete
  if (pendingAction === 'delete') {
    await updateIntentPayload(userId, {
      selectedId: id,
      selectedTitle: title,
      awaitingConfirmation: true
    });
    
    return {
      message: title 
        ? `Vuoi eliminare "${title}"? (sì/no)` 
        : 'Vuoi eliminarlo? (sì/no)',
      source: 'operator',
      actionExecuted: false,
      suggestions: ['Sì', 'No']
    };
  }
  
  if (pendingAction === 'complete' && listContext.type === 'TASK') {
    // Complete doesn't need confirmation (it's not destructive)
    await dataService.completeTask(userId, id);
    await clearActiveIntent(userId);
    return {
      message: title ? `✅ "${title}" completato!` : '✅ Completato!',
      source: 'operator',
      actionExecuted: true
    };
  }
  
  await clearActiveIntent(userId);
  return toAssistantResponse(handleAmbiguous());
}

// ========== OPERATOR COMMAND HANDLER ==========

/**
 * Handle operator commands
 * For WRITE operations: collect data then ask for confirmation
 * For READ operations: execute immediately
 */
async function handleOperatorCommand(
  userId: string,
  intent: string,
  extracted?: string,
  rawMessage?: string
): Promise<OperatorResponse> {
  console.log('Handling operator command:', intent, extracted);
  
  switch (intent) {
    // ========== READ OPERATIONS (immediate execution) ==========
    case 'SHOW_TASKS': {
      const response = await executeShowTasks(userId);
      if (response.data?.ids?.length > 0) {
        await updateIntentPayload(userId, {
          last_list_context: response.data
        });
        await setLastAction(userId, 'SHOW_TASKS', response.data);
      }
      return response;
    }
    
    case 'SHOW_EVENTS': {
      const response = await executeShowEvents(userId);
      if (response.data?.ids?.length > 0) {
        await updateIntentPayload(userId, {
          last_list_context: response.data
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
    
    // ========== WRITE OPERATIONS (require confirmation) ==========
    case 'CREATE_TASK': {
      if (extracted && isValidTitle(extracted)) {
        const title = normalizeTitle(extracted);
        // All data present - ask for confirmation
        await setActiveIntent(userId, 'CREATE_TASK', { 
          title,
          awaitingConfirmation: true,
          expectedInput: 'NONE'
        }, []);
        return buildTaskConfirmation(title);
      }
      
      // Need title
      await setActiveIntent(userId, 'CREATE_TASK', { expectedInput: 'TITLE' }, ['title']);
      return {
        message: '❓ Che task vuoi creare?',
        source: 'operator',
        actionExecuted: false,
        nextExpected: 'TITLE'
      };
    }
    
    case 'CREATE_EVENT': {
      const dateFromMsg = rawMessage ? extractData(rawMessage, 'DATE') as string | null : null;
      const timeFromMsg = rawMessage ? extractData(rawMessage, 'TIME') as string | null : null;
      
      if (extracted && isValidTitle(extracted) && dateFromMsg && timeFromMsg) {
        const title = normalizeTitle(extracted);
        // All data present - ask for confirmation
        await setActiveIntent(userId, 'CREATE_EVENT', { 
          title,
          date: dateFromMsg,
          startTime: timeFromMsg,
          awaitingConfirmation: true,
          expectedInput: 'NONE'
        }, []);
        return buildEventConfirmation({ title, date: dateFromMsg, startTime: timeFromMsg });
      }
      
      // Need more data
      await setActiveIntent(userId, 'CREATE_EVENT', {
        title: extracted ? normalizeTitle(extracted) : undefined,
        date: dateFromMsg || undefined,
        startTime: timeFromMsg || undefined,
        expectedInput: !extracted ? 'TITLE' : !dateFromMsg ? 'DATE' : 'TIME'
      }, []);
      
      if (!extracted) {
        return { message: '❓ Che evento vuoi creare?', source: 'operator', actionExecuted: false, nextExpected: 'TITLE' };
      }
      if (!dateFromMsg) {
        return { message: '❓ Quando?', source: 'operator', actionExecuted: false, nextExpected: 'DATE' };
      }
      return { message: '❓ A che ora?', source: 'operator', actionExecuted: false, nextExpected: 'TIME' };
    }
    
    case 'RECORD_EXPENSE': {
      let amount: number | undefined;
      let category: string | undefined;
      
      if (extracted) {
        const amountMatch = extracted.match(/(\d+(?:[.,]\d+)?)/);
        amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : undefined;
        const categoryText = extracted.replace(/€?\s*\d+(?:[.,]\d+)?\s*(?:euro|€)?/gi, '').trim();
        category = categoryText && isValidTitle(categoryText) ? normalizeTitle(categoryText) : undefined;
      }
      
      if (amount && category) {
        // All data present - ask for confirmation
        await setActiveIntent(userId, 'RECORD_EXPENSE', {
          amount,
          category,
          awaitingConfirmation: true,
          expectedInput: 'NONE'
        }, []);
        return buildExpenseConfirmation({ amount, category });
      }
      
      // Need more data
      await setActiveIntent(userId, 'RECORD_EXPENSE', {
        amount,
        category,
        expectedInput: !amount ? 'AMOUNT' : 'CATEGORY'
      }, []);
      
      if (!amount) {
        return { message: '❓ Quanto hai speso?', source: 'operator', actionExecuted: false, nextExpected: 'AMOUNT' };
      }
      return { message: '❓ Per cosa?', source: 'operator', actionExecuted: false, nextExpected: 'CATEGORY' };
    }
    
    case 'CHOOSE_TYPE': {
      await setActiveIntent(userId, 'CREATE_GENERIC', {
        pendingTitle: extracted,
        expectedInput: 'TYPE'
      }, ['type']);
      return askTypeChoice(extracted);
    }
    
    case 'COMPLETE_TASK':
    case 'DELETE_TASK':
    case 'DELETE_EVENT':
    case 'DELETE_EXPENSE': {
      // These require index selection first
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
      timestamp: new Date().toISOString()
    });
    await addToConversationHistory(userId, {
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to save conversation:', error);
  }
}

// Re-export for compatibility
export { processMessage as orchestrateMessage };
