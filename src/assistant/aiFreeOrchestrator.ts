/**
 * AI FREE ORCHESTRATOR - The ONLY brain for FREE plan users
 * 
 * ARCHITECTURE:
 * 1. Call DeepSeek R1 Free via Lovable AI Gateway
 * 2. Receive structured JSON output (intent + reply + data)
 * 3. Validate via actionValidator.ts (code, not AI)
 * 4. Execute via ActionEngine (only after confirmation)
 * 
 * INVARIANT: No write action without explicit "sì" confirmation
 * 
 * NO LEGACY PIPELINES:
 * - NO statefulHandler
 * - NO decisionRouter
 * - NO mergeWithPendingIntent
 * - NO legacy pipeline
 */

import { supabase } from '@/integrations/supabase/client';
import {
  validateActionData,
  isWriteAction,
  normalizeTitle,
  isForbiddenTitle,
  type AIFreeIntent,
  type AIFreeData,
  type AIFreeOutput
} from './actionValidator';
import {
  getState,
  patchState,
  clearActiveIntent,
  type AssistantState
} from '@/services/assistantStateService';
import {
  createTask,
  createEvent,
  recordExpense,
  queryTasks,
  queryEvents,
  queryExpenses,
  deleteTask,
  deleteAllTasks,
  deleteEvent,
  deleteAllEvents,
  deleteAllExpenses
} from '@/engine/ActionEngine';
import { addToConversationHistory } from './contextStore';

// Re-export for convenience
export { deleteTask, deleteAllTasks, deleteEvent, deleteAllEvents, deleteAllExpenses };

// ========== TYPES ==========

export interface AIFreeResponse {
  message: string;
  source: 'ai_free';
  actionExecuted: boolean;
  suggestions?: string[];
  data?: any;
}

// Pending action state stored in assistant_state
interface PendingAction {
  intent: AIFreeIntent;
  data: AIFreeData;
  confirmationQuestion: string;
}

// ========== CANCEL/CONFIRM DETECTION ==========

const CANCEL_PATTERNS = [
  /^(?:no|annulla|stop|basta|lascia\s*(?:stare|perdere)?|niente|cancella|cambia\s*idea|non\s*importa)$/i,
];

const CONFIRM_PATTERNS = [
  /^(?:s[iì]|sì|si|conferma|confermo)$/i,
];

function isCancel(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return CANCEL_PATTERNS.some(p => p.test(normalized));
}

function isConfirm(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return CONFIRM_PATTERNS.some(p => p.test(normalized));
}

// ========== UI ACTION HANDLING ==========

const UI_ACTION_PREFIX = '__UI_ACTION__:';

function isUIAction(message: string): boolean {
  return message.startsWith(UI_ACTION_PREFIX);
}

function parseUIAction(message: string): AIFreeIntent | null {
  if (!isUIAction(message)) return null;
  
  const action = message.slice(UI_ACTION_PREFIX.length);
  
  const mapping: Record<string, AIFreeIntent> = {
    'SHOW_TASKS': 'QUERY_TASKS',
    'SHOW_EVENTS': 'QUERY_EVENTS',
    'SHOW_EXPENSES': 'QUERY_BUDGET',
    'DELETE_ALL_TASKS': 'DELETE_ALL_TASKS',
    'DELETE_ALL_EVENTS': 'DELETE_ALL_EVENTS',
    'DELETE_ALL_EXPENSES': 'DELETE_ALL_EXPENSES',
    'ADD_TASK': 'CREATE_TASK',
    'CREATE_EVENT': 'CREATE_EVENT',
    'DELETE_ALL': 'DELETE_ALL_TASKS', // Default to tasks
    'COMPLETE_ALL_TASKS': 'NONE', // Will be handled specially
  };
  
  return mapping[action] || null;
}

// Note: System prompt is now handled by the ai-free-chat edge function

// ========== CALL AI FREE (via Edge Function - SECURE) ==========

async function callAIFree(userMessage: string, userId: string): Promise<AIFreeOutput> {
  console.log('[AIFree] Calling ai-free-chat edge function');
  
  try {
    const { data, error } = await supabase.functions.invoke('ai-free-chat', {
      body: {
        userMessage,
        locale: 'it'
      }
    });
    
    if (error) {
      console.error('[AIFree] Edge function error:', error);
      return getDefaultOutput('⚠️ Errore temporaneo. Riprova.');
    }
    
    // Edge function returns the structured response
    if (data && data.reply) {
      return {
        intent: data.intent || 'NONE',
        reply: data.reply,
        data: data.data || {},
        needsConfirmation: data.needsConfirmation || false,
        confirmationQuestion: data.confirmationQuestion || null
      };
    }
    
    return getDefaultOutput('⚠️ Risposta non valida. Riprova.');
    
  } catch (error) {
    console.error('[AIFree] Error calling edge function:', error);
    return getDefaultOutput('⚠️ Errore di connessione. Riprova.');
  }
}

