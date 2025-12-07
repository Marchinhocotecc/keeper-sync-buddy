/**
 * AI Agent - Assistente coach motivazionale
 * Gestisce intent localmente e delega all'AI per risposte complesse
 */

import { classifyIntent, isDateTimePresent } from './nlp/intentClassifier';
import { parseDateTime, calculateEndTime } from './nlp/dateTimeParser';
import { extractEntities } from './nlp/entityExtractor';
import { contextManager } from './contextManager';
import { generateResponse, generateClarificationQuestion } from './responseGenerator';
import { getCoachingResponse } from './miniCoaching';
import { supabase } from '@/integrations/supabase/client';
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
  actionType?: string;
}

interface AIResponse {
  success: boolean;
  type?: string;
  payload?: any;
  message?: string;
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

  // Step 2: Classify intent locally first
  const classification = classifyIntent(message);
  
  // Step 3: For simple intents, handle locally for speed
  if (classification.confidence === 'high' && isSimpleIntent(classification.type)) {
    const localResult = await handleLocalIntent(classification.type, message, userId);
    if (localResult) {
      return localResult;
    }
  }

  // Step 4: Call external AI for complex requests or low confidence
  try {
    const aiResponse = await callMotivationalAI(message, userId);
    
    if (aiResponse.success && aiResponse.type) {
      // Execute action based on AI response type
      const actionResult = await executeAIAction(aiResponse, userId);
      
      if (actionResult) {
        return {
          ...actionResult,
          message: aiResponse.message || actionResult.message,
          source: 'external',
          actionType: aiResponse.type
        };
      }

      // If no action needed, just return the message
      return {
        success: true,
        message: aiResponse.message || "Come posso aiutarti? 💛",
        source: 'external',
        actionType: aiResponse.type
      };
    }
  } catch (error) {
    console.error('AI call failed, falling back to local:', error);
  }

  // Step 5: Fallback to local processing
  return await handleLocalIntent(classification.type, message, userId) || {
    success: false,
    message: "Non ho capito bene. Prova a riformulare 🤔",
    source: 'local'
  };
}

function isSimpleIntent(type: string): boolean {
  return ['read_tasks', 'read_notes', 'read_expenses', 'read_calendar', 'read_summary'].includes(type);
}

async function callMotivationalAI(message: string, userId: string): Promise<AIResponse> {
  const { data, error } = await supabase.functions.invoke('assistant-ai', {
    body: { prompt: message, userId }
  });

  if (error) {
    console.error('AI function error:', error);
    return { success: false };
  }

  return data as AIResponse;
}

async function executeAIAction(aiResponse: AIResponse, userId: string): Promise<AgentResponse | null> {
  const { type, payload } = aiResponse;

  switch (type) {
    case 'TASK': {
      if (!payload?.title) return null;
      
      const result = await dataService.createTask(
        userId,
        payload.title,
        payload.priority || 'medium',
        payload.date
      );

      return {
        success: result.success,
        message: aiResponse.message || "Task creato! ✅",
        data: result.data,
        source: 'external',
        suggestions: [
          { text: "Mostra i miei task", priority: "medium" },
          { text: "Aggiungi un altro task", priority: "low" }
        ]
      };
    }

    case 'EVENT': {
      if (!payload?.title) return null;
      
      const startTime = payload.start || new Date().toISOString();
      const endTime = payload.end || calculateEndTime(new Date(startTime), false).toISOString();

      const result = await dataService.createEvent(
        userId,
        payload.title,
        startTime,
        endTime,
        payload.category || 'event'
      );

      return {
        success: result.success,
        message: aiResponse.message || "Evento creato! 📅",
        data: result.data,
        source: 'external',
        suggestions: [
          { text: "Mostra il calendario", priority: "medium" },
          { text: "Aggiungi un altro evento", priority: "low" }
        ]
      };
    }

    case 'NOTE': {
      if (!payload?.content) return null;
      
      const result = await dataService.createNote(
        userId,
        payload.content,
        payload.category
      );

      return {
        success: result.success,
        message: aiResponse.message || "Nota salvata! 📝",
        data: result.data,
        source: 'external'
      };
    }

    case 'SUMMARY': {
      const [tasksResult, expensesResult, eventsResult] = await Promise.all([
        dataService.getTasks(userId, 'all'),
        dataService.getExpenses(userId, 'week'),
        dataService.getEvents(userId, 'week')
      ]);

      const pendingTasks = (tasksResult.data || []).filter((t: any) => !t.completed).length;
      const totalExpenses = (expensesResult.data || []).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      const upcomingEvents = (eventsResult.data || []).length;

      return {
        success: true,
        message: `📊 **Riepilogo settimanale:**\n\n` +
          `✅ Task in sospeso: ${pendingTasks}\n` +
          `💰 Spese totali: €${totalExpenses.toFixed(2)}\n` +
          `📅 Eventi in programma: ${upcomingEvents}\n\n` +
          (aiResponse.message || "Stai andando alla grande! 💪"),
        data: { tasks: tasksResult.data, expenses: expensesResult.data, events: eventsResult.data },
        source: 'external'
      };
    }

    case 'EMOTIONAL_SUPPORT': {
      return {
        success: true,
        message: aiResponse.message || "Sono qui per te 💛",
        source: 'external',
        suggestions: [
          { text: "Come posso organizzarmi meglio?", priority: "medium" },
          { text: "Cosa ho in programma oggi?", priority: "low" }
        ]
      };
    }

    case 'CONTEXT_UPDATE': {
      return {
        success: true,
        message: aiResponse.message || "Perfetto, terrò a mente! 💛",
        source: 'external'
      };
    }

    default:
      return null;
  }
}

