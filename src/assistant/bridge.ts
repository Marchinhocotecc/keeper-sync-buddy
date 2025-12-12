/**
 * Bridge - Executes AI commands through the Core Engine
 */

import { supabase } from '@/integrations/supabase/client';
import { format, addDays, parse, isValid } from 'date-fns';
import type { 
  AIIntent, 
  AIPayload, 
  BridgeResult, 
  EventPayload, 
  TaskPayload, 
  ExpensePayload, 
  NotePayload 
} from './typesAI';
import { getActionConfirmation } from './fallback';

/**
 * Execute a command from AI response
 */
export async function executeAICommand(
  userId: string,
  intent: AIIntent,
  payload: AIPayload
): Promise<BridgeResult> {
  console.log('Bridge executing:', { intent, payload });

  try {
    switch (intent) {
      case 'create_event':
        return await createEvent(userId, payload as EventPayload);
      
      case 'create_task':
        return await createTask(userId, payload as TaskPayload);
      
      case 'create_expense':
        return await createExpense(userId, payload as ExpensePayload);
      
      case 'create_note':
        return await createNote(userId, payload as NotePayload);
      
      case 'update_task':
        return await updateTask(userId, payload);
      
      case 'delete_task':
        return await deleteTask(userId, payload);
      
      case 'query_tasks':
        return await queryTasks(userId, payload);
      
      case 'query_events':
        return await queryEvents(userId, payload);
      
      case 'query_expenses':
        return await queryExpenses(userId, payload);
      
      case 'query_budget':
        return await queryBudget(userId);
      
      default:
        return { success: false, message: 'Azione non supportata', error: 'Unknown intent' };
    }
  } catch (error) {
    console.error('Bridge execution error:', error);
    return {
      success: false,
      message: 'Errore nell\'esecuzione del comando',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Create a new event
 */
async function createEvent(userId: string, payload: EventPayload): Promise<BridgeResult> {
  // Parse and validate date/time
  const eventDate = parseDate(payload.date);
  const startTime = payload.startTime || '09:00';
  const endTime = payload.endTime || calculateEndTime(startTime);

  const startDateTime = `${eventDate} ${startTime}:00`;
  const endDateTime = `${eventDate} ${endTime}:00`;

  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      user_id: userId,
      title: payload.title || 'Nuovo evento',
      start_time: startDateTime,
      end_time: endDateTime,
      category: payload.category || null,
      description: payload.description || null
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: 'Errore nella creazione dell\'evento', error: error.message };
  }

  return {
    success: true,
    message: `${getActionConfirmation('create_event', true)} "${payload.title}" il ${eventDate} alle ${startTime}`,
    data
  };
}

/**
 * Create a new task
 */
async function createTask(userId: string, payload: TaskPayload): Promise<BridgeResult> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: payload.title || 'Nuovo task',
      priority: payload.priority || 'medium',
      completed: false
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: 'Errore nella creazione del task', error: error.message };
  }

  return {
    success: true,
    message: `${getActionConfirmation('create_task', true)} "${payload.title}"`,
    data
  };
}

/**
 * Create a new expense
 */
async function createExpense(userId: string, payload: ExpensePayload): Promise<BridgeResult> {
  if (!payload.amount || payload.amount <= 0) {
    return { success: false, message: 'Importo non valido', error: 'Invalid amount' };
  }

  const expenseDate = payload.date || format(new Date(), 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      user_id: userId,
      amount: payload.amount,
      category: payload.category || 'Altro',
      description: payload.description || null,
      date: expenseDate
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: 'Errore nella registrazione della spesa', error: error.message };
  }

  return {
    success: true,
    message: `${getActionConfirmation('create_expense', true)} €${payload.amount.toFixed(2)} - ${payload.category || 'Altro'}`,
    data
  };
}

/**
 * Create a new note
 */
async function createNote(userId: string, payload: NotePayload): Promise<BridgeResult> {
  const { data, error } = await supabase
    .from('notes')
    .insert({
      user_id: userId,
      content: payload.content || '',
      category: payload.category || null
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: 'Errore nella creazione della nota', error: error.message };
  }

  return {
    success: true,
    message: getActionConfirmation('create_note', true),
    data
  };
}

/**
 * Update a task
 */
async function updateTask(userId: string, payload: any): Promise<BridgeResult> {
  const taskId = payload.id || payload.taskId;
  
  if (!taskId) {
    // Try to find task by title
    if (payload.title) {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', userId)
        .ilike('title', `%${payload.title}%`)
        .limit(1);
      
      if (tasks && tasks.length > 0) {
        const updateData: any = {};
        if (payload.completed !== undefined) updateData.completed = payload.completed;
        if (payload.priority) updateData.priority = payload.priority;

        const { error } = await supabase
          .from('tasks')
          .update(updateData)
          .eq('id', tasks[0].id);

        if (error) {
          return { success: false, message: 'Errore nell\'aggiornamento', error: error.message };
        }

        return { success: true, message: getActionConfirmation('update_task', true) };
      }
    }
    return { success: false, message: 'Task non trovato', error: 'Task not found' };
  }

  const updateData: any = {};
  if (payload.completed !== undefined) updateData.completed = payload.completed;
  if (payload.priority) updateData.priority = payload.priority;
  if (payload.newTitle) updateData.title = payload.newTitle;

  const { error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', taskId)
    .eq('user_id', userId);

  if (error) {
    return { success: false, message: 'Errore nell\'aggiornamento', error: error.message };
  }

  return { success: true, message: getActionConfirmation('update_task', true) };
}

/**
 * Delete a task
 */
async function deleteTask(userId: string, payload: any): Promise<BridgeResult> {
  const taskId = payload.id || payload.taskId;
  
  if (!taskId) {
    return { success: false, message: 'ID task non specificato', error: 'Missing task ID' };
  }

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId);

  if (error) {
    return { success: false, message: 'Errore nell\'eliminazione', error: error.message };
  }

  return { success: true, message: getActionConfirmation('delete_task', true) };
}

