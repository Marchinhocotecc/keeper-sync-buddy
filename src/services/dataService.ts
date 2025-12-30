/**
 * Data Service - Gestisce tutte le operazioni con Supabase in modo ottimizzato
 */

import { supabase } from "@/integrations/supabase/client";

export interface DataServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Create operations
export async function createTask(
  userId: string,
  title: string,
  priority: 'low' | 'medium' | 'high' = 'medium',
  dueDate?: string
): Promise<DataServiceResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('todos')
      .insert({
        user_id: userId,
        title,
        priority,
        due_date: dueDate,
        completed: false
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createExpense(
  userId: string,
  amount: number,
  category: string,
  description?: string,
  date?: string
): Promise<DataServiceResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id: userId,
        amount,
        category,
        description,
        date: date || new Date().toISOString().split('T')[0]
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createEvent(
  userId: string,
  title: string,
  startTime: string,
  endTime: string,
  category?: string,
  description?: string
): Promise<DataServiceResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        user_id: userId,
        title,
        start_time: startTime,
        end_time: endTime,
        category,
        description
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createNote(
  userId: string,
  content: string,
  category?: string
): Promise<DataServiceResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: userId,
        content,
        category
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateWellness(
  userId: string,
  date: string,
  data: { sleep?: number; steps?: number; meditation_minutes?: number; activity?: string }
): Promise<DataServiceResponse<any>> {
  try {
    const { data: result, error } = await supabase
      .from('wellness_data')
      .upsert({
        user_id: userId,
        date,
        ...data
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Read operations
export async function getTasks(
  userId: string,
  filter: 'all' | 'pending' | 'completed' = 'all'
): Promise<DataServiceResponse<any[]>> {
  try {
    let query = supabase
      .from('todos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filter === 'pending') {
      query = query.eq('completed', false);
    } else if (filter === 'completed') {
      query = query.eq('completed', true);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getExpenses(
  userId: string,
  period?: 'today' | 'week' | 'month'
): Promise<DataServiceResponse<any[]>> {
  try {
    let query = supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (period) {
      const now = new Date();
      let startDate: Date;

      if (period === 'today') {
        startDate = new Date(now.setHours(0, 0, 0, 0));
      } else if (period === 'week') {
        startDate = new Date(now.setDate(now.getDate() - 7));
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      query = query.gte('date', startDate.toISOString().split('T')[0]);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getEvents(
  userId: string,
  scope: 'today' | 'week' | 'month' = 'week'
): Promise<DataServiceResponse<any[]>> {
  try {
    const now = new Date();
    let startDate: Date;
    let endDate = new Date(now);

    if (scope === 'today') {
      startDate = new Date(now.setHours(0, 0, 0, 0));
      endDate = new Date(now.setHours(23, 59, 59, 999));
    } else if (scope === 'week') {
      startDate = new Date(now);
      endDate = new Date(now.setDate(now.getDate() + 7));
    } else {
      startDate = new Date(now);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString())
      .order('start_time', { ascending: true });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getWellnessData(
  userId: string,
  days: number = 7
): Promise<DataServiceResponse<any[]>> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from('wellness_data')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getUserSettings(userId: string): Promise<DataServiceResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getNotes(userId: string): Promise<DataServiceResponse<any[]>> {
  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============ LIST OPERATIONS (for assistant) ============

export async function listTasks(userId: string): Promise<any[]> {
  const result = await getTasks(userId, 'pending');
  return result.data || [];
}

export async function listEvents(userId: string): Promise<any[]> {
  const result = await getEvents(userId, 'week');
  return result.data || [];
}

export async function listExpenses(userId: string): Promise<any[]> {
  const result = await getExpenses(userId, 'month');
  return result.data || [];
}

// ============ DELETE OPERATIONS ============

export async function deleteTask(userId: string, taskId: string): Promise<DataServiceResponse<any>> {
  try {
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('user_id', userId)
      .eq('id', taskId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteEvent(userId: string, eventId: string): Promise<DataServiceResponse<any>> {
  try {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('user_id', userId)
      .eq('id', eventId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteExpense(userId: string, expenseId: string): Promise<DataServiceResponse<any>> {
  try {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('user_id', userId)
      .eq('id', expenseId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteAllTasks(userId: string): Promise<DataServiceResponse<any>> {
  try {
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteAllEvents(userId: string): Promise<DataServiceResponse<any>> {
  try {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteAllExpenses(userId: string): Promise<DataServiceResponse<any>> {
  try {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============ COMPLETE OPERATIONS ============

export async function completeTask(userId: string, taskId: string): Promise<DataServiceResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('todos')
      .update({ completed: true })
      .eq('user_id', userId)
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
