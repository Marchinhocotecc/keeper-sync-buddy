/**
 * AI Agent - Assistente locale intelligente con NLP avanzato
 * Versione completamente riscritta con context management e parsing migliorato
 */

import { classifyIntent, isDateTimePresent } from './nlp/intentClassifier';
import { parseDateTime, calculateEndTime, formatDateForDisplay, formatTimeForDisplay } from './nlp/dateTimeParser';
import { extractEntities } from './nlp/entityExtractor';
import { contextManager } from './contextManager';
import { generateResponse, generateClarificationQuestion } from './responseGenerator';
import { getCoachingResponse } from './miniCoaching';
import { callExternalAI, shouldUseExternalAI } from '@/services/aiService';
import * as dataService from '@/services/dataService';

export interface AgentResponse {
  success: boolean;
  message: string;
  data?: any;
  suggestions?: Array<{ text: string; priority: string }>;
  source: 'local' | 'external';
  lastAction?: {
    type: string;
    data: any;
  };
  needsClarification?: boolean;
  clarificationQuestion?: string;
}

export async function processMessage(
  message: string,
  userId: string,
  userContext?: any,
  lastAction?: any
): Promise<AgentResponse> {
  
  // Step 1: Check for contextual follow-up
  const canInfer = contextManager.canInferFromContext(userId, message);
  if (canInfer) {
    const inferred = contextManager.inferFromContext(userId, message);
    if (inferred) {
      return await executeAction(inferred.type, inferred.data, userId);
    }
  }

  // Step 2: Classify intent using advanced NLP
  const classification = classifyIntent(message);
  
  // Handle ambiguous intents
  if (classification.type === 'ambiguous') {
    return {
      success: false,
      message: generateResponse({
        intent: 'ambiguous',
        success: false,
        alternatives: classification.alternatives
      }),
      source: 'local',
      needsClarification: true
    };
  }

  // Step 3: Check if external AI is needed for generic questions
  if (classification.type === 'generic_question' || shouldUseExternalAI(message)) {
    const aiResponse = await callExternalAI(message, userId);
    
    if (aiResponse.success) {
      return {
        success: true,
        message: aiResponse.message || '',
        source: 'external'
      };
    }
  }

  // Step 4: Handle emotional support locally
  if (classification.type === 'emotional_support') {
    const sentiment = detectSentiment(message);
    const coaching = getCoachingResponse(sentiment, message);
    
    return {
      success: true,
      message: generateResponse({
        intent: 'emotional_support',
        success: true,
        data: { sentiment }
      }),
      suggestions: coaching.suggestions?.map(s => ({ text: s, priority: 'medium' })),
      source: 'local'
    };
  }

  // Step 5: Extract entities from message
  const entities = extractEntities(message, classification.type);
  
  // Step 6: Parse date/time if needed
  let parsedDateTime = null;
  if (classification.type === 'create_event' || classification.type === 'create_task') {
    parsedDateTime = parseDateTime(message);
    
    // If no date found and it's an event, ask for clarification
    if (classification.type === 'create_event' && !parsedDateTime && !isDateTimePresent(message)) {
      return {
        success: false,
        message: generateClarificationQuestion('create_event', 'date'),
        source: 'local',
        needsClarification: true,
        clarificationQuestion: "Quando vuoi questo evento?"
      };
    }
  }

  // Step 7: Build action data
  const actionData = buildActionData(classification.type, entities, parsedDateTime);
  
  // Step 8: Execute action
  const result = await executeAction(classification.type, actionData, userId);
  
  // Step 9: Update context
  if (result.success) {
    contextManager.updateLastAction(userId, {
      type: classification.type,
      data: actionData
    });
    contextManager.setContext(userId, {
      lastMessage: message,
      lastIntent: classification.type
    });
  }
  
  return result;
}

function detectSentiment(msg: string): string {
  if (/stressato|ansioso|preoccupato/i.test(msg)) return 'stressed';
  if (/stanco|esausto|affaticato/i.test(msg)) return 'tired';
  if (/demotivato|sfiduciato/i.test(msg)) return 'unmotivated';
  if (/non\s+riesco/i.test(msg)) return 'struggling';
  return 'neutral';
}

function buildActionData(intentType: string, entities: any, parsedDateTime: any): any {
  const data: any = {
    title: entities.title,
    description: entities.description,
    category: entities.category,
    rawText: entities.rawText
  };

  if (parsedDateTime) {
    data.startTime = parsedDateTime.date.toISOString();
    data.isAllDay = parsedDateTime.isAllDay || false;
    data.endTime = calculateEndTime(
      parsedDateTime.date, 
      parsedDateTime.isAllDay || false
    ).toISOString();
  }

  if (entities.amount) {
    data.amount = entities.amount;
  }

  return data;
}

