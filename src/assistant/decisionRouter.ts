/**
 * Decision Router - Deterministic, action-driven routing
 * 
 * PHASE 3 of the Assistant Pipeline
 * 
 * RULES (NON-NEGOTIABLE):
 * 1. If active intent exists → ALWAYS continue it
 * 2. CREATE_GENERIC → Ask "task o evento?"
 * 3. RECORD_EXPENSE → Process expense or ask missing field
 * 4. NEVER use generic fallbacks
 * 5. NEVER say "non ho capito"
 * 6. Every input produces action OR clarification question
 */

import type { ParsedIntent, AssistantIntent, ExtractedData } from './intentParser';
import type { UserContext } from './contextLoader';
import { 
  createTask, 
  queryDaySummary,
  queryTasks,
  queryEvents,
  queryExpenses,
  queryBudget
} from './localExecutor';
import { getContextualAdvice, getGeneralAnswer } from './aiAdvisor';
import { getContextualGreeting } from './contextLoader';
import { setPendingIntent, clearPendingIntent, incrementPendingAttempts, getPendingIntent, updatePendingIntent } from './contextStore';
import { parseNaturalDate, formatEventDate, formatEventTime } from '@/utils/dateParser';
import { createEvent as actionCreateEvent, recordExpense as actionRecordExpense } from '@/engine/ActionEngine';
import { recalculateBudgetForUser } from '@/services/budgetService';
import { setLastAction } from '@/services/assistantStateService';

export interface RouterResponse {
  message: string;
  suggestions?: string[];
  source: 'local' | 'ai_advisor';
  actionPerformed: boolean;
  requiresClarification: boolean;
  clarificationQuestion?: string;
}

/**
 * Route the parsed intent to the appropriate handler
 * NEVER returns empty or generic responses
 */
export async function routeDecision(
  userId: string,
  parsedIntent: ParsedIntent,
  context: UserContext
): Promise<RouterResponse> {
  const { intent, confidence, extractedData, requiresClarification, clarificationQuestion } = parsedIntent;
  
  console.log('=== Decision Router ===');
  console.log('Intent:', intent);
  console.log('Confidence:', confidence);
  console.log('Data:', JSON.stringify(extractedData, null, 2));
  
  // Route based on intent
  switch (intent) {
    // ============ CREATE INTENTS ============
    case 'CREATE_EVENT':
      return handleCreateEvent(userId, extractedData, confidence, requiresClarification, clarificationQuestion);
    
    case 'CREATE_TASK':
      return handleCreateTask(userId, extractedData, confidence, requiresClarification, clarificationQuestion);
    
    case 'CREATE_EXPENSE':
    case 'RECORD_EXPENSE':
      return handleRecordExpense(userId, extractedData, confidence, requiresClarification, clarificationQuestion);
    
    case 'CREATE_GENERIC':
      return handleCreateGeneric(userId, extractedData, clarificationQuestion);
    
    // ============ QUERY INTENTS ============
    case 'QUERY_DAY':
      return handleQueryDay(context, extractedData);
    
    case 'QUERY_TASKS':
      return handleQueryTasks(context);
    
    case 'QUERY_EVENTS':
      return handleQueryEvents(context);
    
    case 'QUERY_EXPENSES':
      return handleQueryExpenses(context);
    
    case 'QUERY_BUDGET':
      return handleQueryBudget(context);
    
    // ============ ADVICE INTENTS ============
    case 'ADVICE_CONTEXTUAL':
      return handleAdviceContextual(userId, extractedData.rawText, context);
    
    case 'ADVICE_GENERAL':
      return handleAdviceGeneral(userId, extractedData.rawText, context);
    
    // ============ SMALL TALK ============
    case 'SMALL_TALK':
      return handleSmallTalk(context, extractedData.rawText);
    
    default:
      // Default: treat as CREATE_GENERIC
      return handleCreateGeneric(userId, extractedData, 'Vuoi creare un task o un evento?');
  }
}

// ============ CREATE HANDLERS ============