/**
 * Query tasks
 */
async function queryTasks(userId: string, payload: any): Promise<BridgeResult> {
  let query = supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (payload?.filter === 'completed') {
    query = query.eq('completed', true);
  } else if (payload?.filter === 'pending') {
    query = query.eq('completed', false);
  }

  const limit = payload?.limit || 10;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    return { success: false, message: 'Errore nel recupero dei task', error: error.message };
  }

  const tasks = data || [];
  const pending = tasks.filter(t => !t.completed);
  const message = pending.length > 0
    ? `Hai ${pending.length} task in sospeso:\n${pending.slice(0, 5).map(t => `• ${t.title}`).join('\n')}`
    : 'Non hai task in sospeso! 🎉';

  return { success: true, message, data: tasks };
}

/**
 * Query events
 */
async function queryEvents(userId: string, payload: any): Promise<BridgeResult> {
  const today = format(new Date(), 'yyyy-MM-dd');
  let startDate = today;
  let endDate = today;

  if (payload?.period === 'week') {
    endDate = format(addDays(new Date(), 7), 'yyyy-MM-dd');
  } else if (payload?.period === 'month') {
    endDate = format(addDays(new Date(), 30), 'yyyy-MM-dd');
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', `${startDate} 00:00:00`)
    .lte('start_time', `${endDate} 23:59:59`)
    .order('start_time', { ascending: true })
    .limit(payload?.limit || 10);

  if (error) {
    return { success: false, message: 'Errore nel recupero degli eventi', error: error.message };
  }

  const events = data || [];
  const message = events.length > 0
    ? `Hai ${events.length} eventi:\n${events.slice(0, 5).map(e => `• ${e.title} - ${format(new Date(e.start_time), 'HH:mm')}`).join('\n')}`
    : 'Nessun evento in programma.';

  return { success: true, message, data: events };
}

/**
 * Query expenses
 */
async function queryExpenses(userId: string, payload: any): Promise<BridgeResult> {
  const today = new Date();
  const startOfMonth = format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startOfMonth)
    .order('date', { ascending: false })
    .limit(payload?.limit || 20);

  if (error) {
    return { success: false, message: 'Errore nel recupero delle spese', error: error.message };
  }

  const expenses = data || [];
  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const message = `Spese del mese: €${total.toFixed(2)}\n${expenses.slice(0, 5).map(e => `• €${Number(e.amount).toFixed(2)} - ${e.category || 'Altro'}`).join('\n')}`;

  return { success: true, message, data: expenses };
}

/**
 * Query budget status
 */
async function queryBudget(userId: string): Promise<BridgeResult> {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const startOfMonth = format(new Date(currentYear, today.getMonth(), 1), 'yyyy-MM-dd');

  // Get expenses
  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount')
    .eq('user_id', userId)
    .gte('date', startOfMonth);

  // Get budget
  const { data: budgets } = await supabase
    .from('budgets')
    .select('amount')
    .eq('user_id', userId)
    .eq('year', currentYear)
    .or(`month.eq.${currentMonth},month.is.null`);

  const spent = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
  const budget = budgets?.[0]?.amount || 1000;
  const remaining = budget - spent;
  const percentage = (spent / budget) * 100;

  let emoji = '✅';
  if (percentage >= 100) emoji = '🚨';
  else if (percentage >= 80) emoji = '⚠️';

  const message = `${emoji} Budget mensile:\n• Speso: €${spent.toFixed(2)}\n• Budget: €${budget.toFixed(2)}\n• Rimanente: €${remaining.toFixed(2)}\n• Utilizzo: ${percentage.toFixed(0)}%`;

  return { success: true, message, data: { spent, budget, remaining, percentage } };
}

// Helper functions
function parseDate(dateStr?: string): string {
  if (!dateStr) return format(new Date(), 'yyyy-MM-dd');
  
  const lower = dateStr.toLowerCase();
  const today = new Date();
  
  if (lower === 'oggi' || lower === 'today') {
    return format(today, 'yyyy-MM-dd');
  }
  if (lower === 'domani' || lower === 'tomorrow') {
    return format(addDays(today, 1), 'yyyy-MM-dd');
  }
  if (lower === 'dopodomani') {
    return format(addDays(today, 2), 'yyyy-MM-dd');
  }
  
  // Try to parse as ISO date
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  return format(today, 'yyyy-MM-dd');
}

function calculateEndTime(startTime: string): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endHour = (hours + 1) % 24;
  return `${endHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Check if an intent requires execution
 */
export function requiresExecution(intent: AIIntent): boolean {
  return [
    'create_event', 'create_task', 'create_expense', 'create_note',
    'update_task', 'update_event', 'delete_task', 'delete_event'
  ].includes(intent);
}

/**
 * Check if an intent requires data query
 */
export function requiresQuery(intent: AIIntent): boolean {
  return ['query_tasks', 'query_events', 'query_expenses', 'query_budget'].includes(intent);
}
