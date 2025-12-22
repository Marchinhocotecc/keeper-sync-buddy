/**
 * Context Loader - Loads user context from Supabase
 * 
 * PHASE 2 of the Assistant Pipeline
 * Loads all relevant data BEFORE responding
 */

import { supabase } from '@/integrations/supabase/client';
import { format, addDays, startOfMonth } from 'date-fns';
import { getRecentMessages } from './contextStore';
import { ensureUserSettings } from '@/services/settingsService';
import type { ConversationMessage } from './types';

export interface UserContext {
  todayTasks: TaskData[];
  tomorrowTasks: TaskData[];
  pendingTasks: TaskData[];
  todayEvents: EventData[];
  tomorrowEvents: EventData[];
  monthlyExpenses: ExpenseData[];
  totalSpent: number;
  budget: number;
  budgetRemaining: number;
  budgetPercentage: number;
  recentMessages: ConversationMessage[];
  preferences: UserPreferences;
  isLoaded: boolean;
}

export interface TaskData {
  id: string;
  title: string;
  priority: string;
  completed: boolean;
  created_at: string;
}

export interface EventData {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  category?: string;
  description?: string;
}

export interface ExpenseData {
  id: string;
  amount: number;
  category?: string;
  description?: string;
  date: string;
}

export interface UserPreferences {
  language: string;
  monthlyBudget: number;
  notificationsEnabled: boolean;
}

/**
 * Load complete user context from Supabase
 * Called BEFORE generating any response
 * 
 * USA ensureUserSettings per garantire che settings esista sempre
 */
export async function loadUserContext(userId: string): Promise<UserContext> {
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  
  // Parallel fetch all data - settings usa ensureUserSettings (NO 406!)
  const [
    tasksResult,
    todayEventsResult,
    tomorrowEventsResult,
    expensesResult,
    budgetResult,
    settings,
    recentMessages
  ] = await Promise.all([
    // All tasks
    supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    
    // Today's events
    supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', `${today} 00:00:00`)
      .lte('start_time', `${today} 23:59:59`)
      .order('start_time', { ascending: true }),
    
    // Tomorrow's events
    supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', `${tomorrow} 00:00:00`)
      .lte('start_time', `${tomorrow} 23:59:59`)
      .order('start_time', { ascending: true }),
    
    // Monthly expenses
    supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .gte('date', monthStart)
      .order('date', { ascending: false }),
    
    // Budget from budgets table
    supabase
      .from('budgets')
      .select('amount')
      .eq('user_id', userId)
      .eq('year', new Date().getFullYear())
      .or(`month.eq.${new Date().getMonth() + 1},month.is.null`)
      .limit(1),
    
    // Settings - USA ensureUserSettings (garantisce esistenza, NO 406)
    ensureUserSettings(userId),
    
    // Recent conversation
    getRecentMessages(userId, 5)
  ]);
  
  // Process tasks
  const allTasks = (tasksResult.data || []) as TaskData[];
  const pendingTasks = allTasks.filter(t => !t.completed);
  
  // Today's tasks (created today and pending)
  const todayTasks = pendingTasks.filter(t => 
    t.created_at?.startsWith(today)
  );
  
  // Tomorrow doesn't have specific tasks, just show pending
  const tomorrowTasks: TaskData[] = [];
  
  // Process events
  const todayEvents = (todayEventsResult.data || []) as EventData[];
  const tomorrowEvents = (tomorrowEventsResult.data || []) as EventData[];
  
  // Process expenses
  const monthlyExpenses = (expensesResult.data || []) as ExpenseData[];
  const totalSpent = monthlyExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  
  // Budget - usa SOLO la tabella budgets (NON settings.monthly_budget)
  const budget = budgetResult.data?.[0]?.amount || 1000;
  const budgetRemaining = budget - totalSpent;
  const budgetPercentage = budget > 0 ? (totalSpent / budget) * 100 : 0;
  
  // Preferences - settings è già un oggetto UserSettings (grazie a ensureUserSettings)
  const preferences: UserPreferences = {
    language: settings.language || 'it',
    monthlyBudget: budget,
    notificationsEnabled: settings.notifications_enabled ?? true
  };
  
  return {
    todayTasks,
    tomorrowTasks,
    pendingTasks,
    todayEvents,
    tomorrowEvents,
    monthlyExpenses,
    totalSpent,
    budget,
    budgetRemaining,
    budgetPercentage,
    recentMessages,
    preferences,
    isLoaded: true
  };
}

/**
 * Get quick summary for context-aware responses
 */
export function getContextSummary(context: UserContext): string {
  const parts: string[] = [];
  
  if (context.pendingTasks.length > 0) {
    parts.push(`${context.pendingTasks.length} task in sospeso`);
  }
  
  if (context.todayEvents.length > 0) {
    parts.push(`${context.todayEvents.length} eventi oggi`);
  }
  
  if (context.budgetPercentage >= 80) {
    parts.push(`budget al ${context.budgetPercentage.toFixed(0)}%`);
  }
  
  return parts.length > 0 ? parts.join(', ') : 'nessun impegno urgente';
}

/**
 * Check if user has a busy day
 */
export function isBusyDay(context: UserContext): boolean {
  return context.todayEvents.length >= 3 || context.pendingTasks.length >= 5;
}

/**
 * Check if user has free time
 */
export function hasFreeTime(context: UserContext): boolean {
  return context.todayEvents.length === 0 && context.pendingTasks.length < 3;
}

/**
 * Get context-aware greeting based on time and data
 */
export function getContextualGreeting(context: UserContext): string {
  const hour = new Date().getHours();
  let greeting = 'Ciao';
  
  if (hour < 12) greeting = 'Buongiorno';
  else if (hour < 18) greeting = 'Buon pomeriggio';
  else greeting = 'Buonasera';
  
  if (context.todayEvents.length > 0) {
    const nextEvent = context.todayEvents[0];
    return `${greeting}! Il tuo prossimo evento è "${nextEvent.title}".`;
  }
  
  if (context.pendingTasks.length > 0) {
    return `${greeting}! Hai ${context.pendingTasks.length} task da completare.`;
  }
  
  return `${greeting}! Come posso aiutarti?`;
}
