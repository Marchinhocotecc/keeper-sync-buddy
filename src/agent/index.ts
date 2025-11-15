/**
 * AI Agent - Entry point dell'agente assistente ibrido
 * Coordina intent parsing, routing, coaching e data operations
 */

import { parseIntent, Intent } from './intentParser';
import { getCoachingResponse } from './miniCoaching';
import { generateAdaptiveSuggestions, shouldShowSuggestions, UserContext } from './adaptiveSuggestions';
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
}

export async function processMessage(
  message: string,
  userId: string,
  userContext?: UserContext,
  lastAction?: any
): Promise<AgentResponse> {
  
  // Step 1: Check if we should use external AI
  if (shouldUseExternalAI(message)) {
    const aiResponse = await callExternalAI(message, userId);
    
    if (aiResponse.success) {
      return {
        success: true,
        message: aiResponse.message || '',
        source: 'external'
      };
    }
    
    // If external AI fails, try local processing as fallback
    console.warn('External AI failed, falling back to local processing');
  }

  // Step 2: Parse intent locally with context
  const intent = parseIntent(message, lastAction);

  // Step 3: Process based on intent type
  return await handleIntent(intent, userId, userContext, lastAction);
}

async function handleIntent(
  intent: Intent,
  userId: string,
  userContext?: UserContext,
  lastAction?: any
): Promise<AgentResponse> {
  
  switch (intent.type) {
    case 'contextual_follow_up': {
      // Handle contextual memory-based requests
      if (!lastAction) {
        return {
          success: true,
          message: "Non ho abbastanza contesto. Cosa vuoi fare? 🤔",
          source: 'local'
        };
      }

      // Re-execute last action with modified data
      const modifiedData = { ...lastAction.data, ...extractContextualModifications(intent.data.message) };
      const newIntent = { type: lastAction.type, data: modifiedData };
      return await handleIntent(newIntent as Intent, userId, userContext, lastAction);
    }

    case 'create_task': {
      const result = await dataService.createTask(
        userId,
        intent.data.title,
        intent.data.priority,
        intent.data.dueDate
      );
      
      const lastActionData = {
        type: 'create_task',
        data: intent.data
      };

      return {
        success: result.success,
        message: result.success 
          ? `✅ Perfetto! Task creato: "${intent.data.title}" 💪` 
          : `⚠️ Ops, ho avuto un intoppo: ${result.error}. Riproviamo? 🤖`,
        data: result.data,
        source: 'local',
        lastAction: result.success ? lastActionData : undefined
      };
    }

    case 'create_expense': {
      const result = await dataService.createExpense(
        userId,
        intent.data.amount,
        intent.data.category,
        intent.data.description
      );
      
      const lastActionData = {
        type: 'create_expense',
        data: intent.data
      };

      return {
        success: result.success,
        message: result.success 
          ? `💰 Fatto! Spesa registrata: €${intent.data.amount.toFixed(2)} 📊 Ottima gestione!` 
          : `⚠️ Quasi fatto... ${result.error}. Ci riprovo! 🔄`,
        data: result.data,
        source: 'local',
        lastAction: result.success ? lastActionData : undefined
      };
    }

    case 'create_note': {
      const result = await dataService.createNote(
        userId,
        intent.data.content,
        intent.data.category
      );
      
      const lastActionData = {
        type: 'create_note',
        data: intent.data
      };

      return {
        success: result.success,
        message: result.success 
          ? `📝 Annotato! La tua nota è al sicuro ✨` 
          : `⚠️ C'è stato un problema: ${result.error}. Riproviamo? 🔄`,
        data: result.data,
        source: 'local',
        lastAction: result.success ? lastActionData : undefined
      };
    }

    case 'create_event': {
      // Parse dates and times properly
      const now = new Date();
      let startTime = now.toISOString();
      
      if (intent.data.date) {
        // Simple date parsing (can be improved)
        const dateStr = intent.data.date.toLowerCase();
        if (dateStr === 'oggi') {
          startTime = now.toISOString();
        } else if (dateStr === 'domani') {
          now.setDate(now.getDate() + 1);
          startTime = now.toISOString();
        }
        
        if (intent.data.time) {
          const [hours, minutes = '0'] = intent.data.time.split(':');
          now.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          startTime = now.toISOString();
        }
      }
      
      const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();
      
      const result = await dataService.createEvent(
        userId,
        intent.data.title,
        startTime,
        endTime
      );
      
      const lastActionData = {
        type: 'create_event',
        data: intent.data
      };

      return {
        success: result.success,
        message: result.success 
          ? `📅 Evento aggiunto con successo: "${intent.data.title}" 🎯 Stai pianificando alla grande!` 
          : `⚠️ Sto avendo difficoltà: ${result.error}. Riproviamo tra un attimo? ⏳`,
        data: result.data,
        source: 'local',
        lastAction: result.success ? lastActionData : undefined
      };
    }

    case 'update_wellness': {
      const today = new Date().toISOString().split('T')[0];
      const result = await dataService.updateWellness(userId, today, {
        sleep: intent.data.sleep,
        steps: intent.data.steps,
        meditation_minutes: intent.data.meditation
      });
      
      const updates: string[] = [];
      if (intent.data.sleep) updates.push(`${intent.data.sleep}h di sonno`);
      if (intent.data.steps) updates.push(`${intent.data.steps} passi`);
      if (intent.data.meditation) updates.push(`${intent.data.meditation} min meditazione`);
      
      return {
        success: result.success,
        message: result.success 
          ? `✨ Benessere aggiornato: ${updates.join(', ')} 💪 Continua così!` 
          : `⚠️ Ho avuto un problema: ${result.error} Riproviamo? 🔄`,
        data: result.data,
        source: 'local'
      };
    }

    case 'read_tasks': {
      const result = await dataService.getTasks(userId, intent.data.filter);
      
      if (!result.success) {
        return {
          success: false,
          message: `⚠️ Sto avendo difficoltà a recuperare i task: ${result.error}. Riproviamo? 🔄`,
          source: 'local'
        };
      }
      
      const tasks = result.data || [];
      if (tasks.length === 0) {
        return {
          success: true,
          message: "📝 Ottimo! Non hai task al momento. Vuoi crearne uno? ✨",
          data: tasks,
          source: 'local'
        };
      }
      
      const pending = tasks.filter((t: any) => !t.completed);
      const completed = tasks.filter((t: any) => t.completed);
      
      return {
        success: true,
        message: `📋 Hai ${pending.length} task in sospeso e ${completed.length} completati. 💪 Stai andando alla grande!`,
        data: tasks,
        source: 'local'
      };
    }

    case 'read_notes': {
      const result = await dataService.getNotes(userId);
      
      if (!result.success) {
        return {
          success: false,
          message: `⚠️ Sto avendo difficoltà a recuperare le note: ${result.error}. Riproviamo? 🔄`,
          source: 'local'
        };
      }
      
      const notes = result.data || [];
      if (notes.length === 0) {
        return {
          success: true,
          message: "📝 Non hai ancora note salvate. Vuoi aggiungerne una? ✨",
          data: notes,
          source: 'local'
        };
      }
      
      return {
        success: true,
        message: `📚 Hai ${notes.length} note salvate. Ecco le tue annotazioni! 💡`,
        data: notes,
        source: 'local'
      };
    }

    case 'read_expenses': {
      const result = await dataService.getExpenses(userId, intent.data.period as any);
      
      if (!result.success) {
        return {
          success: false,
          message: `⚠️ Sto avendo difficoltà a recuperare le spese: ${result.error}. Riproviamo? 🔄`,
          source: 'local'
        };
      }
      
      const expenses = result.data || [];
      const total = expenses.reduce((sum: number, e: any) => sum + e.amount, 0);
      
      const periodText = intent.data.period === 'today' ? 'oggi' 
        : intent.data.period === 'week' ? 'questa settimana' 
        : intent.data.period === 'month' ? 'questo mese' 
        : 'in totale';
      
      return {
        success: true,
        message: `💰 Hai speso €${total.toFixed(2)} ${periodText} (${expenses.length} spese). 📊 Ottima gestione!`,
        data: expenses,
        source: 'local'
      };
    }

    case 'read_summary': {
      const [tasksResult, expensesResult, eventsResult] = await Promise.all([
        dataService.getTasks(userId, 'all'),
        dataService.getExpenses(userId, intent.data.scope),
        dataService.getEvents(userId, intent.data.scope)
      ]);
      
      const tasks = tasksResult.data || [];
      const expenses = expensesResult.data || [];
      const events = eventsResult.data || [];
      
      const pendingTasks = tasks.filter((t: any) => !t.completed).length;
      const totalExpenses = expenses.reduce((sum: number, e: any) => sum + e.amount, 0);
      
      const scopeText = intent.data.scope === 'today' ? 'oggi' 
        : intent.data.scope === 'week' ? 'questa settimana' 
        : 'questo mese';
      
      return {
        success: true,
        message: `📊 Riepilogo ${scopeText}:\n\n` +
          `📋 ${pendingTasks} task da completare\n` +
          `💰 €${totalExpenses.toFixed(2)} spesi\n` +
          `📅 ${events.length} eventi in calendario\n\n` +
          `💪 Stai gestendo tutto alla grande! Continua così! ✨`,
        data: { tasks, expenses, events },
        source: 'local'
      };
    }

    case 'coaching_request': {
      const coaching = getCoachingResponse(intent.data.sentiment, intent.data.context);
      
      return {
        success: true,
        message: coaching.message,
        suggestions: coaching.suggestions?.map(s => ({ text: s, priority: 'medium' })),
        source: 'local'
      };
    }

    case 'navigation': {
      return {
        success: true,
        message: `🔄 Vai alla pagina: ${intent.data.page}`,
        data: { navigateTo: intent.data.page },
        source: 'local'
      };
    }

    case 'generic_question': {
      // Fallback to external AI for generic questions
      const aiResponse = await callExternalAI(intent.data.question, userId);
      
      return {
        success: aiResponse.success,
        message: aiResponse.message || aiResponse.error || 'Nessuna risposta disponibile',
        source: 'external'
      };
    }

    case 'unknown':
    default: {
      // Generate adaptive suggestions
      let suggestions;
      if (userContext && shouldShowSuggestions(null)) {
        const adaptiveSugs = generateAdaptiveSuggestions(userContext);
        suggestions = adaptiveSugs.map(s => ({ text: s.text, priority: s.priority }));
      }
      
      return {
        success: true,
        message: "🤔 Non ho capito bene, ma sono qui per aiutarti! Prova a chiedermi di:\n\n" +
          "✅ Creare task, eventi, note o registrare spese\n" +
          "📊 Mostrare riepiloghi o dati\n" +
          "✨ Aggiornare il tuo benessere\n" +
          "💬 Fare domande generali\n\n" +
          "Sono qui per te! 💪",
        suggestions,
        source: 'local'
      };
    }
  }
}

function extractContextualModifications(msg: string): any {
  const modifications: any = {};
  
  // Extract amount if present
  const amountMatch = msg.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?/);
  if (amountMatch) {
    modifications.amount = parseFloat(amountMatch[1].replace(',', '.'));
  }
  
  // Extract date references
  if (/domani/i.test(msg)) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    modifications.date = 'domani';
  }
  if (/oggi/i.test(msg)) {
    modifications.date = 'oggi';
  }
  
  return modifications;
}

export async function getAdaptiveSuggestionsForUser(userId: string): Promise<Array<{ text: string; priority: string }>> {
  try {
    const [tasks, expenses, events, settings] = await Promise.all([
      dataService.getTasks(userId, 'all'),
      dataService.getExpenses(userId, 'month'),
      dataService.getEvents(userId, 'week'),
      dataService.getUserSettings(userId)
    ]);

    const context: UserContext = {
      recentTasks: tasks.data || [],
      recentExpenses: expenses.data || [],
      recentEvents: events.data || [],
      settings: settings.data
    };

    return generateAdaptiveSuggestions(context).map(s => ({
      text: s.text,
      priority: s.priority
    }));
  } catch (error) {
    console.error('Error generating suggestions:', error);
    return [];
  }
}