// Note: parseAIResponse is now handled by the edge function

function getDefaultOutput(reply: string): AIFreeOutput {
  return {
    intent: 'NONE',
    reply,
    data: {},
    needsConfirmation: false,
    confirmationQuestion: null
  };
}

// ========== STATE MANAGEMENT ==========

async function getPendingAction(userId: string): Promise<PendingAction | null> {
  const state = await getState(userId);
  const payload = state.intent_payload;
  
  if (payload.awaitingConfirmation && payload.pendingAction) {
    try {
      return JSON.parse(payload.pendingAction as unknown as string) as PendingAction;
    } catch {
      // Try direct access if it's already an object
      return payload.pendingAction as unknown as PendingAction;
    }
  }
  
  return null;
}

async function setPendingAction(userId: string, action: PendingAction): Promise<void> {
  await patchState(userId, {
    intent_payload: {
      awaitingConfirmation: true,
      pendingAction: action as any
    }
  });
}

async function clearPendingAction(userId: string): Promise<void> {
  await clearActiveIntent(userId);
}

// ========== ACTION EXECUTION ==========

async function executeAction(
  userId: string,
  intent: AIFreeIntent,
  data: AIFreeData
): Promise<{ success: boolean; message: string; result?: any }> {
  console.log('[AIFree] Executing action:', intent, data);
  
  switch (intent) {
    case 'CREATE_TASK': {
      if (!data.title) return { success: false, message: 'Titolo mancante' };
      const result = await createTask({ user_id: userId, title: normalizeTitle(data.title) });
      return result.success 
        ? { success: true, message: `✅ Task "${normalizeTitle(data.title)}" creato.`, result: result.data }
        : { success: false, message: '⚠️ Errore nella creazione del task.' };
    }
    
    case 'CREATE_EVENT': {
      if (!data.title || !data.date || !data.time) {
        return { success: false, message: 'Dati mancanti per l\'evento' };
      }
      const result = await createEvent({
        user_id: userId,
        title: normalizeTitle(data.title),
        date: data.date,
        start_time: data.time
      });
      return result.success
        ? { success: true, message: `✅ Evento "${normalizeTitle(data.title)}" creato per ${data.date} alle ${data.time}.`, result: result.data }
        : { success: false, message: '⚠️ Errore nella creazione dell\'evento.' };
    }
    
    case 'RECORD_EXPENSE': {
      if (!data.amount || !data.category) {
        return { success: false, message: 'Dati mancanti per la spesa' };
      }
      const result = await recordExpense({
        user_id: userId,
        amount: data.amount,
        category: data.category
      });
      return result.success
        ? { success: true, message: `✅ Spesa di €${data.amount.toFixed(2)} registrata.`, result: result.data }
        : { success: false, message: '⚠️ Errore nella registrazione della spesa.' };
    }
    
    case 'QUERY_TASKS': {
      const result = await queryTasks(userId);
      if (!result.success || !result.data || result.data.length === 0) {
        return { success: true, message: '📋 Non hai task al momento.' };
      }
      const taskList = result.data.map((t: any, i: number) => 
        `${i + 1}. ${t.completed ? '✅' : '⬜'} ${t.title}`
      ).join('\n');
      return { success: true, message: `📋 I tuoi task:\n${taskList}`, result: result.data };
    }
    
    case 'QUERY_EVENTS': {
      const result = await queryEvents(userId);
      if (!result.success || !result.data || result.data.length === 0) {
        return { success: true, message: '📅 Non hai eventi in programma.' };
      }
      const eventList = result.data.map((e: any, i: number) => 
        `${i + 1}. ${e.title} - ${e.start_time}`
      ).join('\n');
      return { success: true, message: `📅 I tuoi eventi:\n${eventList}`, result: result.data };
    }
    
    case 'QUERY_BUDGET': {
      const result = await queryExpenses(userId);
      if (!result.success || !result.data || result.data.length === 0) {
        return { success: true, message: '💰 Nessuna spesa registrata.' };
      }
      const total = result.data.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      return { success: true, message: `💰 Spese totali: €${total.toFixed(2)}`, result: result.data };
    }
    
    case 'DELETE_ALL_TASKS': {
      await deleteAllTasks(userId);
      return { success: true, message: '✅ Tutti i task eliminati.' };
    }
    
    case 'DELETE_ALL_EVENTS': {
      await deleteAllEvents(userId);
      return { success: true, message: '✅ Tutti gli eventi eliminati.' };
    }
    
    case 'DELETE_ALL_EXPENSES': {
      await deleteAllExpenses(userId);
      return { success: true, message: '✅ Tutte le spese eliminate.' };
    }
    
    case 'ADVICE': {
      return { success: true, message: '🌟 Per consigli personalizzati, passa al piano Premium!' };
    }
    
    case 'NONE':
    default:
      return { success: true, message: 'Cosa vuoi fare? 🙂' };
  }
}

