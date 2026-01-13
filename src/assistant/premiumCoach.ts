/**
 * PREMIUM COACH - AI Analysis & Coaching (Premium Feature)
 * 
 * ROLE: COPILOT / COACH
 * 
 * CAPABILITIES:
 * ✅ Analyze tasks, events, expenses
 * ✅ Identify patterns
 * ✅ Propose actions
 * ✅ Suggest priorities
 * ✅ Provide lifestyle/productivity coaching
 * 
 * PROHIBITIONS:
 * ❌ Cannot write directly to database
 * ❌ Cannot create tasks/events without explicit user consent
 * ❌ Every proposal MUST end with confirmation request
 * 
 * EXECUTION FLOW:
 * 1. Coach analyzes and proposes
 * 2. User confirms
 * 3. Operator executes
 */

import { sendToExternalAI, formatHistoryForAI } from './openrouterClient';
import type { UserContext } from './contextLoader';
import type { ConversationMessage } from './types';

// ========== TYPES ==========

export interface CoachResponse {
  message: string;
  source: 'coach';
  suggestions?: string[];
  proposedActions?: ProposedAction[];
  requiresConfirmation: boolean;
}

export interface ProposedAction {
  type: 'CREATE_TASK' | 'CREATE_EVENT' | 'RECORD_EXPENSE';
  data: Record<string, any>;
  description: string;
}

// ========== COACHING FUNCTIONS ==========

/**
 * Get contextual coaching/advice based on user data
 * This is the main PREMIUM feature
 */
export async function getCoaching(
  userMessage: string,
  context: UserContext,
  recentMessages: ConversationMessage[]
): Promise<CoachResponse> {
  const contextSummary = buildContextSummary(context);
  const formattedHistory = formatHistoryForAI(recentMessages);
  
  const coachPrompt = `Sei un coach di produttività personale. Analizza la situazione dell'utente e fornisci consigli pratici.

CONTESTO UTENTE:
${contextSummary}

RICHIESTA: ${userMessage}

REGOLE IMPORTANTI:
1. NON dire MAI "ho creato", "ho aggiunto" - tu NON puoi eseguire azioni
2. Puoi SOLO consigliare e proporre
3. Ogni proposta DEVE terminare con "Vuoi che lo faccia?" o simile
4. Sii conciso (max 3-4 frasi)
5. Suggerisci max 3 azioni concrete

FORMATO RISPOSTA:
Fornisci analisi breve + max 3 suggerimenti numerati + domanda di conferma finale.`;

  try {
    const response = await sendToExternalAI(coachPrompt, formattedHistory);
    
    if (response.success && response.response?.message) {
      const cleanedMessage = cleanActionClaims(response.response.message);
      
      return {
        message: cleanedMessage,
        source: 'coach',
        suggestions: extractSuggestions(cleanedMessage),
        requiresConfirmation: true
      };
    }
  } catch (error) {
    console.error('Premium Coach error:', error);
  }
  
  // Fallback to local coaching
  return generateLocalCoaching(context, userMessage);
}

/**
 * Analyze user's productivity patterns
 */
export async function analyzePatterns(
  context: UserContext,
  recentMessages: ConversationMessage[]
): Promise<CoachResponse> {
  const summary = buildContextSummary(context);
  
  const analysisPrompt = `Analizza brevemente la produttività dell'utente basandoti su questi dati:

${summary}

Fornisci:
1. Un'osservazione principale (1 frase)
2. Un suggerimento concreto (1 frase)
3. Una domanda per capire meglio le priorità

NON dire di aver fatto azioni. Puoi solo osservare e consigliare.`;

  try {
    const response = await sendToExternalAI(analysisPrompt, formatHistoryForAI(recentMessages));
    
    if (response.success && response.response?.message) {
      return {
        message: cleanActionClaims(response.response.message),
        source: 'coach',
        requiresConfirmation: false
      };
    }
  } catch (error) {
    console.error('Pattern analysis error:', error);
  }
  
  return generateLocalCoaching(context, 'analisi');
}

/**
 * Propose a plan/organization
 */
export async function proposePlan(
  context: UserContext,
  userMessage: string,
  recentMessages: ConversationMessage[]
): Promise<CoachResponse> {
  const summary = buildContextSummary(context);
  
  const planPrompt = `L'utente vuole organizzarsi. Basandoti sui suoi dati, proponi un piano semplice.

CONTESTO:
${summary}

RICHIESTA: ${userMessage}

REGOLE:
1. Proponi max 3 azioni concrete
2. NON dire "ho creato" - proponi solo
3. Termina con "Vuoi che proceda con questi?" o simile
4. Sii breve e pratico`;

  try {
    const response = await sendToExternalAI(planPrompt, formatHistoryForAI(recentMessages));
    
    if (response.success && response.response?.message) {
      const cleanedMessage = cleanActionClaims(response.response.message);
      const actions = extractProposedActions(cleanedMessage);
      
      return {
        message: cleanedMessage,
        source: 'coach',
        proposedActions: actions,
        suggestions: actions.map(a => a.description),
        requiresConfirmation: true
      };
    }
  } catch (error) {
    console.error('Plan proposal error:', error);
  }
  
  return generateLocalCoaching(context, userMessage);
}

// ========== HELPER FUNCTIONS ==========

/**
 * Build context summary for AI
 */
