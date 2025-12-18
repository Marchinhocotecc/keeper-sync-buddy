/**
 * Local Executor - Handles ALL CRUD operations locally
 * 
 * CRITICAL: This is the ONLY module that can write to Supabase
 * NO response claiming action completion without DB confirmation
 */

import { supabase } from '@/integrations/supabase/client';
import { format, addDays } from 'date-fns';
import type { ParsedIntent, ExtractedData } from './intentParser';
import type { UserContext, TaskData, EventData, ExpenseData } from './contextLoader';

export interface ExecutionResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

// ============ CREATE OPERATIONS ============

/**
 * Create an event - ONLY responds after DB confirmation
 */
export async function createEvent(
  userId: string,
  data: ExtractedData
): Promise<ExecutionResult> {
  // Validate required fields
  if (!data.title) {
    return { success: false, message: 'Manca il titolo dell\'evento', error: 'missing_title' };
  }
  
  // Default date to today if not specified
  const eventDate = data.date || format(new Date(), 'yyyy-MM-dd');
  const startTime = data.startTime || '09:00';
  const endTime = data.endTime || calculateEndTime(startTime);
  
  const startDateTime = `${eventDate} ${startTime}:00`;
  const endDateTime = `${eventDate} ${endTime}:00`;
  
  // INSERT into database
  const { data: result, error } = await supabase
    .from('calendar_events')
    .insert({
      user_id: userId,
      title: data.title,
      start_time: startDateTime,
      end_time: endDateTime,
      category: data.category || null,
      description: null
    })
    .select()
    .single();
  
  if (error) {
    console.error('Event creation error:', error);
    return {
      success: false,
      message: 'Errore nella creazione dell\'evento. Riprova.',
      error: error.message
    };
  }
  
  // SUCCESS - Only now confirm
  const displayDate = formatDisplayDate(eventDate);
  return {
    success: true,
    message: `✅ Evento creato: "${data.title}" ${displayDate} alle ${startTime}`,
    data: result
  };
}

/**
 * Create a task - ONLY responds after DB confirmation
 */
export async function createTask(
  userId: string,
  data: ExtractedData
): Promise<ExecutionResult> {
  if (!data.title) {
    return { success: false, message: 'Manca il titolo del task', error: 'missing_title' };
  }
  
  const { data: result, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: data.title,
      priority: data.priority || 'medium',
      completed: false
    })
    .select()
    .single();
  
  if (error) {
    console.error('Task creation error:', error);
    return {
      success: false,
      message: 'Errore nella creazione del task. Riprova.',
      error: error.message
    };
  }
  
  return {
    success: true,
    message: `✅ Task aggiunto: "${data.title}"`,
    data: result
  };
}

/**
 * Create an expense - ONLY responds after DB confirmation
 */
export async function createExpense(
  userId: string,
  data: ExtractedData
): Promise<ExecutionResult> {
  if (!data.amount || data.amount <= 0) {
    return { success: false, message: 'Importo non valido', error: 'invalid_amount' };
  }
  
  const expenseDate = data.date || format(new Date(), 'yyyy-MM-dd');
  
  const { data: result, error } = await supabase
    .from('expenses')
    .insert({
      user_id: userId,
      amount: data.amount,
      category: data.category || 'Altro',
      description: data.title || null,
      date: expenseDate
    })
    .select()
    .single();
  
  if (error) {
    console.error('Expense creation error:', error);
    return {
      success: false,
      message: 'Errore nella registrazione della spesa. Riprova.',
      error: error.message
    };
  }
  
  return {
    success: true,
    message: `✅ Spesa registrata: €${data.amount.toFixed(2)} - ${data.category || 'Altro'}`,
    data: result
  };
}

// ============ QUERY OPERATIONS ============

/**
 * Query day summary
 */