// ========== MAIN ORCHESTRATOR ==========

/**
 * Process user message through AI FREE
 * This is the ONLY entry point for FREE users
 * 
 * NO LEGACY CODE IS CALLED:
 * - No statefulHandler
 * - No decisionRouter  
 * - No mergeWithPendingIntent
 */
export async function processAIFreeMessage(
  userId: string,
  message: string
): Promise<AIFreeResponse> {
  console.log('=== AI FREE Orchestrator ===');
  console.log('[AIFree] User:', userId);
  console.log('[AIFree] Message:', message);
  
  const trimmed = message.trim();
  
  // ========== PHASE 1: CANCEL ALWAYS FIRST ==========
  if (isCancel(trimmed)) {
    console.log('[AIFree] Cancel detected');
    await clearPendingAction(userId);
    return {
      message: 'Ok, annullato 🙂 Dimmi pure cosa vuoi fare.',
      source: 'ai_free',
      actionExecuted: false
    };
  }
  
  // ========== PHASE 2: CHECK FOR PENDING CONFIRMATION ==========
  const pendingAction = await getPendingAction(userId);
  
  if (pendingAction) {
    console.log('[AIFree] Pending action found:', pendingAction.intent);
    
    if (isConfirm(trimmed)) {
      console.log('[AIFree] User confirmed - executing');
      
      // Validate one more time
      const validation = validateActionData(pendingAction.intent, pendingAction.data);
      if (!validation.valid) {
        await clearPendingAction(userId);
        return {
          message: `⚠️ ${validation.errors.join('. ')}`,
          source: 'ai_free',
          actionExecuted: false
        };
      }
      
      // Execute the action
      const result = await executeAction(userId, pendingAction.intent, pendingAction.data);
      await clearPendingAction(userId);
      
      return {
        message: result.message,
        source: 'ai_free',
        actionExecuted: result.success,
        data: result.result
      };
    }
    
    // Any other response cancels
    console.log('[AIFree] User did not confirm - cancelling');
    await clearPendingAction(userId);
    return {
      message: 'Ok, annullato 🙂 Dimmi pure cosa vuoi fare.',
      source: 'ai_free',
      actionExecuted: false
    };
  }
  
  // ========== PHASE 3: UI ACTIONS (DIRECT EXECUTION) ==========
  if (isUIAction(trimmed)) {
    const uiIntent = parseUIAction(trimmed);
    console.log('[AIFree] UI Action:', uiIntent);
    
    if (uiIntent && !isWriteAction(uiIntent)) {
      // Read actions - execute directly
      const result = await executeAction(userId, uiIntent, {});
      return {
        message: result.message,
        source: 'ai_free',
        actionExecuted: result.success,
        data: result.result,
        suggestions: getSuggestionsForIntent(uiIntent)
      };
    }
    
    if (uiIntent && isWriteAction(uiIntent)) {
      // Write action - ask for confirmation
      const confirmation = getConfirmationForIntent(uiIntent, {});
      await setPendingAction(userId, {
        intent: uiIntent,
        data: {},
        confirmationQuestion: confirmation
      });
      
      return {
        message: confirmation,
        source: 'ai_free',
        actionExecuted: false,
        suggestions: ['Sì', 'No']
      };
    }
  }
  
  // ========== PHASE 4: CALL AI FREE ==========
  const aiOutput = await callAIFree(trimmed, userId);
  console.log('[AIFree] AI output:', aiOutput);
  
  // ========== PHASE 5: VALIDATE OUTPUT ==========
  
  // Block ADVICE intent
  if (aiOutput.intent === 'ADVICE') {
    return {
      message: '🌟 Per consigli personalizzati, passa al piano Premium!',
      source: 'ai_free',
      actionExecuted: false
    };
  }
  
  // For NONE intent, just reply
  if (aiOutput.intent === 'NONE') {
    return {
      message: aiOutput.reply,
      source: 'ai_free',
      actionExecuted: false
    };
  }
  
  // Validate data
  const validation = validateActionData(aiOutput.intent, aiOutput.data);
  
  // If validation fails, ask for missing data
  if (!validation.valid) {
    console.log('[AIFree] Validation failed:', validation.missingFields);
    
    // AI already asked for missing data in reply
    return {
      message: aiOutput.reply,
      source: 'ai_free',
      actionExecuted: false
    };
  }
  
  // ========== PHASE 6: HANDLE WRITE ACTIONS (REQUIRE CONFIRMATION) ==========
  if (isWriteAction(aiOutput.intent)) {
    console.log('[AIFree] Write action - requiring confirmation');
    
    // Block forbidden titles
    if (aiOutput.data.title && isForbiddenTitle(aiOutput.data.title)) {
      return {
        message: '❓ Dimmi cosa vuoi creare esattamente.',
        source: 'ai_free',
        actionExecuted: false
      };
    }
    
    // Set pending action and ask for confirmation
    const confirmation = aiOutput.confirmationQuestion || getConfirmationForIntent(aiOutput.intent, aiOutput.data);
    await setPendingAction(userId, {
      intent: aiOutput.intent,
      data: aiOutput.data,
      confirmationQuestion: confirmation
    });
    
    return {
      message: confirmation,
      source: 'ai_free',
      actionExecuted: false,
      suggestions: ['Sì', 'No']
    };
  }
  
  // ========== PHASE 7: EXECUTE READ ACTIONS ==========
  const result = await executeAction(userId, aiOutput.intent, aiOutput.data);
  
  return {
    message: result.message,
    source: 'ai_free',
    actionExecuted: result.success,
    data: result.result,
    suggestions: getSuggestionsForIntent(aiOutput.intent)
  };
}

