/**
 * AI Advisor - External AI for advice ONLY
 * 
 * CRITICAL RULES:
 * - Can ONLY suggest, reason, explain
 * - Can NEVER claim to perform actions
 * - Can NEVER create/modify/delete data
 * - All action execution goes through Local Executor
 */

import { sendToExternalAI, formatHistoryForAI } from './openrouterClient';
import type { UserContext } from './contextLoader';
import type { ConversationMessage } from './types';

export interface AdvisorResponse {
  message: string;
  suggestions?: string[];
  source: 'ai_advisor';
}

/**
 * Get contextual advice based on user's data
 * AI receives context and provides personalized suggestions
 */
export async function getContextualAdvice(
  userMessage: string,
  context: UserContext,
  recentMessages: ConversationMessage[]
): Promise<AdvisorResponse> {
  // Build context summary for AI
  const contextSummary = buildContextSummary(context);
  
  // Format conversation history
  const formattedHistory = formatHistoryForAI(recentMessages);
  
  // Enhance prompt with context
  const enhancedPrompt = `
CONTESTO UTENTE:
${contextSummary}

RICHIESTA: ${userMessage}

ISTRUZIONI: Fornisci suggerimenti personalizzati basati sul contesto dell'utente.
- NON dire mai "ho creato" o "ho aggiunto"
- NON promettere azioni
- Suggerisci max 3 cose concrete
- Sii conciso e utile`;

  try {
    const response = await sendToExternalAI(enhancedPrompt, formattedHistory);
    
    if (response.success && response.response?.message) {
      // Clean any action claims from AI response
      const cleanedMessage = cleanActionClaims(response.response.message);
      
      return {
        message: cleanedMessage,
        suggestions: extractSuggestions(cleanedMessage),
        source: 'ai_advisor'
      };
    }
  } catch (error) {
    console.error('AI Advisor error:', error);
  }
  
  // Fallback to local suggestions
  return generateLocalAdvice(context);
}

/**
 * Get general knowledge answers (non-contextual)
 * For questions like "di che colore è il cielo?"
 */
export async function getGeneralAnswer(
  userMessage: string,
  recentMessages: ConversationMessage[]
): Promise<AdvisorResponse> {
  const formattedHistory = formatHistoryForAI(recentMessages);
  
  const prompt = `
DOMANDA: ${userMessage}

ISTRUZIONI: Rispondi in modo conciso e informativo.
- NON menzionare task, eventi, spese o l'app
- NON offrire aiuto con produttività
- Rispondi solo alla domanda`;

  try {
    const response = await sendToExternalAI(prompt, formattedHistory);
    
    if (response.success && response.response?.message) {
      return {
        message: cleanActionClaims(response.response.message),
        source: 'ai_advisor'
      };
    }
  } catch (error) {
    console.error('AI Advisor error:', error);
  }
  
  return {
    message: 'Non ho informazioni su questo argomento. Posso aiutarti con task, eventi o spese?',
    source: 'ai_advisor'
  };
}

/**
 * Generate local advice without external AI
 */
function generateLocalAdvice(context: UserContext): AdvisorResponse {
  const suggestions: string[] = [];
  const parts: string[] = [];
  
  // Analyze context and generate suggestions
  if (context.pendingTasks.length > 5) {
    parts.push('Hai molti task in sospeso. Ti consiglio di:');
    suggestions.push('Completare i task più urgenti');
    suggestions.push('Riorganizzare le priorità');
  } else if (context.pendingTasks.length === 0) {
    parts.push('Non hai task in sospeso. Potresti:');
    suggestions.push('Pianificare la settimana');
    suggestions.push('Dedicare tempo al benessere');
  }
  
  if (context.todayEvents.length > 0) {
    parts.push(`Hai ${context.todayEvents.length} eventi oggi.`);
    suggestions.push('Preparati per il prossimo evento');
  } else {
    suggestions.push('Aggiungere un momento di relax');
  }
  
  if (context.budgetPercentage >= 80) {
    parts.push(`⚠️ Budget al ${context.budgetPercentage.toFixed(0)}%.`);
    suggestions.push('Controllare le spese');
  }
  
  // Build message
  if (parts.length === 0) {
    parts.push('Ecco cosa potresti fare:');
  }
  
  const message = parts.join('\n') + '\n\n' + suggestions.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join('\n');
  
  return {
    message,
    suggestions: suggestions.slice(0, 3),
    source: 'ai_advisor'
  };
}

/**
 * Build context summary for AI prompt
 */
function buildContextSummary(context: UserContext): string {
  const parts: string[] = [];
  
  // Tasks
  if (context.pendingTasks.length > 0) {
    const taskTitles = context.pendingTasks.slice(0, 5).map(t => t.title).join(', ');
    parts.push(`Task in sospeso (${context.pendingTasks.length}): ${taskTitles}`);
  } else {
    parts.push('Task: nessun task in sospeso');
  }
  
  // Events
  if (context.todayEvents.length > 0) {
    const eventTitles = context.todayEvents.map(e => {
      const time = new Date(e.start_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      return `${time} ${e.title}`;
    }).join(', ');
    parts.push(`Eventi oggi (${context.todayEvents.length}): ${eventTitles}`);
  } else {
    parts.push('Eventi oggi: nessuno');
  }
  
  // Budget
  parts.push(`Budget: €${context.totalSpent.toFixed(0)} spesi su €${context.budget.toFixed(0)} (${context.budgetPercentage.toFixed(0)}%)`);
  
  return parts.join('\n');
}

/**
 * CRITICAL: Remove any action claims from AI response
 */
function cleanActionClaims(message: string): string {
  return message
    // Italian
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
    .replace(/spesa registrata/gi, 'potresti registrare la spesa')
    // Remove claims of having done something
    .replace(/ho già\s+/gi, 'puoi ')
    .replace(/l'ho\s+/gi, 'puoi ')
    .replace(/ti ho\s+/gi, 'ti suggerisco di ');
}

/**
 * Extract actionable suggestions from AI response
 */
function extractSuggestions(message: string): string[] {
  const suggestions: string[] = [];
  
  // Look for numbered items
  const numberedPattern = /(?:\d+[\.\)]\s*)([^\.!\n]+)/g;
  let match;
  while ((match = numberedPattern.exec(message)) !== null) {
    const suggestion = match[1].trim();
    if (suggestion.length > 3 && suggestion.length < 100) {
      suggestions.push(suggestion);
    }
  }
  
  // Look for bulleted items
  const bulletPattern = /(?:[-•]\s*)([^\.!\n]+)/g;
  while ((match = bulletPattern.exec(message)) !== null) {
    const suggestion = match[1].trim();
    if (suggestion.length > 3 && suggestion.length < 100 && !suggestions.includes(suggestion)) {
      suggestions.push(suggestion);
    }
  }
  
  return suggestions.slice(0, 3);
}
