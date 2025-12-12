/**
 * Fallback System - Local responses when external AI is unavailable
 */

import { getHours, isWeekend, format } from 'date-fns';
import { it } from 'date-fns/locale';
import type { AIEngineResult } from './typesAI';
import { getQuickActionSuggestions } from './suggestionsEngine';

// Fallback response templates
const FALLBACK_RESPONSES = {
  general: [
    'Sono qui per aiutarti! Posso gestire i tuoi task, eventi, spese e molto altro.',
    'Come posso assisterti? Prova a chiedermi di aggiungere un task o controllare il calendario.',
    'Eccomi! Dimmi cosa ti serve e farò del mio meglio per aiutarti.',
    'Sono il tuo assistente personale. Posso aiutarti con task, eventi e budget.'
  ],
  
  busy: [
    'In questo momento ho qualche difficoltà a elaborare richieste complesse. Posso comunque aiutarti con le funzioni base dell\'app.',
    'Il servizio avanzato è temporaneamente lento. Nel frattempo, posso mostrarti i tuoi task o eventi.',
    'Sto avendo qualche problema di connessione, ma posso ancora aiutarti con le funzioni locali.'
  ],
  
  suggestions: [
    'Ecco cosa posso fare per te:\n• Mostrare i tuoi task\n• Controllare il calendario\n• Verificare il budget\n• Registrare spese',
    'Prova a chiedermi:\n• "Mostra i miei task"\n• "Cosa ho in programma oggi?"\n• "Quanto ho speso questo mese?"',
    'Posso aiutarti con:\n📋 Task e to-do\n📅 Eventi e calendario\n💰 Spese e budget\n📝 Note'
  ],
  
  morning: [
    'Buongiorno! Iniziamo la giornata con il piede giusto. Vuoi vedere cosa hai in programma?',
    'Buongiorno! Sono pronto ad aiutarti. Vuoi un riepilogo della giornata?'
  ],
  
  afternoon: [
    'Buon pomeriggio! Come posso aiutarti?',
    'Buon pomeriggio! Vuoi controllare come sta andando la giornata?'
  ],
  
  evening: [
    'Buonasera! Vuoi fare un riepilogo della giornata?',
    'Buonasera! Posso aiutarti a pianificare domani.'
  ],
  
  weekend: [
    'Buon weekend! Anche se è giorno di riposo, sono qui se hai bisogno.',
    'Weekend time! Rilassati, ma se ti serve qualcosa sono qui.'
  ]
};

/**
 * Get appropriate fallback response based on context
 */
export function getFallbackResponse(context?: {
  wasExternalError?: boolean;
  userMessage?: string;
  lastIntent?: string;
}): AIEngineResult {
  const hour = getHours(new Date());
  const weekend = isWeekend(new Date());

  let responses: string[];
  
  // Choose response category based on context
  if (context?.wasExternalError) {
    responses = FALLBACK_RESPONSES.busy;
  } else if (weekend) {
    responses = FALLBACK_RESPONSES.weekend;
  } else if (hour < 12) {
    responses = FALLBACK_RESPONSES.morning;
  } else if (hour < 18) {
    responses = FALLBACK_RESPONSES.afternoon;
  } else {
    responses = FALLBACK_RESPONSES.evening;
  }

  // Add general response as fallback
  const allResponses = [...responses, ...FALLBACK_RESPONSES.general];
  const message = allResponses[Math.floor(Math.random() * allResponses.length)];

  return {
    message,
    source: 'fallback',
    suggestions: getQuickActionSuggestions()
  };
}

/**
 * Get contextual help response
 */
export function getHelpResponse(): AIEngineResult {
  const helpMessage = `Ecco cosa posso fare per te:

📋 **Task**
• "Mostra i miei task" - Vedi i task in sospeso
• "Aggiungi task [nome]" - Crea un nuovo task

📅 **Calendario**
• "Cosa ho oggi?" - Vedi gli eventi di oggi
• "Aggiungi evento [nome]" - Crea un evento

💰 **Spese & Budget**
• "Quanto ho speso?" - Vedi le spese del mese
• "Registra spesa €[importo]" - Aggiungi una spesa
• "Come sta il budget?" - Controlla il budget

💡 **Suggerimenti**
• "Dammi un consiglio" - Ottieni suggerimenti
• "Come sto andando?" - Analisi delle tue abitudini`;

  return {
    message: helpMessage,
    source: 'fallback',
    suggestions: ['Mostra task', 'Eventi oggi', 'Controlla budget']
  };
}

/**
 * Get error recovery response
 */
export function getErrorRecoveryResponse(errorType: 'timeout' | 'network' | 'parse' | 'unknown'): AIEngineResult {
  const messages: Record<string, string> = {
    timeout: 'La richiesta sta impiegando troppo tempo. Posso comunque aiutarti con le funzioni base dell\'app.',
    network: 'Problemi di connessione. Nel frattempo, posso mostrarti i dati già disponibili.',
    parse: 'Ho avuto difficoltà a elaborare la risposta. Prova a riformulare la richiesta.',
    unknown: 'Si è verificato un problema. Prova con una richiesta più semplice.'
  };

  return {
    message: messages[errorType] || messages.unknown,
    source: 'fallback',
    suggestions: getQuickActionSuggestions()
  };
}

/**
 * Get polite decline response for unsupported requests
 */
export function getDeclineResponse(reason: 'unsupported' | 'complex' | 'external'): AIEngineResult {
  const messages: Record<string, string> = {
    unsupported: 'Questa funzionalità non è ancora disponibile, ma posso aiutarti con task, eventi e spese.',
    complex: 'Questa richiesta è un po\' complessa per me. Prova a scomporla in parti più semplici.',
    external: 'Per questa richiesta avrei bisogno di accedere a risorse esterne. Posso aiutarti con i dati dell\'app.'
  };

  return {
    message: messages[reason],
    source: 'fallback',
    suggestions: getQuickActionSuggestions()
  };
}

/**
 * Generate a natural "I'm working on it" message
 */
export function getProcessingMessage(): string {
  const messages = [
    'Ci sto pensando...',
    'Elaboro la tua richiesta...',
    'Un momento...',
    'Sto analizzando...'
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Generate confirmation message for completed actions
 */
export function getActionConfirmation(action: string, success: boolean): string {
  if (success) {
    const confirmations: Record<string, string> = {
      create_event: 'Evento aggiunto con successo! 📅',
      create_task: 'Task creato! 📋',
      create_expense: 'Spesa registrata! 💰',
      create_note: 'Nota salvata! 📝',
      update_task: 'Task aggiornato!',
      update_event: 'Evento modificato!',
      delete_task: 'Task eliminato.',
      delete_event: 'Evento rimosso.'
    };
    return confirmations[action] || 'Fatto!';
  } else {
    return 'Si è verificato un problema. Riprova tra poco.';
  }
}

/**
 * Never say "I don't understand" - always provide helpful alternatives
 */
export function getNeverUnknownResponse(): AIEngineResult {
  const suggestions = getQuickActionSuggestions();
  const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];

  const messages = [
    `Interessante! Intanto posso aiutarti con "${randomSuggestion}"?`,
    `Non sono sicuro di aver capito al 100%, ma posso suggerirti di provare "${randomSuggestion}".`,
    `Hmm, potresti riformulare? Nel frattempo, vuoi provare "${randomSuggestion}"?`,
    `Lascia che ti aiuti in altro modo. Che ne dici di "${randomSuggestion}"?`
  ];

  return {
    message: messages[Math.floor(Math.random() * messages.length)],
    source: 'fallback',
    suggestions
  };
}
