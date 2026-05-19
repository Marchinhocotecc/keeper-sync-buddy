/**
 * Types for the AI Engine system
 */

// Valid intents that the external AI can return
export type AIIntent = 
  | 'create_event'
  | 'create_task'
  | 'create_expense'
  | 'create_note'
  | 'update_task'
  | 'update_event'
  | 'delete_task'
  | 'delete_event'
  | 'query_tasks'
  | 'query_events'
  | 'query_expenses'
  | 'query_budget'
  | 'advice'
  | 'suggestion'
  | 'greeting'
  | 'farewell'
  | 'thanks'
  | 'question'
  | 'unknown';

// Payload structures for different intents
export interface EventPayload {
  title: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  category?: string;
  description?: string;
}

export interface TaskPayload {
  title: string;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
}

export interface ExpensePayload {
  amount: number;
  category?: string;
  description?: string;
  date?: string;
}

export interface NotePayload {
  content: string;
  category?: string;
}

export interface QueryPayload {
  filter?: string;
  period?: 'today' | 'week' | 'month';
  limit?: number;
}

// Union type for all payloads
export type AIPayload = 
  | EventPayload 
  | TaskPayload 
  | ExpensePayload 
  | NotePayload 
  | QueryPayload
  | { message?: string }
  | Record<string, any>;

// External AI response structure
export interface AIResponse {
  intent: AIIntent;
  payload: AIPayload;
  message?: string;
  confidence?: number;
}

// Parsed AI response with validation status
export interface ParsedAIResponse {
  success: boolean;
  response: AIResponse | null;
  rawText?: string;
  error?: string;
}

// AI Engine result
export interface AIEngineResult {
  message: string;
  source: 'local' | 'external' | 'fallback';
  intent?: AIIntent;
  actionExecuted?: boolean;
  actionResult?: {
    success: boolean;
    data?: any;
    error?: string;
  };
  suggestions?: string[];
  followUp?: string;
  decision?: string;
  reasoning?: string;
  focusItems?: any[];
}

// Conversation entry for AI context
export interface AIConversationEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

// OpenRouter request options
export interface OpenRouterOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  retries?: number;
}

// Bridge execution result
export interface BridgeResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}
