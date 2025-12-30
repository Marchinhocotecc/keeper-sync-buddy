/**
 * Shared Constants for AI Assistant
 * 
 * SINGLE SOURCE OF TRUTH for:
 * - Safe fallback messages
 * - Standard responses
 */

// Safe fallback message - ALWAYS returned when we don't know what to do
// Used by: aiEngine.ts, statefulHandler.ts
export const SAFE_FALLBACK_MESSAGE = '❓ Ok. Vuoi creare un task, un evento, registrare una spesa o eliminare qualcosa?';

// Cancel response - returned when user cancels
export const CANCEL_RESPONSE = '✅ Ok, annullato.';

// Confirm with no intent response
export const CONFIRM_NO_INTENT_RESPONSE = '✅ Ok. Dimmi cosa vuoi fare (task, evento, spesa o elimina).';

// Negative feedback response
export const NEGATIVE_FEEDBACK_RESPONSE = '😔 Hai ragione, scusa. Dimmi cosa vuoi fare adesso.';