async function handleLocalIntent(intentType: string, message: string, userId: string): Promise<AgentResponse | null> {
  const entities = extractEntities(message, intentType);
  let parsedDateTime = null;
  
  if (intentType === 'create_event' || intentType === 'create_task') {
    parsedDateTime = parseDateTime(message);
  }

  const actionData = buildActionData(intentType, entities, parsedDateTime);

  switch (intentType) {
    case 'emotional_support': {
      const sentiment = detectSentiment(message);
      const coaching = getCoachingResponse(sentiment, message);
      
      return {
        success: true,
        message: coaching.message || generateResponse({
          intent: 'emotional_support',
          success: true,
          data: { sentiment }
        }),
        suggestions: coaching.suggestions?.map(s => ({ text: s, priority: 'medium' })),
        source: 'local'
      };
    }

    case 'read_tasks': {
      const result = await dataService.getTasks(userId, 'all');
      const pending = (result.data || []).filter((t: any) => !t.completed);
      
      if (pending.length === 0) {
        return {
          success: true,
          message: "Non hai task in sospeso! Ottimo lavoro 🎉",
          data: result.data,
          source: 'local'
        };
      }

      const taskList = pending.slice(0, 5).map((t: any) => `• ${t.title}`).join('\n');
      return {
        success: true,
        message: `📋 **I tuoi task (${pending.length}):**\n\n${taskList}` + 
          (pending.length > 5 ? `\n\n...e altri ${pending.length - 5}` : ''),
        data: result.data,
        source: 'local'
      };
    }

    case 'read_expenses': {
      const result = await dataService.getExpenses(userId, 'month');
      const total = (result.data || []).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      
      return {
        success: true,
        message: `💰 **Spese di questo mese:** €${total.toFixed(2)}\n\nContinua così! 💪`,
        data: result.data,
        source: 'local'
      };
    }

    case 'read_calendar': {
      const result = await dataService.getEvents(userId, 'week');
      const events = result.data || [];
      
      if (events.length === 0) {
        return {
          success: true,
          message: "Nessun evento in programma questa settimana 📅",
          data: events,
          source: 'local'
        };
      }

      const eventList = events.slice(0, 5).map((e: any) => {
        const date = new Date(e.start_time);
        return `• ${e.title} - ${date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })}`;
      }).join('\n');

      return {
        success: true,
        message: `📅 **Prossimi eventi:**\n\n${eventList}`,
        data: events,
        source: 'local'
      };
    }

    default:
      return null;
  }
}

function detectSentiment(msg: string): string {
  if (/stressato|ansioso|preoccupato|ansia/i.test(msg)) return 'stressed';
  if (/stanco|esausto|affaticato/i.test(msg)) return 'tired';
  if (/demotivato|sfiduciato|triste/i.test(msg)) return 'unmotivated';
  if (/non\s+riesco|difficile|fatico/i.test(msg)) return 'struggling';
  if (/felice|contento|bene|grande/i.test(msg)) return 'happy';
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
          message: result.success ? "Evento creato! 📅" : "Errore nella creazione dell'evento",
          data: result.data,
          source: 'local'
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
          message: result.success ? "Task creato! ✅" : "Errore nella creazione del task",
          data: result.data,
          source: 'local'
        };
      }

      default:
        return {
          success: false,
          message: "Azione non supportata",
          source: 'local'
        };
    }
  } catch (error) {
    console.error('Error executing action:', error);
    return {
      success: false,
      message: "Si è verificato un errore. Riprova.",
      source: 'local'
    };
  }
}

export async function getAdaptiveSuggestionsForUser(userId: string): Promise<Array<{ text: string; priority: string }>> {
  try {
    // Fetch recent data to personalize suggestions
    const [tasksResult, eventsResult] = await Promise.all([
      dataService.getTasks(userId, 'pending'),
      dataService.getEvents(userId, 'today')
    ]);

    const pendingTasks = (tasksResult.data || []).length;
    const todayEvents = (eventsResult.data || []).length;

    const suggestions: Array<{ text: string; priority: string }> = [];

    if (pendingTasks > 3) {
      suggestions.push({ text: "Ho troppi task, aiutami a organizzarmi", priority: "high" });
    }
    
    if (todayEvents === 0) {
      suggestions.push({ text: "Cosa potrei fare oggi?", priority: "medium" });
    }

    suggestions.push(
      { text: "Crea un nuovo task", priority: "medium" },
      { text: "Aggiungi un evento al calendario", priority: "medium" },
      { text: "Mostra il riepilogo settimanale", priority: "low" }
    );

    return suggestions.slice(0, 4);
  } catch {
    return [
      { text: "Crea un nuovo task", priority: "medium" },
      { text: "Aggiungi un evento", priority: "medium" },
      { text: "Come posso aiutarti?", priority: "low" }
    ];
  }
}