async function handleCreateEvent(
  userId: string,
  data: ExtractedData,
  confidence: number,
  requiresClarification: boolean,
  clarificationQuestion?: string
): Promise<RouterResponse> {
  // Enrich from rawText (weekday + time) deterministically
  const parsed = parseNaturalDate(data.rawText || '');
  if (parsed) {
    const isoDate = parsed.date.toISOString().split('T')[0];
    data.date = data.date ?? isoDate;

    // Only treat time as present if user provided a specific time
    if (parsed.hasSpecificTime) {
      data.startTime = data.startTime ?? formatEventTime(parsed.date);
    }
  }

  const hasTitle = !!data.title && data.title.trim().length > 0;
  const hasDate = !!data.date;
  const hasTime = !!data.startTime;

  // If minimum fields are present, create immediately via ActionEngine
  if (hasTitle && hasDate && hasTime) {
    clearPendingIntent(userId);

    const result = await actionCreateEvent({
      user_id: userId,
      title: data.title!.trim(),
      date: data.date!,
      start_time: data.startTime,
      end_time: data.endTime,
      category: data.category,
    });

    if (!result.success) {
      return {
        message: 'Errore nella creazione dell\'evento. Riprova.',
        source: 'local',
        actionPerformed: false,
        requiresClarification: false,
      };
    }

    const humanDate = parsed ? formatEventDate(parsed.date) : data.date!;
    const humanTime = data.startTime!;

    return {
      message: `✅ Ho creato l'evento: "${data.title!.trim()}" ${humanDate} alle ${humanTime}.`,
      source: 'local',
      actionPerformed: true,
      requiresClarification: false,
    };
  }

  // Otherwise, clarify deterministically without looping "Quando?"
  const pending = getPendingIntent(userId);
  const lastQ = pending?.clarificationQuestion;

  let nextQuestion: string;
  if (!hasDate && !hasTime) nextQuestion = 'Quando?';
  else if (!hasDate) nextQuestion = 'Mi serve solo la data (es: venerdì).';
  else nextQuestion = 'Mi serve solo l\'orario (es: 8:30).';

  // If we already asked "Quando?" and user replied, never ask "Quando?" again
  if (lastQ === 'Quando?' && nextQuestion === 'Quando?') {
    const attempts = incrementPendingAttempts(userId);
    // After a "Quando?" attempt, be more specific
    nextQuestion = attempts <= 2 ? 'Mi serve solo la data e l\'orario (es: venerdì 8:30).' : 'Mi serve solo l\'orario (es: 8:30).';
  } else {
    incrementPendingAttempts(userId);
  }

  if (pending) {
    updatePendingIntent(userId, { extractedData: data, clarificationQuestion: nextQuestion });
  } else {
    setPendingIntent(userId, 'CREATE_EVENT', data, nextQuestion);
  }

  return {
    message: nextQuestion,
    source: 'local',
    actionPerformed: false,
    requiresClarification: true,
    clarificationQuestion: nextQuestion,
  };
}

async function handleCreateTask(
  userId: string,
  data: ExtractedData,
  confidence: number,
  requiresClarification: boolean,
  clarificationQuestion?: string
): Promise<RouterResponse> {
  if (confidence < 0.8 || requiresClarification) {
    const question = clarificationQuestion || 'Cosa vuoi aggiungere come task?';
    setPendingIntent(userId, 'CREATE_TASK', data, question);
    return {
      message: question,
      source: 'local',
      actionPerformed: false,
      requiresClarification: true,
      clarificationQuestion: question
    };
  }
  
  clearPendingIntent(userId);
  const result = await createTask(userId, data);
  
  // Risposta più conversazionale
  const taskTitle = data.title || 'nuovo task';
  const friendlyMessage = result.success 
    ? `✅ Ho aggiunto il task: "${taskTitle}".`
    : result.message;
  
  return {
    message: friendlyMessage,
    source: 'local',
    actionPerformed: result.success,
    requiresClarification: !result.success
  };
}

/**
 * Handle RECORD_EXPENSE - number detected, process or ask for missing data
 */