export function queryDaySummary(context: UserContext, date: 'today' | 'tomorrow'): ExecutionResult {
  const events = date === 'today' ? context.todayEvents : context.tomorrowEvents;
  const dateLabel = date === 'today' ? 'Oggi' : 'Domani';
  
  const parts: string[] = [];
  
  // Events
  if (events.length > 0) {
    const eventList = events.map(e => {
      const time = format(new Date(e.start_time), 'HH:mm');
      return `⏰ ${time} - ${e.title}`;
    }).join('\n');
    parts.push(`📅 **${dateLabel}** (${events.length} eventi):\n${eventList}`);
  } else {
    parts.push(`📅 **${dateLabel}**: nessun evento in programma`);
  }
  
  // Pending tasks
  if (context.pendingTasks.length > 0) {
    const taskList = context.pendingTasks.slice(0, 5).map(t => {
      const priority = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
      return `${priority} ${t.title}`;
    }).join('\n');
    parts.push(`\n📋 Task in sospeso (${context.pendingTasks.length}):\n${taskList}`);
  }
  
  return {
    success: true,
    message: parts.join('\n')
  };
}

/**
 * Query tasks
 */
export function queryTasks(context: UserContext): ExecutionResult {
  if (context.pendingTasks.length === 0) {
    return {
      success: true,
      message: '🎉 Nessun task in sospeso! Ottimo lavoro!'
    };
  }
  
  const taskList = context.pendingTasks.slice(0, 10).map(t => {
    const priority = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
    return `${priority} ${t.title}`;
  }).join('\n');
  
  return {
    success: true,
    message: `📋 I tuoi task (${context.pendingTasks.length}):\n\n${taskList}`
  };
}

/**
 * Query events
 */
export function queryEvents(context: UserContext, timeRange?: string): ExecutionResult {
  const events = context.todayEvents;
  
  if (events.length === 0) {
    return {
      success: true,
      message: '📅 Nessun evento in programma per oggi. Giornata libera!'
    };
  }
  
  const eventList = events.map(e => {
    const time = format(new Date(e.start_time), 'HH:mm');
    return `⏰ ${time} - ${e.title}`;
  }).join('\n');
  
  return {
    success: true,
    message: `📅 Eventi di oggi (${events.length}):\n\n${eventList}`
  };
}

/**
 * Query expenses
 */
export function queryExpenses(context: UserContext): ExecutionResult {
  if (context.monthlyExpenses.length === 0) {
    return {
      success: true,
      message: '💰 Nessuna spesa registrata questo mese.'
    };
  }
  
  const recentExpenses = context.monthlyExpenses.slice(0, 5).map(e => {
    return `• €${Number(e.amount).toFixed(2)} - ${e.category || 'Altro'}`;
  }).join('\n');
  
  return {
    success: true,
    message: `💰 Spese del mese: €${context.totalSpent.toFixed(2)}\n\n${recentExpenses}`
  };
}

/**
 * Query budget status
 */
export function queryBudget(context: UserContext): ExecutionResult {
  const percentage = context.budgetPercentage;
  let emoji = '✅';
  let status = 'Tutto bene';
  
  if (percentage >= 100) {
    emoji = '🚨';
    status = 'Budget superato!';
  } else if (percentage >= 80) {
    emoji = '⚠️';
    status = 'Attenzione';
  }
  
  return {
    success: true,
    message: `${emoji} **Budget mensile** - ${status}\n\n` +
      `• Speso: €${context.totalSpent.toFixed(2)}\n` +
      `• Budget: €${context.budget.toFixed(2)}\n` +
      `• Rimanente: €${context.budgetRemaining.toFixed(2)}\n` +
      `• Utilizzo: ${percentage.toFixed(0)}%`
  };
}

// ============ HELPER FUNCTIONS ============

function calculateEndTime(startTime: string): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endHour = (hours + 1) % 24;
  return `${endHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function formatDisplayDate(isoDate: string): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  
  if (isoDate === today) return 'oggi';
  if (isoDate === tomorrow) return 'domani';
  
  // Format as "15 gennaio"
  const date = new Date(isoDate);
  const day = date.getDate();
  const months = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 
                  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  return `il ${day} ${months[date.getMonth()]}`;
}
