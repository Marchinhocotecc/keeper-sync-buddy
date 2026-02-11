/**
 * AYVO - Shared Constants for AI Assistant
 * 
 * RULE: Conciso, neutro, umano, niente emoji
 * Tono: calmo, competente, affidabile
 */

// Safe fallback message - returned when unclear
export const SAFE_FALLBACK_MESSAGE = 'Dimmi.';

// Cancel response
export const CANCEL_RESPONSE = 'Ok, annullato.';

// Confirm with no intent response
export const CONFIRM_NO_INTENT_RESPONSE = 'Ok. Dimmi cosa fare.';

// Negative feedback response
export const NEGATIVE_FEEDBACK_RESPONSE = 'Scusa. Come posso aiutarti?';

// Welcome message
export const WELCOME_MESSAGE = 'Ciao. Sono AYVO. Come posso aiutarti?';

// Error messages
export const ERROR_MESSAGES = {
  generic: 'Qualcosa non ha funzionato. Riprova.',
  timeout: 'Ci ho messo troppo. Puoi ripetere?',
  network: 'Problema di connessione. Riprova tra poco.',
};

// Success messages
export const SUCCESS_MESSAGES = {
  taskCreated: 'Fatto. Task aggiunto.',
  eventCreated: 'Fatto. Evento creato.',
  expenseRecorded: 'Fatto. Spesa registrata.',
  taskCompleted: 'Fatto.',
};