async function handleRecordExpense(
  userId: string,
  data: ExtractedData,
  confidence: number,
  requiresClarification: boolean,
  clarificationQuestion?: string
): Promise<RouterResponse> {
  console.log('handleRecordExpense - data:', JSON.stringify(data));

  // Required: amount + category
  const hasAmount = data.amount !== undefined && data.amount > 0;
  const hasCategory = data.category && data.category.length > 1;

  if (!hasAmount) {
    const q = 'Quanto hai speso?';
    const pending = getPendingIntent(userId);
    if (pending) updatePendingIntent(userId, { extractedData: data, clarificationQuestion: q });
    else setPendingIntent(userId, 'RECORD_EXPENSE', data, q);

    return {
      message: q,
      source: 'local',
      actionPerformed: false,
      requiresClarification: true,
      clarificationQuestion: q,
    };
  }

  if (!hasCategory) {
    const q = 'Per cosa?';
    const pending = getPendingIntent(userId);
    if (pending) updatePendingIntent(userId, { extractedData: data, clarificationQuestion: q });
    else setPendingIntent(userId, 'RECORD_EXPENSE', data, q);

    return {
      message: q,
      source: 'local',
      actionPerformed: false,
      requiresClarification: true,
      clarificationQuestion: q,
    };
  }

  // Execute via ActionEngine
  clearPendingIntent(userId);

  const note = (() => {
    // Prefer user text without the amount as note/description
    const raw = (data.rawText || '').trim();
    if (!raw) return undefined;
    const cleaned = raw.replace(/€?\s*\d+(?:[.,]\d+)?\s*(?:euro|€)?/gi, '').trim();
    return cleaned.length > 0 ? cleaned : undefined;
  })();

  const result = await actionRecordExpense({
    user_id: userId,
    amount: data.amount!,
    category: String(data.category).trim(),
    date: data.date,
    note,
  });

  if (!result.success) {
    return {
      message: 'Errore nella registrazione della spesa. Riprova.',
      source: 'local',
      actionPerformed: false,
      requiresClarification: false,
    };
  }

  // Recalculate budget for next context load
  await recalculateBudgetForUser(userId);

  const formattedAmount = data.amount!.toFixed(2).replace('.', ',');
  return {
    message: `✅ Ho registrato una spesa di ${formattedAmount}€ per ${note || String(data.category).trim()}.`,
    source: 'local',
    actionPerformed: true,
    requiresClarification: false,
  };
}

/**
 * Handle CREATE_GENERIC - user said something that's not expense or question
 * ALWAYS ask: "Vuoi creare un task o un evento?"
 */
function handleCreateGeneric(
  userId: string,
  data: ExtractedData,
  clarificationQuestion?: string
): RouterResponse {
  const question = clarificationQuestion || 'Vuoi creare un task o un evento?';
  
  // Store pending with the title
  setPendingIntent(userId, 'CREATE_GENERIC', data, question);
  
  return {
    message: question,
    source: 'local',
    actionPerformed: false,
    requiresClarification: true,
    clarificationQuestion: question
  };
}

/**
 * Get specific question based on what's missing
 */
function getMissingFieldQuestion(intent: string, data: ExtractedData): string {
  if (intent === 'CREATE_EVENT') {
    if (!data.title) return 'Come si chiama l\'evento?';
    if (!data.date) return 'Quando?';
    if (!data.startTime) return 'A che ora?';
    return 'Mi servono titolo, data e ora.';
  }
  if (intent === 'RECORD_EXPENSE') {
    if (!data.amount) return 'Quanto hai speso?';
    if (!data.category) return 'Per cosa?';
  }
  return 'Mi servono più dettagli.';
}

// ============ QUERY HANDLERS ============

function handleQueryDay(context: UserContext, data: ExtractedData): RouterResponse {
  const timeRange = data.timeRange || 'today';
  const result = queryDaySummary(context, timeRange === 'tomorrow' ? 'tomorrow' : 'today');
  
  return {
    message: result.message,
    source: 'local',
    actionPerformed: false,
    requiresClarification: false
  };
}

function handleQueryTasks(context: UserContext): RouterResponse {
  const result = queryTasks(context);
  
  return {
    message: result.message,
    source: 'local',
    actionPerformed: false,
    requiresClarification: false
  };
}

function handleQueryEvents(context: UserContext): RouterResponse {
  const result = queryEvents(context);
  
  return {
    message: result.message,
    source: 'local',
    actionPerformed: false,
    requiresClarification: false
  };
}

function handleQueryExpenses(context: UserContext): RouterResponse {
  const result = queryExpenses(context);
  
  return {
    message: result.message,
    source: 'local',
    actionPerformed: false,
    requiresClarification: false
  };
}

function handleQueryBudget(context: UserContext): RouterResponse {
  const result = queryBudget(context);
  
  return {
    message: result.message,
    source: 'local',
    actionPerformed: false,
    requiresClarification: false
  };
}

