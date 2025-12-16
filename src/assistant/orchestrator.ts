/**
 * Orchestrator - Unified interface for UI and future external AI
 * Now with Daily Focus Engine integration
 */

import { format, parse, isValid, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import type { 
  UserIntent, 
  IntentResult, 
  OrchestratorResponse, 
  EngineOutput 
} from './types';
import { 
  getContext, 
  getConversationHistory, 
  addToConversationHistory,
  getRecentMessages,
  extractConversationContext
} from './contextStore';
import { 
  runDailyAnalysis, 
  runMorningBriefing, 
  runEveningReview,
  getQuickSummary,
  generateSmartSuggestions,
  getContextualGreeting,
  getQuickActionSuggestions
} from './coreEngine';
import { runAllRules } from './rulesEngine';
import { getUserPatterns, predictBestTimeSlots, predictWeaknesses } from './habitsEngine';
import { 
  calculateDailyFocus, 
  isFocusRequest, 
  formatFocusResponse 
} from './dailyFocusEngine';
import { supabase } from '@/integrations/supabase/client';

// Intent patterns for classification
const INTENT_PATTERNS: Record<UserIntent, RegExp[]> = {
  greeting: [/^(ciao|salve|buongiorno|buonasera|ehi|hey|hi|hello)/i],
  farewell: [/^(arrivederci|a dopo|ciao ciao|bye|addio)/i],
  thanks: [/^(grazie|thanks|thank you|ti ringrazio)/i],
  query_tasks: [/(task|cosa (devo|ho da) fare|attività|to.?do|impegni)/i],
  query_events: [/(eventi|calendario|appuntamenti|cosa ho in programma|meeting)/i],
  query_expenses: [/(spese|speso|costi|quanto ho speso)/i],
  query_budget: [/(budget|limite|bilancio|quanto (mi )?resta)/i],
  query_wellness: [/(benessere|salute|sonno|passi|meditazione)/i],
  create_task: [/(aggiungi|crea|nuovo) (un )?task|(devo|ricordami di) (fare|comprare)/i],
  create_event: [/(aggiungi|crea|programma|inserisci) (un )?(evento|appuntamento|meeting)/i],
  create_expense: [/(registra|aggiungi|inserisci) (una )?spesa|ho speso/i],
  update_task: [/(segna|completa|fatto|finito|elimina) (il )?task/i],
  update_event: [/(modifica|sposta|cancella|elimina) (l')?(evento|appuntamento)/i],
  get_suggestions: [/(suggerimenti|consigli|cosa (potrei|dovrei) fare|aiutami)/i],
  get_insights: [/(analisi|insights|statistiche|come sto andando|riepilogo)/i],
  small_talk: [/(come (stai|va)|tutto bene|che fai)/i],
  help: [/(aiuto|come funziona|cosa (puoi|sai) fare)/i],
  unknown: []
};

// Response templates
const RESPONSE_TEMPLATES = {
  greeting: [
    'Ciao! Come posso aiutarti oggi?',
    'Eccomi! Cosa ti serve?',
    'Buongiorno! Sono qui per aiutarti.'
  ],
  farewell: [
    'A presto! 👋',
    'Ci vediamo dopo!',
    'Buona giornata!'
  ],
  thanks: [
    'Prego! Sono qui se hai bisogno.',
    'Di nulla! 😊',
    'Sempre a disposizione!'
  ],
  small_talk: [
    'Tutto bene, grazie! Tu come stai?',
    'Alla grande! Pronto ad aiutarti.',
    'Benissimo! Dimmi come posso esserti utile.'
  ],
  help: [
    'Posso aiutarti a gestire task, eventi, spese e molto altro! Prova a chiedermi:\n• "Mostra i miei task"\n• "Cosa ho in calendario?"\n• "Aggiungi una spesa"\n• "Come sta andando il mio budget?"'
  ],
  unknown: [
    'Non sono sicuro di aver capito. Puoi riformulare?',
    'Potresti spiegarmi meglio cosa ti serve?'
  ]
};

/**
 * Classify user intent from message
 */
function classifyIntent(message: string): IntentResult {
  const normalizedMessage = message.toLowerCase().trim();
  
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedMessage)) {
        return {
          intent: intent as UserIntent,
          confidence: 0.85,
          entities: extractEntities(message),
          requiresExternalAI: false
        };
      }
    }
  }

  // Check if it seems like a complex request
  const isComplex = normalizedMessage.length > 100 || 
    /perché|quando|come posso|qual è il migliore|consigliami/i.test(normalizedMessage);

  return {
    intent: 'unknown',
    confidence: 0.3,
    entities: extractEntities(message),
    requiresExternalAI: isComplex
  };
}

