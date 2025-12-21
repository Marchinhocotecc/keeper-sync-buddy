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
  createEvent, 
  createTask, 
  createExpense,
  queryDaySummary,
  queryTasks,
  queryEvents,
  queryExpenses,
  queryBudget
} from './localExecutor';
import { getContextualAdvice, getGeneralAnswer } from './aiAdvisor';
import { getContextualGreeting } from './contextLoader';
import { setPendingIntent, clearPendingIntent, incrementPendingAttempts, getPendingIntent } from './contextStore';

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
  if (confidence < 0.8 || requiresClarification) {
    const question = clarificationQuestion || getMissingFieldQuestion('CREATE_EVENT', data);
    setPendingIntent(userId, 'CREATE_EVENT', data, question);
    return {
      message: question,
      source: 'local',
      actionPerformed: false,
      requiresClarification: true,
      clarificationQuestion: question
    };
  }
  
  clearPendingIntent(userId);
  const result = await createEvent(userId, data);
  
  return {
    message: result.message,
    source: 'local',
    actionPerformed: result.success,
    requiresClarification: !result.success
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
  
  return {
    message: result.message,
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
  
  // Check what's missing
  const hasAmount = data.amount !== undefined && data.amount > 0;
  const hasCategory = data.category && data.category.length > 1;
  
  if (!hasAmount) {
    setPendingIntent(userId, 'RECORD_EXPENSE', data, 'Quanto hai speso?');
    return {
      message: 'Quanto hai speso?',
      source: 'local',
      actionPerformed: false,
      requiresClarification: true,
      clarificationQuestion: 'Quanto hai speso?'
    };
  }
  
  if (!hasCategory) {
    setPendingIntent(userId, 'RECORD_EXPENSE', data, 'Per cosa?');
    return {
      message: 'Per cosa?',
      source: 'local',
      actionPerformed: false,
      requiresClarification: true,
      clarificationQuestion: 'Per cosa?'
    };
  }
  
  // We have all data - execute
  clearPendingIntent(userId);
  const result = await createExpense(userId, data);
  
  return {
    message: result.message,
    source: 'local',
    actionPerformed: result.success,
    requiresClarification: !result.success
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
      message: 'Prego!',
      source: 'local',
      actionPerformed: false,
      requiresClarification: false
    };
  }
  
  // How are you
  if (/^come\s+stai\??$/i.test(lowerMessage)) {
    return {
      message: 'Tutto bene! Come posso aiutarti?',
      source: 'local',
      actionPerformed: false,
      requiresClarification: false
    };
  }
  
  // Default greeting
  return {
    message: 'Ciao! Aggiungi un task, un evento o una spesa.',
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
