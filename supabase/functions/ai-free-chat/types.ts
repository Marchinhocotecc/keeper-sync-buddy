/**
 * Types and Constants for ai-free-chat Edge Function
 */

// ============================================================================
// STRICT JSON CONTRACT
// ============================================================================

export type AIIntent =
  | 'NONE'
  | 'CREATE_TASK'
  | 'CREATE_EVENT'
  | 'RECORD_EXPENSE'
  | 'QUERY_TASKS'
  | 'QUERY_EVENTS'
  | 'QUERY_BUDGET'
  | 'DELETE_TASKS'
  | 'DELETE_EVENTS'
  | 'DELETE_EXPENSES'
  | 'ADVICE'
  | 'CANCEL'
  | 'SMALL_TALK'
  | 'ERROR';

export interface AIAction {
  type: 'NONE' | 'CREATE_TASK' | 'CREATE_EVENT' | 'RECORD_EXPENSE' | 'DELETE_ALL_TASKS' | 'DELETE_ALL_EVENTS' | 'DELETE_ALL_EXPENSES' | 'QUERY_TASKS' | 'QUERY_EVENTS' | 'QUERY_BUDGET';
  title?: string;
  start_at?: string;
  end_at?: string;
  due_date?: string;
  due_time?: string;
  amount?: number;
  category?: string;
  scope?: 'today' | 'week' | 'all';
  recurring?: RecurringRule;
}

export interface AIResponse {
  intent: AIIntent;
  reply: string;
  action: AIAction;
  needsConfirmation: boolean;
  confirmationQuestion: string | null;
  missingFields: string[];
  mode: 'CHATTY' | 'OPERATIVE';
  suggestions?: string[];
}

export interface RecurringRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  byHour?: number;
  byMinute?: number;
  byDay?: string[];
}

export interface PendingAction {
  type: string;
  payload: any;
  question: string;
}

export interface RouterResult {
  matched: boolean;
  intent?: AIIntent;
  action?: AIAction;
  missingFields?: string[];
  reply?: string;
  needsConfirmation?: boolean;
  confirmationQuestion?: string;
  suggestions?: string[];
}

export interface UserContext {
  todos: any[];
  events: any[];
  expenses: any[];
  budget: any | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const PREMIUM_ONLY_ACTIONS = ['DELETE_ALL_TASKS', 'DELETE_ALL_EVENTS', 'DELETE_ALL_EXPENSES'];

export const FORBIDDEN_TITLES = [
  "ok", "no", "sì", "si", "yes", "ciao", "salve", "grazie", "boh", 
  "vediamo", "pianifichiamo", "perfetto", "va bene", "top", "dai",
  "annulla", "lascia stare", "niente", "nulla", "stop", "task", "evento",
  "un", "una", "il", "la", "lo", "i", "gli", "le", "crea", "aggiungi"
];

// CANCEL: SOLO parole di annullamento esplicito
// NON include "elimina", "rimuovi", "cancella" (sono DELETE, non CANCEL)
export const CANCEL_PATTERNS_STANDALONE = [
  "no", "annulla", "lascia stare", "stop", "niente", "cambia idea", 
  "non importa", "lascia perdere", "basta", "chiudi"
];

export const CANCEL_PREFIX_PATTERNS = [
  /^no\s*,\s*(.+)$/i,
  /^no\s+(?!task|evento|spesa|grazie)(.{3,})$/i,
  /^annulla\s*,?\s*(.+)$/i,
  /^lascia\s*(?:stare|perdere)\s*,?\s*(.+)$/i,
  /^niente\s*,?\s*(.+)$/i,
  /^basta\s*,?\s*(.+)$/i,
  /^stop\s*,?\s*(.+)$/i,
];

export const ADVICE_PATTERNS = [
  /cosa\s+(?:posso|potrei|dovrei)\s+fare/i,
  /cosa\s+faccio\s+oggi/i,
  /consigliami/i,
  /(?:dammi|dai)\s+(?:un\s+)?(?:consiglio|idea|suggerimento)/i,
  /come\s+posso/i,
  /idee\s+per/i,
  /che\s+(?:cosa|ne)\s+(?:faccio|dici)/i,
  /aiutami\s+(?:a\s+)?(?:capire|decidere)/i,
  /non\s+so\s+(?:cosa|che)\s+fare/i,
];

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
