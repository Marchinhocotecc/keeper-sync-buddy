/**
 * AYVO - Shared Constants for AI Assistant
 * 
 * RULE: Risposte brevi, naturali, umane, gentili
 * Tono: calmo, accogliente, competente, non robotico
 */

// Safe fallback message - returned when unclear
export const SAFE_FALLBACK_MESSAGE = 'Dimmi pure 🙂';

// Cancel response
export const CANCEL_RESPONSE = 'Va bene! 🙂';

// Confirm with no intent response
export const CONFIRM_NO_INTENT_RESPONSE = 'Perfetto! Dimmi cosa posso fare per te.';

// Negative feedback response
export const NEGATIVE_FEEDBACK_RESPONSE = 'Scusa! Come posso aiutarti meglio?';

// Welcome message
export const WELCOME_MESSAGE = 'Ciao! Sono AYVO ✨ Come posso aiutarti oggi?';

// Error messages (gentle tone)
export const ERROR_MESSAGES = {
  generic: 'Ops, qualcosa non ha funzionato. Riproviamo? 🙂',
  timeout: 'Mi sono perso un attimo! Puoi ripetere?',
  network: 'Sembra esserci un problema di connessione. Riprova tra poco!',
};

// Success messages (celebratory but calm)
export const SUCCESS_MESSAGES = {
  taskCreated: 'Fatto! ✅ Ho aggiunto il task.',
  eventCreated: 'Perfetto! 📅 Evento creato.',
  expenseRecorded: 'Registrato! 💰 Spesa salvata.',
  taskCompleted: 'Ottimo lavoro! ✨',
};