async function executeAction(intentType: string, actionData: any, userId: string): Promise<AgentResponse> {
  try {
    switch (intentType) {
      case 'create_event': {
        const result = await dataService.createEvent(
          userId,
          actionData.title,
          actionData.startTime,
          actionData.endTime,
          actionData.category || 'event'
        );
        
        return {
          success: result.success,
          message: generateResponse({
            intent: 'create_event',
            success: result.success,
            data: actionData
          }),
          data: result.data,
          source: 'local',
          lastAction: result.success ? { type: intentType, data: actionData } : undefined
        };
      }

      case 'create_task': {
        const result = await dataService.createTask(
          userId,
          actionData.title,
          'medium',
          actionData.startTime
        );
        
        return {
          success: result.success,
          message: generateResponse({
            intent: 'create_task',
            success: result.success,
            data: actionData
          }),
          data: result.data,
          source: 'local',
          lastAction: result.success ? { type: intentType, data: actionData } : undefined
        };
      }

      case 'create_note': {
        const result = await dataService.createNote(
          userId,
          actionData.title || actionData.rawText,
          actionData.category
        );
        
        return {
          success: result.success,
          message: generateResponse({
            intent: 'create_note',
            success: result.success,
            data: actionData
          }),
          data: result.data,
          source: 'local',
          lastAction: result.success ? { type: intentType, data: actionData } : undefined
        };
      }

      case 'create_expense': {
        if (!actionData.amount) {
          return {
            success: false,
            message: generateClarificationQuestion('create_expense', 'amount'),
            source: 'local',
            needsClarification: true
          };
        }

        const result = await dataService.createExpense(
          userId,
          actionData.amount,
          actionData.category || 'altro',
          actionData.title
        );
        
        return {
          success: result.success,
          message: generateResponse({
            intent: 'create_expense',
            success: result.success,
            data: actionData
          }),
          data: result.data,
          source: 'local',
          lastAction: result.success ? { type: intentType, data: actionData } : undefined
        };
      }

      case 'read_tasks': {
        const result = await dataService.getTasks(userId, 'all');
        
        return {
          success: result.success,
          message: generateResponse({
            intent: 'read_tasks',
            success: result.success,
            data: result.data
          }),
          data: result.data,
          source: 'local'
        };
      }

      case 'read_notes': {
        const result = await dataService.getNotes(userId);
        
        return {
          success: result.success,
          message: generateResponse({
            intent: 'read_notes',
            success: result.success,
            data: result.data
          }),
          data: result.data,
          source: 'local'
        };
      }

      case 'read_expenses': {
        const result = await dataService.getExpenses(userId, 'month');
        const total = (result.data || []).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
        
        return {
          success: result.success,
          message: generateResponse({
            intent: 'read_expenses',
            success: result.success,
            data: { expenses: result.data, total, period: 'questo mese' }
          }),
          data: result.data,
          source: 'local'
        };
      }

      case 'read_calendar': {
        const result = await dataService.getEvents(userId, 'week');
        
        return {
          success: result.success,
          message: generateResponse({
            intent: 'read_calendar',
            success: result.success,
            data: result.data
          }),
          data: result.data,
          source: 'local'
        };
      }

      case 'read_summary': {
        const [tasksResult, expensesResult, eventsResult] = await Promise.all([
          dataService.getTasks(userId, 'all'),
          dataService.getExpenses(userId, 'week'),
          dataService.getEvents(userId, 'week')
        ]);
        
        return {
          success: true,
          message: generateResponse({
            intent: 'read_summary',
            success: true,
            data: {
              tasks: tasksResult.data,
              expenses: expensesResult.data,
              events: eventsResult.data,
              scope: 'week'
            }
          }),
          source: 'local'
        };
      }

      default:
        return {
          success: false,
          message: "Non ho capito. Prova a riformulare 🤔",
          source: 'local'
        };
    }
  } catch (error) {
    console.error('Error executing action:', error);
    return {
      success: false,
      message: generateResponse({
        intent: intentType,
        success: false,
        error: String(error)
      }),
      source: 'local'
    };
  }
}

export async function getAdaptiveSuggestionsForUser(userId: string): Promise<Array<{ text: string; priority: string }>> {
  return [
    { text: "Crea un nuovo evento", priority: "medium" },
    { text: "Aggiungi un task", priority: "medium" },
    { text: "Mostra il calendario", priority: "low" }
  ];
}

