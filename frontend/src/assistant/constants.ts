/**
 * Ayvro - Shared Constants for AI Assistant
 * 
 * NOTE: These are fallback constants only.
 * The actual UI strings come from i18n translations.
 * The edge function responses come from responder.ts.
 */

// Safe fallback message
export const SAFE_FALLBACK_MESSAGE = 'Tell me.';

// Cancel response
export const CANCEL_RESPONSE = 'Ok, cancelled.';

// Confirm with no intent response
export const CONFIRM_NO_INTENT_RESPONSE = 'Ok. Tell me what to do.';

// Negative feedback response
export const NEGATIVE_FEEDBACK_RESPONSE = 'Sorry. How can I help?';

// Welcome message
export const WELCOME_MESSAGE = 'Hi. I\'m Ayvro. How can I help?';

// Error messages
export const ERROR_MESSAGES = {
  generic: 'Something went wrong. Try again.',
  timeout: 'Took too long. Can you repeat?',
  network: 'Connection issue. Try again shortly.',
};

// Success messages
export const SUCCESS_MESSAGES = {
  taskCreated: 'Done. Task added.',
  eventCreated: 'Done. Event created.',
  expenseRecorded: 'Done. Expense recorded.',
  taskCompleted: 'Done.',
};
