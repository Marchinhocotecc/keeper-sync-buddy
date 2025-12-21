/**
 * ActionEngine - Single Source of Truth for all domain logic
 * 
 * RULES:
 * - UI and Assistant MUST use these functions
 * - No other module can write to Supabase for tasks/events/expenses
 * - Deterministic: same input → same output
 * - Only required fields block creation
 */

import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

// ============ TYPES ============

export interface ActionError {
  type: 'VALIDATION_ERROR' | 'DATABASE_ERROR';
  missing_fields?: string[];
  message?: string;
}

export type ActionResult<T = any> = 
  | { success: true; data: T }
  | { success: false; error: ActionError };

// Input types - only required fields are non-optional
export interface CreateTaskInput {
  user_id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority?: 'low' | 'medium' | 'high';
  completed?: boolean;
}

export interface CreateEventInput {
  user_id: string;
  title: string;
  date: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  notes?: string;
  category?: string;
}

export interface CreateExpenseInput {
  user_id: string;
  amount: number;
  category: string;
  date?: string;
  note?: string;
}

export interface TaskFilters {
  status?: 'all' | 'pending' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  limit?: number;
}

export interface EventFilters {
  scope?: 'today' | 'tomorrow' | 'week' | 'month';
  from_date?: string;
  to_date?: string;
  limit?: number;
}

export interface ExpenseFilters {
  period?: 'today' | 'week' | 'month' | 'all';
  category?: string;
  limit?: number;
}

// ============ CREATE OPERATIONS ============

export async function createTask(input: CreateTaskInput): Promise<ActionResult> {
  // Validate required fields
  const missingFields: string[] = [];
  if (!input.user_id) missingFields.push('user_id');
  if (!input.title || input.title.trim() === '') missingFields.push('title');
  
  if (missingFields.length > 0) {
    return {
      success: false,
      error: { type: 'VALIDATION_ERROR', missing_fields: missingFields }
    };
  }
  
  // Insert with defaults
  const { data, error } = await supabase
    .from('todos')
    .insert({
      user_id: input.user_id,
      title: input.title.trim(),
      priority: input.priority ?? 'medium',
      due_date: input.due_date ?? null,
      completed: input.completed ?? false
    })
    .select()
    .single();
  
  if (error) {
    return {
      success: false,
      error: { type: 'DATABASE_ERROR', message: error.message }
    };
  }
  
  return { success: true, data };
}

export async function createEvent(input: CreateEventInput): Promise<ActionResult> {
  // Validate required fields
  const missingFields: string[] = [];
  if (!input.user_id) missingFields.push('user_id');
  if (!input.title || input.title.trim() === '') missingFields.push('title');
  if (!input.date) missingFields.push('date');
  
  if (missingFields.length > 0) {
    return {
      success: false,
      error: { type: 'VALIDATION_ERROR', missing_fields: missingFields }
    };
  }
  
  // Build datetime strings
  const startTime = input.start_time ?? '09:00';
  const endTime = input.end_time ?? calculateEndTime(startTime);
  const startDateTime = `${input.date} ${startTime}:00`;
  const endDateTime = `${input.date} ${endTime}:00`;
  
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      user_id: input.user_id,
      title: input.title.trim(),
      start_time: startDateTime,
      end_time: endDateTime,
      category: input.category ?? null,
      description: input.notes ?? null
    })
    .select()
    .single();
  
  if (error) {
    return {
      success: false,
      error: { type: 'DATABASE_ERROR', message: error.message }
    };
  }
  
  return { success: true, data };
}

export async function recordExpense(input: CreateExpenseInput): Promise<ActionResult> {
  // Validate required fields
  const missingFields: string[] = [];
  if (!input.user_id) missingFields.push('user_id');
  if (input.amount === undefined || input.amount === null || input.amount <= 0) missingFields.push('amount');
  if (!input.category || input.category.trim() === '') missingFields.push('category');
  
  if (missingFields.length > 0) {
    return {
      success: false,
      error: { type: 'VALIDATION_ERROR', missing_fields: missingFields }
    };
  }
  
  const expenseDate = input.date ?? format(new Date(), 'yyyy-MM-dd');
  
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      user_id: input.user_id,
      amount: input.amount,
      category: input.category.trim(),
      description: input.note ?? null,
      date: expenseDate
    })
    .select()
    .single();
  
  if (error) {
    return {
      success: false,
      error: { type: 'DATABASE_ERROR', message: error.message }
    };
  }
  
  return { success: true, data };
}

// ============ QUERY OPERATIONS ============

export async function queryTasks(
  userId: string,
  filters: TaskFilters = {}
): Promise<ActionResult> {
  if (!userId) {
    return {
      success: false,
      error: { type: 'VALIDATION_ERROR', missing_fields: ['user_id'] }
    };
  }
  
  let query = supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  // Apply filters
  if (filters.status === 'pending') {
    query = query.eq('completed', false);
  } else if (filters.status === 'completed') {
    query = query.eq('completed', true);
  }
  
  if (filters.priority) {
    query = query.eq('priority', filters.priority);
  }
  
  if (filters.limit) {
    query = query.limit(filters.limit);
  }
  
  const { data, error } = await query;
  
  if (error) {
    return {
      success: false,
      error: { type: 'DATABASE_ERROR', message: error.message }
    };
  }
  
  return { success: true, data: data ?? [] };
}

export async function queryEvents(
  userId: string,
  filters: EventFilters = {}
): Promise<ActionResult> {
  if (!userId) {
    return {
      success: false,
      error: { type: 'VALIDATION_ERROR', missing_fields: ['user_id'] }
    };
  }
  
  const now = new Date();
  let startDate: Date;
  let endDate: Date;
  
  // Calculate date range based on scope
  if (filters.from_date && filters.to_date) {
    startDate = new Date(filters.from_date);
    endDate = new Date(filters.to_date);
  } else {
    switch (filters.scope) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      case 'tomorrow':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        break;
      case 'week':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59);
        break;
    }
  }
  
  let query = supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', startDate.toISOString())
    .lte('start_time', endDate.toISOString())
    .order('start_time', { ascending: true });
  
  if (filters.limit) {
    query = query.limit(filters.limit);
  }
  
  const { data, error } = await query;
  
  if (error) {
    return {
      success: false,
      error: { type: 'DATABASE_ERROR', message: error.message }
    };
  }
  
  return { success: true, data: data ?? [] };
}

export async function queryExpenses(
  userId: string,
  filters: ExpenseFilters = {}
): Promise<ActionResult> {
  if (!userId) {
    return {
      success: false,
      error: { type: 'VALIDATION_ERROR', missing_fields: ['user_id'] }
    };
  }
  
  let query = supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  
  // Apply period filter
  if (filters.period && filters.period !== 'all') {
    const now = new Date();
    let startDate: Date;
    
    switch (filters.period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(0);
    }
    
    query = query.gte('date', format(startDate, 'yyyy-MM-dd'));
  }
  
  if (filters.category) {
    query = query.eq('category', filters.category);
  }
  
  if (filters.limit) {
    query = query.limit(filters.limit);
  }
  
  const { data, error } = await query;
  
  if (error) {
    return {
      success: false,
      error: { type: 'DATABASE_ERROR', message: error.message }
    };
  }
  
  return { success: true, data: data ?? [] };
}

// ============ HELPERS ============

function calculateEndTime(startTime: string): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endHour = (hours + 1) % 24;
  return `${endHour.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')}`;
}
