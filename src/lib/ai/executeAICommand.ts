/**
 * AI Command Executor - Executes parsed AI commands by interacting with Supabase
 */

import { supabase } from '@/integrations/supabase/client';
import { AICommand } from './parseAICommand';

export interface ExecutionResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Add a new calendar event
 */
export async function addEvent(
  userId: string,
  payload: Record<string, any>
): Promise<ExecutionResult> {
  try {
    const { title, date, startTime, endTime, category, description } = payload;
    
    if (!title) {
      return { success: false, message: 'Titolo evento mancante' };
    }
    
    // Build datetime strings
    const eventDate = date || new Date().toISOString().split('T')[0];
    const startDateTime = startTime 
      ? `${eventDate}T${startTime}:00` 
      : `${eventDate}T09:00:00`;
    const endDateTime = endTime 
      ? `${eventDate}T${endTime}:00` 
      : `${eventDate}T10:00:00`;
    
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        user_id: userId,
        title,
        start_time: startDateTime,
        end_time: endDateTime,
        category: category || null,
        description: description || null
      })
      .select()
      .single();

    if (error) throw error;
    
    return {
      success: true,
      message: `✅ Evento "${title}" aggiunto per ${eventDate}`,
      data
    };
  } catch (error: any) {
    console.error('Error adding event:', error);
    return { success: false, message: `Errore: ${error.message}` };
  }
}

/**
 * Add a new task
 */
export async function addTask(
  userId: string,
  payload: Record<string, any>
): Promise<ExecutionResult> {
  try {
    const { title, priority, dueDate, date } = payload;
    
    if (!title) {
      return { success: false, message: 'Titolo task mancante' };
    }
    
    const { data, error } = await supabase
      .from('todos')
      .insert({
        user_id: userId,
        title,
        priority: priority || 'medium',
        due_date: dueDate || date || null,
        completed: false
      })
      .select()
      .single();

    if (error) throw error;
    
    return {
      success: true,
      message: `✅ Task "${title}" creato`,
      data
    };
  } catch (error: any) {
    console.error('Error adding task:', error);
    return { success: false, message: `Errore: ${error.message}` };
  }
}

/**
 * Add a new expense
 */
export async function addExpense(
  userId: string,
  payload: Record<string, any>
): Promise<ExecutionResult> {
  try {
    const { amount, category, description, date } = payload;
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return { success: false, message: 'Importo spesa non valido' };
    }
    
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id: userId,
        amount: numAmount,
        category: category || 'Altro',
        description: description || null,
        date: date || new Date().toISOString().split('T')[0]
      })
      .select()
      .single();

    if (error) throw error;
    
    return {
      success: true,
      message: `✅ Spesa di €${numAmount.toFixed(2)} registrata`,
      data
    };
  } catch (error: any) {
    console.error('Error adding expense:', error);
    return { success: false, message: `Errore: ${error.message}` };
  }
}

/**
 * Update budget settings
 */
export async function updateBudget(
  userId: string,
  payload: Record<string, any>
): Promise<ExecutionResult> {
  try {
    const { amount, budget } = payload;
    const budgetAmount = parseFloat(amount || budget);
    
    if (isNaN(budgetAmount) || budgetAmount < 0) {
      return { success: false, message: 'Importo budget non valido' };
    }
    
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    const { data, error } = await supabase
      .from('budgets')
      .upsert({
        user_id: userId,
        amount: budgetAmount,
        year,
        month
      }, {
        onConflict: 'user_id,year,month'
      })
      .select()
      .single();

    if (error) throw error;
    
    return {
      success: true,
      message: `✅ Budget aggiornato a €${budgetAmount.toFixed(2)}`,
      data
    };
  } catch (error: any) {
    console.error('Error updating budget:', error);
    return { success: false, message: `Errore: ${error.message}` };
  }
}

/**
 * Add a new note
 */
export async function addNote(
  userId: string,
  payload: Record<string, any>
): Promise<ExecutionResult> {
  try {
    const { content, title, category } = payload;
    const noteContent = content || title;
    
    if (!noteContent) {
      return { success: false, message: 'Contenuto nota mancante' };
    }
    
    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: userId,
        content: noteContent,
        category: category || null
      })
      .select()
      .single();

    if (error) throw error;
    
    return {
      success: true,
      message: `✅ Nota salvata`,
      data
    };
  } catch (error: any) {
    console.error('Error adding note:', error);
    return { success: false, message: `Errore: ${error.message}` };
  }
}

/**
 * Execute an AI command
 */
export async function executeAICommand(
  userId: string,
  command: AICommand
): Promise<ExecutionResult> {
  if (!command.type) {
    return { success: false, message: 'Nessun comando da eseguire' };
  }
  
  switch (command.type) {
    case 'create_event':
      return addEvent(userId, command.payload);
    case 'create_task':
      return addTask(userId, command.payload);
    case 'create_expense':
      return addExpense(userId, command.payload);
    case 'update_budget':
      return updateBudget(userId, command.payload);
    case 'create_note':
      return addNote(userId, command.payload);
    default:
      return { success: false, message: 'Tipo di comando non riconosciuto' };
  }
}