// ============ ADVICE HANDLERS ============

async function handleAdviceContextual(
  userId: string,
  message: string,
  context: UserContext
): Promise<RouterResponse> {
  const advice = await getContextualAdvice(message, context, context.recentMessages);
  
  // Set last action to ADVICE so follow-up "ok, pianifichiamo" works
  await setLastAction(userId, 'ADVICE', {});
  
  return {
    message: advice.message,
    suggestions: advice.suggestions,
    source: 'ai_advisor',
    actionPerformed: false,
    requiresClarification: false
  };
}

async function handleAdviceGeneral(
  userId: string,
  message: string,
  context: UserContext
): Promise<RouterResponse> {
  const lower = message.toLowerCase();
  
  // Handle delete commands locally without calling AI
  if (/(?:elimina|cancella|rimuovi|togli)\s+(?:tutt[eio]?\s+)?(?:le\s+)?spese?/i.test(lower)) {
    return {
      message: 'Per ora non posso eliminare tutte le spese con un solo comando. Vuoi che ti aiuti a registrare una nuova spesa o a vedere quelle recenti?',
      suggestions: ['Registra spesa', 'Mostra spese'],
      source: 'local',
      actionPerformed: false,
      requiresClarification: false
    };
  }
  
  if (/(?:elimina|cancella|rimuovi|togli)\s+(?:tutt[eio]?\s+)?(?:i\s+)?task/i.test(lower)) {
    return {
      message: 'Per ora non posso eliminare tutti i task con un solo comando. Vuoi che ti aiuti ad aggiungerne uno nuovo o a vedere quelli in sospeso?',
      suggestions: ['Aggiungi task', 'Mostra task'],
      source: 'local',
      actionPerformed: false,
      requiresClarification: false
    };
  }
  
  if (/(?:elimina|cancella|rimuovi|togli)\s+(?:tutt[eio]?\s+)?(?:gli\s+)?eventi?/i.test(lower)) {
    return {
      message: 'Per ora non posso eliminare tutti gli eventi con un solo comando. Vuoi che ti aiuti a crearne uno nuovo o a vedere quelli di oggi?',
      suggestions: ['Aggiungi evento', 'Eventi di oggi'],
      source: 'local',
      actionPerformed: false,
      requiresClarification: false
    };
  }
  
  const answer = await getGeneralAnswer(message, context.recentMessages);
  
  return {
    message: answer.message,
    source: 'ai_advisor',
    actionPerformed: false,
    requiresClarification: false
  };
}

// ============ SMALL TALK HANDLER ============

function handleSmallTalk(context: UserContext, message: string): RouterResponse {
  const lowerMessage = message.toLowerCase();
  
  // Greetings
  if (/^(?:ciao|salve|buongiorno|buonasera|hey|hi|hello)$/i.test(lowerMessage)) {
    const greeting = getContextualGreeting(context);
    return {
      message: greeting,
      source: 'local',
      actionPerformed: false,
      requiresClarification: false
    };
  }
  
  // Thanks
  if (/^(?:grazie|ok|perfetto|ottimo)$/i.test(lowerMessage)) {
    return {
      message: 'Prego! Serve altro?',
      source: 'local',
      actionPerformed: false,
      requiresClarification: false
    };
  }
  
  // How are you - più amichevole
  if (/^come\s+stai\??$/i.test(lowerMessage)) {
    const hasWork = context.pendingTasks.length > 0 || context.todayEvents.length > 0;
    const response = hasWork 
      ? `Bene, grazie! Hai ${context.pendingTasks.length} task e ${context.todayEvents.length} eventi oggi. Vuoi un riepilogo?`
      : 'Bene, grazie! Giornata tranquilla per ora. Vuoi aggiungere qualcosa?';
    return {
      message: response,
      source: 'local',
      actionPerformed: false,
      requiresClarification: false
    };
  }
  
  // Default greeting - più amichevole
  return {
    message: 'Ciao! Dimmi cosa vuoi fare: aggiungere un task, un evento o registrare una spesa.',
    source: 'local',
    actionPerformed: false,
    requiresClarification: false
  };
}

/**
 * Reset unknown count for user (kept for compatibility)
 */
export function resetUnknownCount(userId: string): void {
  // No-op - no longer using unknown counts
}