function buildContextSummary(context: UserContext): string {
  const parts: string[] = [];
  
  // Tasks
  if (context.pendingTasks.length > 0) {
    const taskList = context.pendingTasks.slice(0, 5).map(t => t.title).join(', ');
    parts.push(`📋 Task in sospeso (${context.pendingTasks.length}): ${taskList}`);
  } else {
    parts.push('📋 Nessun task in sospeso');
  }
  
  // Events
  if (context.todayEvents.length > 0) {
    const eventList = context.todayEvents.map(e => {
      const time = new Date(e.start_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      return `${time} - ${e.title}`;
    }).join(', ');
    parts.push(`📅 Eventi oggi (${context.todayEvents.length}): ${eventList}`);
  } else {
    parts.push('📅 Nessun evento oggi');
  }
  
  // Budget
  const budgetStatus = context.budgetPercentage >= 80 ? '⚠️' : '✅';
  parts.push(`${budgetStatus} Budget: €${context.totalSpent.toFixed(0)}/€${context.budget.toFixed(0)} (${context.budgetPercentage.toFixed(0)}%)`);
  
  return parts.join('\n');
}

/**
 * Clean any action claims from AI response
 */
function cleanActionClaims(message: string): string {
  return message
    .replace(/ho aggiunto/gi, 'potresti aggiungere')
    .replace(/ho creato/gi, 'potresti creare')
    .replace(/ho registrato/gi, 'potresti registrare')
    .replace(/ho modificato/gi, 'potresti modificare')
    .replace(/ho cancellato/gi, 'potresti cancellare')
    .replace(/ho eliminato/gi, 'potresti eliminare')
    .replace(/ho completato/gi, 'potresti completare')
    .replace(/fatto!/gi, 'potresti farlo!')
    .replace(/evento creato/gi, 'potresti creare l\'evento')
    .replace(/task creato/gi, 'potresti creare il task')
    .replace(/l'ho\s+/gi, 'puoi ')
    .replace(/ti ho\s+/gi, 'ti suggerisco di ');
}

/**
 * Extract suggestions from AI response
 */
function extractSuggestions(message: string): string[] {
  const suggestions: string[] = [];
  
  // Numbered items
  const numberedPattern = /(?:\d+[\.\)]\s*)([^\.!\n]+)/g;
  let match;
  while ((match = numberedPattern.exec(message)) !== null) {
    const suggestion = match[1].trim();
    if (suggestion.length > 3 && suggestion.length < 100) {
      suggestions.push(suggestion);
    }
  }
  
  // Bulleted items
  const bulletPattern = /(?:[-•]\s*)([^\.!\n]+)/g;
  while ((match = bulletPattern.exec(message)) !== null) {
    const suggestion = match[1].trim();
    if (suggestion.length > 3 && suggestion.length < 100 && !suggestions.includes(suggestion)) {
      suggestions.push(suggestion);
    }
  }
  
  return suggestions.slice(0, 3);
}

/**
 * Extract proposed actions from AI response
 */
function extractProposedActions(message: string): ProposedAction[] {
  const actions: ProposedAction[] = [];
  
  // Simple heuristic: look for task/event mentions
  const taskMatch = message.match(/(?:task|attività)[:\s]+[""]?([^"".\n]+)/gi);
  if (taskMatch) {
    taskMatch.forEach(m => {
      const title = m.replace(/(?:task|attività)[:\s]+[""]?/i, '').replace(/[""]?$/, '').trim();
      if (title.length > 2) {
        actions.push({
          type: 'CREATE_TASK',
          data: { title },
          description: `Crea task: ${title}`
        });
      }
    });
  }
  
  return actions.slice(0, 3);
}

/**
 * Generate local coaching without external AI
 */
function generateLocalCoaching(context: UserContext, _topic: string): CoachResponse {
  const parts: string[] = [];
  const suggestions: string[] = [];
  
  // Analyze and suggest
  if (context.pendingTasks.length > 5) {
    parts.push('Hai molti task in sospeso.');
    suggestions.push('Completare i più urgenti');
    suggestions.push('Eliminare quelli non necessari');
  } else if (context.pendingTasks.length === 0) {
    parts.push('Non hai task attivi.');
    suggestions.push('Pianificare la settimana');
  } else {
    parts.push(`Hai ${context.pendingTasks.length} task da completare.`);
    suggestions.push('Iniziare dal più importante');
  }
  
  if (context.todayEvents.length > 0) {
    parts.push(`Oggi hai ${context.todayEvents.length} eventi.`);
  }
  
  if (context.budgetPercentage >= 80) {
    parts.push(`⚠️ Attenzione al budget (${context.budgetPercentage.toFixed(0)}%).`);
    suggestions.push('Controllare le spese');
  }
  
  parts.push('\nVuoi che ti aiuti a organizzarti?');
  
  return {
    message: parts.join(' '),
    source: 'coach',
    suggestions: suggestions.slice(0, 3),
    requiresConfirmation: true
  };
}

/**
 * Get the premium upgrade message for free users
 */
export function getPremiumUpgradeMessage(): CoachResponse {
  return {
    message: '🌟 Questa funzione richiede il piano Premium.\n\nCon Premium puoi:\n• Analisi personalizzate\n• Coaching produttività\n• Suggerimenti intelligenti\n\nVuoi saperne di più?',
    source: 'coach',
    requiresConfirmation: false,
    suggestions: ['Scopri Premium', 'Torna ai task']
  };
}