/**
 * Extract entities from message
 */
function extractEntities(message: string): Record<string, any> {
  const entities: Record<string, any> = {};
  
  // Extract date mentions
  const datePatterns = [
    { pattern: /oggi/i, value: format(new Date(), 'yyyy-MM-dd') },
    { pattern: /domani/i, value: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
    { pattern: /dopodomani/i, value: format(addDays(new Date(), 2), 'yyyy-MM-dd') }
  ];

  for (const { pattern, value } of datePatterns) {
    if (pattern.test(message)) {
      entities.date = value;
      break;
    }
  }

  // Extract amounts
  const amountMatch = message.match(/€?\s*(\d+(?:[.,]\d{2})?)/);
  if (amountMatch) {
    entities.amount = parseFloat(amountMatch[1].replace(',', '.'));
  }

  // Extract categories
  const categories = ['lavoro', 'casa', 'salute', 'shopping', 'cibo', 'trasporti', 'svago'];
  for (const cat of categories) {
    if (message.toLowerCase().includes(cat)) {
      entities.category = cat;
      break;
    }
  }

  return entities;
}

/**
 * Get random response from template
 */
function getRandomResponse(templates: string[]): string {
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Handle user message - Main orchestration function
 * Now with Daily Focus Engine as primary handler for guidance requests
 */
export async function handleUserMessage(
  userId: string, 
  message: string
): Promise<OrchestratorResponse> {
  // FIRST: Check if this is a focus/guidance request
  if (isFocusRequest(message)) {
    return await handleFocusRequest(userId);
  }

  // Classify intent
  const intentResult = classifyIntent(message);
  
  // Get conversation context
  const recentMessages = await getRecentMessages(userId, 5);
  const conversationContext = extractConversationContext(recentMessages);

  // Handle based on intent
  let response: OrchestratorResponse;

  switch (intentResult.intent) {
    case 'greeting':
      // For greetings, also provide focus if there are pending items
      const [greetingData, focus] = await Promise.all([
        getContextualGreeting(userId),
        calculateDailyFocus(userId)
      ]);
      
      if (focus.items.length > 0) {
        const formatted = formatFocusResponse(focus);
        response = {
          message: `${greetingData.greeting} ${formatted.message}`,
          suggestions: formatted.suggestions,
          decision: formatted.decision,
          reasoning: formatted.reasoning,
          focusItems: focus.items,
          source: 'focus'
        };
      } else {
        response = {
          message: `${greetingData.greeting} ${greetingData.context}`,
          suggestions: getQuickActionSuggestions(),
          source: 'local'
        };
      }
      break;

    case 'farewell':
      response = {
        message: getRandomResponse(RESPONSE_TEMPLATES.farewell),
        source: 'local'
      };
      break;

    case 'thanks':
      response = {
        message: getRandomResponse(RESPONSE_TEMPLATES.thanks),
        source: 'local'
      };
      break;

    case 'small_talk':
      response = {
        message: getRandomResponse(RESPONSE_TEMPLATES.small_talk),
        suggestions: getQuickActionSuggestions(),
        source: 'local'
      };
      break;

    case 'help':
      response = {
        message: RESPONSE_TEMPLATES.help[0],
        suggestions: ['Mostra i task', 'Eventi di oggi', 'Registra spesa'],
        source: 'local'
      };
      break;

    case 'query_tasks':
      response = await handleQueryTasks(userId);
      break;

    case 'query_events':
      response = await handleQueryEvents(userId);
      break;

    case 'query_expenses':
      response = await handleQueryExpenses(userId, intentResult.entities);
      break;

    case 'query_budget':
      response = await handleQueryBudget(userId);
      break;

    case 'get_suggestions':
      response = await handleGetSuggestions(userId);
      break;

    case 'get_insights':
      response = await handleGetInsights(userId);
      break;

    case 'create_task':
    case 'create_event':
    case 'create_expense':
    case 'update_task':
    case 'update_event':
      // These require more complex handling - signal for external AI
      response = {
        message: 'Capisco che vuoi creare o modificare qualcosa. Puoi darmi più dettagli?',
        followUp: intentResult.intent,
        source: 'local'
      };
      break;

    default:
      // Unknown intent - provide helpful response based on context
      if (intentResult.requiresExternalAI) {
        response = {
          message: 'Questa è una domanda interessante. Lascia che ci pensi...',
          source: 'context'
        };
      } else {
        const summary = await getQuickSummary(userId);
        response = {
          message: `${getRandomResponse(RESPONSE_TEMPLATES.unknown)} Nel frattempo: ${summary}`,
          suggestions: getQuickActionSuggestions(),
          source: 'local'
        };
      }
  }

  // Save to conversation history
  await addToConversationHistory(userId, {
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
    intent: intentResult.intent,
    entities: intentResult.entities
  });

  await addToConversationHistory(userId, {
    role: 'assistant',
    content: response.message,
    timestamp: new Date().toISOString()
  });

  return response;
}

/**
 * Generate smart suggestion for proactive assistance
 */
export async function generateSmartSuggestion(userId: string): Promise<OrchestratorResponse> {
  const suggestions = await generateSmartSuggestions(userId);
  
  if (suggestions.length === 0) {
    return {
      message: 'Tutto sembra a posto per ora! Continua così.',
      source: 'rules'
    };
  }

  const topSuggestion = suggestions[0];
  return {
    message: topSuggestion.message,
    suggestions: suggestions.slice(1, 4).map(s => s.title),
    action: topSuggestion.suggestedAction,
    source: 'rules'
  };
}

/**
 * Get assistant response for specific intent and payload
 */
export async function getAssistantResponse(
  userId: string,
  intent: string,
  payload: Record<string, any>
): Promise<OrchestratorResponse> {
  switch (intent) {
    case 'morning_briefing':
      const briefing = await runMorningBriefing(userId);
      return {
        message: `${briefing.greeting}\n\n📅 ${briefing.date}\n\n` +
          `📋 ${briefing.tasksToday} task da completare\n` +
          `📆 ${briefing.eventsToday} eventi oggi\n\n` +
          (briefing.topPriorities.length > 0 
            ? `🎯 Priorità:\n${briefing.topPriorities.map(p => `• ${p}`).join('\n')}\n\n`
            : '') +
          (briefing.motivationalNote || ''),
        suggestions: briefing.suggestions.map(s => s.title),
        source: 'rules'
      };

    case 'evening_review':
      const review = await runEveningReview(userId);
      return {
        message: `${review.summary}\n\n` +
          review.highlights.join('\n') +
          (review.tomorrowPreview.length > 0
            ? `\n\n📅 Domani:\n${review.tomorrowPreview.join('\n')}`
            : ''),
        source: 'rules'
      };

    case 'daily_analysis':
      const analysis = await runDailyAnalysis(userId);
      return {
        message: `📊 Analisi giornaliera:\n\n` +
          `• ${analysis.pendingTasks} task in sospeso\n` +
          `• ${analysis.completedTasks} task completati\n` +
          `• ${analysis.upcomingEvents} eventi oggi\n` +
          `• Budget: ${analysis.budgetStatus.percentage.toFixed(0)}% utilizzato`,
        suggestions: analysis.suggestions.slice(0, 3).map(s => s.title),
        source: 'rules'
      };

    default:
      return {
        message: 'Come posso aiutarti?',
        suggestions: getQuickActionSuggestions(),
        source: 'local'
      };
  }
}

// Helper handlers for specific intents
async function handleQueryTasks(userId: string): Promise<OrchestratorResponse> {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', false)
    .order('priority', { ascending: false })
    .limit(5);

  if (!tasks || tasks.length === 0) {
    return {
      message: 'Non hai task in sospeso! 🎉 Vuoi aggiungerne uno?',
      suggestions: ['Aggiungi un task', 'Mostra completati'],
      source: 'local'
    };
  }

  const taskList = tasks.map(t => {
    const priority = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
    return `${priority} ${t.title}`;
  }).join('\n');

  return {
    message: `Ecco i tuoi task (${tasks.length}):\n\n${taskList}`,
    suggestions: ['Segna come fatto', 'Aggiungi task', 'Vedi tutti'],
    source: 'local'
  };
}

async function handleQueryEvents(userId: string): Promise<OrchestratorResponse> {
  const now = new Date();
  const todayStart = format(now, 'yyyy-MM-dd 00:00:00');
  const todayEnd = format(now, 'yyyy-MM-dd 23:59:59');

  const { data: events } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', todayStart)
    .lte('start_time', todayEnd)
    .order('start_time', { ascending: true });

  if (!events || events.length === 0) {
    return {
      message: 'Nessun evento in programma per oggi. Giornata libera! 🎉',
      suggestions: ['Aggiungi evento', 'Vedi settimana', 'Suggerimenti'],
      source: 'local'
    };
  }

  const eventList = events.map(e => {
    const time = format(new Date(e.start_time), 'HH:mm');
    return `⏰ ${time} - ${e.title}`;
  }).join('\n');

  return {
    message: `Eventi di oggi (${events.length}):\n\n${eventList}`,
    suggestions: ['Prossimo evento', 'Aggiungi evento', 'Vedi domani'],
    source: 'local'
  };
}

async function handleQueryExpenses(userId: string, entities: Record<string, any>): Promise<OrchestratorResponse> {
  const now = new Date();
  const startOfMonth = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startOfMonth)
    .order('date', { ascending: false })
    .limit(10);

  const total = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

  if (!expenses || expenses.length === 0) {
    return {
      message: 'Nessuna spesa registrata questo mese.',
      suggestions: ['Registra spesa', 'Vedi budget'],
      source: 'local'
    };
  }

  const recentExpenses = expenses.slice(0, 5).map(e => {
    return `• €${Number(e.amount).toFixed(2)} - ${e.description || e.category || 'Altro'}`;
  }).join('\n');

  return {
    message: `💰 Spese di questo mese: €${total.toFixed(2)}\n\nUltime spese:\n${recentExpenses}`,
    suggestions: ['Registra spesa', 'Analisi categorie', 'Vedi budget'],
    source: 'local'
  };
}

async function handleQueryBudget(userId: string): Promise<OrchestratorResponse> {
  const analysis = await runDailyAnalysis(userId);
  const { budgetStatus } = analysis;

  let emoji = '✅';
  if (budgetStatus.percentage >= 100) emoji = '🚨';
  else if (budgetStatus.percentage >= 80) emoji = '⚠️';
  else if (budgetStatus.percentage >= 50) emoji = '📊';

  const remaining = budgetStatus.budget - budgetStatus.spent;

  return {
    message: `${emoji} Budget mensile:\n\n` +
      `• Speso: €${budgetStatus.spent.toFixed(2)}\n` +
      `• Budget: €${budgetStatus.budget.toFixed(2)}\n` +
      `• Rimanente: €${remaining.toFixed(2)}\n` +
      `• Utilizzo: ${budgetStatus.percentage.toFixed(0)}%`,
    suggestions: ['Modifica budget', 'Vedi spese', 'Analisi'],
    source: 'local'
  };
}

async function handleGetSuggestions(userId: string): Promise<OrchestratorResponse> {
  const suggestions = await generateSmartSuggestions(userId);

  if (suggestions.length === 0) {
    return {
      message: 'Non ho suggerimenti particolari per ora. Stai andando alla grande! 👍',
      source: 'rules'
    };
  }

  const suggestionList = suggestions.slice(0, 3).map(s => {
    const icon = s.type === 'alert' ? '⚠️' : s.type === 'reminder' ? '⏰' : '💡';
    return `${icon} ${s.message}`;
  }).join('\n\n');

  return {
    message: `Ecco i miei suggerimenti:\n\n${suggestionList}`,
    suggestions: suggestions.slice(0, 3).map(s => s.title),
    source: 'rules'
  };
}

async function handleGetInsights(userId: string): Promise<OrchestratorResponse> {
  const patterns = await getUserPatterns(userId);
  const weaknesses = await predictWeaknesses(userId);
  const analysis = await runDailyAnalysis(userId);

  let message = '📈 Analisi delle tue abitudini:\n\n';

  // Add patterns
  if (patterns.length > 0) {
    message += patterns.slice(0, 2).map(p => `• ${p.description}`).join('\n') + '\n\n';
  }

  // Add weaknesses as areas to improve
  if (weaknesses.length > 0) {
    message += '🎯 Aree di miglioramento:\n';
    message += weaknesses.slice(0, 2).map(w => `• ${w}`).join('\n');
  }

  return {
    message,
    suggestions: ['Briefing mattutino', 'Review serale', 'Vedi suggerimenti'],
    source: 'rules'
  };
}

/**
 * Handle focus/guidance requests using Daily Focus Engine
 */
async function handleFocusRequest(userId: string): Promise<OrchestratorResponse> {
  const focus = await calculateDailyFocus(userId);
  const formatted = formatFocusResponse(focus);

  return {
    message: formatted.message,
    suggestions: formatted.suggestions,
    decision: formatted.decision,
    reasoning: formatted.reasoning,
    focusItems: focus.items,
    source: 'focus'
  };
}

// Export all functions for external use
export {
  classifyIntent,
  extractEntities,
  getQuickActionSuggestions,
  handleFocusRequest
};
