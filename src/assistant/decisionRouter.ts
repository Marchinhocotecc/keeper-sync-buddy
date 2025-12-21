/**
 * Decision Router - Deterministic routing between Local Executor and AI Advisor
 * 
 * PHASE 3 of the Assistant Pipeline
 * 
 * ROUTING RULES (NON-NEGOTIABLE):
 * A) CREATE_* intents → LOCAL EXECUTOR ONLY, AI cannot speak
 * B) QUERY_* intents → LOCAL EXECUTOR ONLY, no AI
 * C) ADVICE_CONTEXTUAL → Analyze context first, AI only if needed
 * D) ADVICE_GENERAL / SMALL_TALK → AI ADVISOR allowed
 * E) UNKNOWN → ONE clarification question, never loop
 */

import type { ParsedIntent, AssistantIntent, ExtractedData } from './intentParser';
import type { UserContext } from './contextLoader';
import type { ExecutionResult } from './localExecutor';
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

// Track unknown count per user to prevent loops
const unknownCounts = new Map<string, number>();
const MAX_UNKNOWN_ATTEMPTS = 2;

/**
 * Route the parsed intent to the appropriate handler
 * Returns a response ONLY after proper execution/analysis
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
  console.log('Extracted:', JSON.stringify(extractedData, null, 2));
  
  // Reset unknown count on valid intent
  if (intent !== 'UNKNOWN') {
    unknownCounts.set(userId, 0);
  }
  
  // Route based on intent
  switch (intent) {
    // ============ CREATE INTENTS → LOCAL EXECUTOR ONLY ============
    case 'CREATE_EVENT':
      return handleCreateEvent(userId, extractedData, confidence, requiresClarification, clarificationQuestion);
    
    case 'CREATE_TASK':
      return handleCreateTask(userId, extractedData, confidence, requiresClarification, clarificationQuestion);
    
    case 'CREATE_EXPENSE':
      return handleCreateExpense(userId, extractedData, confidence, requiresClarification, clarificationQuestion);
    
    // ============ QUERY INTENTS → LOCAL EXECUTOR ONLY ============
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
    
    // ============ UNKNOWN ============
    case 'UNKNOWN':
      return handleUnknown(userId, clarificationQuestion);
    
    default:
      return handleUnknown(userId, clarificationQuestion);
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
  // Confidence gate: < 0.8 requires clarification - SET PENDING INTENT
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
  
  // Clear pending on success attempt
  clearPendingIntent(userId);
  
  // Execute create
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

async function handleCreateExpense(
  userId: string,
  data: ExtractedData,
  confidence: number,
  requiresClarification: boolean,
  clarificationQuestion?: string
): Promise<RouterResponse> {
  if (confidence < 0.8 || requiresClarification) {
    const question = clarificationQuestion || 'Qual è l\'importo della spesa?';
    setPendingIntent(userId, 'CREATE_EXPENSE', data, question);
    return {
      message: question,
      source: 'local',
      actionPerformed: false,
      requiresClarification: true,
      clarificationQuestion: question
    };
  }
  
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
 * Get specific question based on what's missing
 */
function getMissingFieldQuestion(intent: string, data: ExtractedData): string {
  if (intent === 'CREATE_EVENT') {
    if (!data.title) return 'Come si chiama l\'evento?';
    if (!data.date) return 'Quando?';
    if (!data.startTime) return 'A che ora?';
    return 'Mi servono titolo, data e ora.';
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
    suggestions: ['Aggiungi task', 'Segna come fatto'],
    source: 'local',
    actionPerformed: false,
    requiresClarification: false
  };
}

function handleQueryEvents(context: UserContext): RouterResponse {
  const result = queryEvents(context);
  
  return {
    message: result.message,
    suggestions: ['Aggiungi evento', 'Vedi domani'],
    source: 'local',
    actionPerformed: false,
    requiresClarification: false
  };
}

function handleQueryExpenses(context: UserContext): RouterResponse {
  const result = queryExpenses(context);
  
  return {
    message: result.message,
    suggestions: ['Registra spesa', 'Vedi budget'],
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
  // Get AI advice with context
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
  // Get general AI answer
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
  if (/^(?:ciao|salve|buongiorno|buonasera|hey|hi|hello)/i.test(lowerMessage)) {
    const greeting = getContextualGreeting(context);
    return {
      message: greeting,
      suggestions: ['Mostra i task', 'Cosa ho oggi?', 'Suggerimenti'],
      source: 'local',
      actionPerformed: false,
      requiresClarification: false
    };
  }
  
  // Thanks
  if (/^(?:grazie|thanks|ok|perfetto|ottimo)/i.test(lowerMessage)) {
    return {
      message: 'Prego! Sono qui se hai bisogno. 😊',
      source: 'local',
      actionPerformed: false,
      requiresClarification: false
    };
  }
  
  // How are you
  if (/come\s+(?:stai|va)/i.test(lowerMessage)) {
    return {
      message: 'Tutto bene, grazie! Tu come stai? Come posso aiutarti?',
      source: 'local',
      actionPerformed: false,
      requiresClarification: false
    };
  }
  
  // Farewell
  if (/^(?:arrivederci|a\s+dopo|ciao\s+ciao|bye)/i.test(lowerMessage)) {
    return {
      message: 'A presto! 👋',
      source: 'local',
      actionPerformed: false,
      requiresClarification: false
    };
  }
  
  // Default
  return {
    message: 'Ciao! Come posso aiutarti?',
    suggestions: ['Mostra i task', 'Eventi di oggi', 'Registra spesa'],
    source: 'local',
    actionPerformed: false,
    requiresClarification: false
  };
}

// ============ UNKNOWN HANDLER - NO GENERIC FALLBACKS ============

function handleUnknown(userId: string, clarificationQuestion?: string): RouterResponse {
  // Check if there's a pending intent we can reference
  const pending = getPendingIntent(userId);
  
  if (pending) {
    const attempts = incrementPendingAttempts(userId);
    if (attempts <= 2) {
      // Continue asking for pending intent data
      return {
        message: pending.clarificationQuestion,
        source: 'local',
        actionPerformed: false,
        requiresClarification: true,
        clarificationQuestion: pending.clarificationQuestion
      };
    } else {
      // Too many attempts, clear and give up - NO generic fallback
      clearPendingIntent(userId);
      return {
        message: '',
        source: 'local',
        actionPerformed: false,
        requiresClarification: false
      };
    }
  }
  
  // NO pending intent and UNKNOWN - return EMPTY (no generic response)
  return {
    message: '',
    source: 'local',
    actionPerformed: false,
    requiresClarification: false
  };
}

/**
 * Reset unknown count for user
 */
export function resetUnknownCount(userId: string): void {
  unknownCounts.set(userId, 0);
}