// ========== HELPERS ==========

function getConfirmationForIntent(intent: AIFreeIntent, data: AIFreeData): string {
  switch (intent) {
    case 'CREATE_TASK':
      return data.title 
        ? `📝 Creo il task "${normalizeTitle(data.title)}"? (sì/no)`
        : '📝 Che task vuoi creare?';
    case 'CREATE_EVENT':
      if (data.title && data.date && data.time) {
        return `📅 Creo l'evento "${normalizeTitle(data.title)}" il ${data.date} alle ${data.time}? (sì/no)`;
      }
      return '📅 Dimmi titolo, data e ora dell\'evento.';
    case 'RECORD_EXPENSE':
      if (data.amount && data.category) {
        return `💰 Registro €${data.amount.toFixed(2)} per "${data.category}"? (sì/no)`;
      }
      return '💰 Dimmi importo e categoria della spesa.';
    case 'DELETE_ALL_TASKS':
      return '🗑️ Elimino tutti i task? (sì/no)';
    case 'DELETE_ALL_EVENTS':
      return '🗑️ Elimino tutti gli eventi? (sì/no)';
    case 'DELETE_ALL_EXPENSES':
      return '🗑️ Elimino tutte le spese? (sì/no)';
    default:
      return 'Confermi? (sì/no)';
  }
}

function getSuggestionsForIntent(intent: AIFreeIntent): string[] {
  switch (intent) {
    case 'QUERY_TASKS':
      return ['Completa uno', 'Elimina uno', 'Aggiungi task'];
    case 'QUERY_EVENTS':
      return ['Elimina uno', 'Aggiungi evento'];
    case 'QUERY_BUDGET':
      return ['Aggiungi spesa', 'Elimina una'];
    default:
      return ['Mostra task', 'Mostra eventi', 'Aggiungi task'];
  }
}

// ========== SAVE CONVERSATION ==========

async function saveConversation(userId: string, userMsg: string, assistantMsg: string): Promise<void> {
  try {
    // Create proper ConversationMessage objects
    await addToConversationHistory(userId, {
      role: 'user',
      content: userMsg,
      timestamp: new Date().toISOString()
    });
    await addToConversationHistory(userId, {
      role: 'assistant',
      content: assistantMsg,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[AIFree] Error saving conversation:', error);
  }
}
