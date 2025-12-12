/**
 * Core Engine - Main entry point for the internal assistant
 */

import { format, getHours, isWeekend } from 'date-fns';
import { it } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import type { DailyAnalysis, MorningBriefing, EveningReview, EngineOutput } from './types';
import { getContext } from './contextStore';
import { runAllRules, findFreeTimeSlots, analyzeExpensesRules, analyzeTasksRules, analyzeEventsRules } from './rulesEngine';
import { getUserPatterns, getProductivityPatterns, getSpendingPatterns, predictBestTimeSlots } from './habitsEngine';
import { generateSmartSuggestions, getContextualGreeting, getQuickActionSuggestions } from './suggestionsEngine';

/**
 * Run complete daily analysis
 */
export async function runDailyAnalysis(userId: string): Promise<DailyAnalysis> {
  const now = new Date();
  const context = await getContext(userId);
  const today = format(now, 'yyyy-MM-dd');

  // Fetch tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId);

  const pendingTasks = tasks?.filter(t => !t.completed).length || 0;
  const completedTasks = tasks?.filter(t => t.completed).length || 0;

  // Fetch today's events
  const todayStart = format(now, 'yyyy-MM-dd 00:00:00');
  const todayEnd = format(now, 'yyyy-MM-dd 23:59:59');
  
  const { data: events } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', todayStart)
    .lte('start_time', todayEnd);

  const upcomingEvents = events?.length || 0;

  // Fetch budget status
  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount')
    .eq('user_id', userId)
    .gte('date', format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'));

  const { data: budgets } = await supabase
    .from('budgets')
    .select('amount')
    .eq('user_id', userId)
    .eq('year', now.getFullYear())
    .or(`month.eq.${now.getMonth() + 1},month.is.null`);

  const spent = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
  const budget = budgets?.[0]?.amount || 1000;
  const percentage = (spent / budget) * 100;

  // Get insights and suggestions
  const freeTimeSlots = await findFreeTimeSlots(userId, context);
  const insights = await runAllRules(userId, context);
  const suggestions = await generateSmartSuggestions(userId);

  return {
    date: today,
    pendingTasks,
    completedTasks,
    upcomingEvents,
    freeTimeSlots,
    budgetStatus: {
      spent,
      budget,
      percentage,
      trend: percentage >= 100 ? 'over' : percentage >= 80 ? 'on_track' : 'under'
    },
    insights: insights.filter(i => i.type === 'insight' || i.type === 'alert'),
    suggestions: suggestions.filter(s => s.type === 'suggestion')
  };
}

/**
 * Generate morning briefing
 */
export async function runMorningBriefing(userId: string): Promise<MorningBriefing> {
  const now = new Date();
  const greeting = getContextualGreeting(userId);
  const analysis = await runDailyAnalysis(userId);
  const patterns = await getUserPatterns(userId);

  // Get high priority tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('title, priority')
    .eq('user_id', userId)
    .eq('completed', false)
    .eq('priority', 'high')
    .limit(3);

  const topPriorities = tasks?.map(t => t.title) || [];

  // Motivational notes based on patterns
  let motivationalNote: string | undefined;
  const productivity = await getProductivityPatterns(userId);
  
  if (productivity.completionRate > 70) {
    motivationalNote = 'Stai mantenendo un ottimo ritmo! Continua così! 💪';
  } else if (isWeekend(now)) {
    motivationalNote = 'Buon weekend! Ricordati di riposarti anche tu.';
  } else {
    motivationalNote = 'Ogni task completato è un passo avanti. Ce la puoi fare!';
  }

  return {
    greeting: (await greeting).greeting,
    date: format(now, 'EEEE d MMMM yyyy', { locale: it }),
    tasksToday: analysis.pendingTasks,
    eventsToday: analysis.upcomingEvents,
    topPriorities,
    suggestions: analysis.suggestions.slice(0, 3),
    motivationalNote
  };
}

/**
 * Generate evening review
 */
export async function runEveningReview(userId: string): Promise<EveningReview> {
  const now = new Date();
  const todayStart = format(now, 'yyyy-MM-dd 00:00:00');

  // Get today's completed tasks
  const { data: completedToday } = await supabase
    .from('tasks')
    .select('title')
    .eq('user_id', userId)
    .eq('completed', true)
    .gte('created_at', todayStart);

  const { data: pendingTasks } = await supabase
    .from('tasks')
    .select('title, priority')
    .eq('user_id', userId)
    .eq('completed', false);

  // Get tomorrow's events preview
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStart = format(tomorrow, 'yyyy-MM-dd 00:00:00');
  const tomorrowEnd = format(tomorrow, 'yyyy-MM-dd 23:59:59');

  const { data: tomorrowEvents } = await supabase
    .from('calendar_events')
    .select('title, start_time')
    .eq('user_id', userId)
    .gte('start_time', tomorrowStart)
    .lte('start_time', tomorrowEnd)
    .order('start_time', { ascending: true })
    .limit(3);

  // Generate summary
  const tasksCompleted = completedToday?.length || 0;
  const tasksRemaining = pendingTasks?.length || 0;

  let summary: string;
  if (tasksCompleted > 5) {
    summary = `Giornata super produttiva! Hai completato ${tasksCompleted} task.`;
  } else if (tasksCompleted > 0) {
    summary = `Oggi hai completato ${tasksCompleted} task. Buon lavoro!`;
  } else {
    summary = 'Oggi è stata una giornata tranquilla. Domani è un nuovo giorno!';
  }

  // Highlights
  const highlights: string[] = [];
  if (tasksCompleted > 0) {
    highlights.push(`✅ ${tasksCompleted} task completati`);
  }
  
  // Get spending summary
  const { data: todayExpenses } = await supabase
    .from('expenses')
    .select('amount')
    .eq('user_id', userId)
    .eq('date', format(now, 'yyyy-MM-dd'));

  const todaySpent = todayExpenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
  if (todaySpent > 0) {
    highlights.push(`💰 €${todaySpent.toFixed(2)} spesi oggi`);
  }

  // Tomorrow preview
  const tomorrowPreview = tomorrowEvents?.map(e => {
    const time = format(new Date(e.start_time), 'HH:mm');
    return `${time} - ${e.title}`;
  }) || [];

  // Generate insights for tomorrow
  const insights: EngineOutput[] = [];
  const highPriorityRemaining = pendingTasks?.filter(t => t.priority === 'high').length || 0;
  
  if (highPriorityRemaining > 0) {
    insights.push({
      type: 'reminder',
      title: 'Da fare domani',
      message: `Hai ancora ${highPriorityRemaining} task ad alta priorità da completare.`,
      relevance: 0.8
    });
  }

  return {
    summary,
    tasksCompleted,
    tasksRemaining,
    highlights,
    tomorrowPreview,
    insights
  };
}

/**
 * Handle real-time triggers (events that happen during the day)
 */
export async function runRealTimeTrigger(
  userId: string,
  event: {
    type: 'task_completed' | 'expense_added' | 'event_upcoming' | 'budget_alert';
    data: Record<string, any>;
  }
): Promise<EngineOutput | null> {
  const context = await getContext(userId);

  switch (event.type) {
    case 'task_completed':
      return {
        type: 'insight',
        title: 'Task completato!',
        message: `Ottimo lavoro! Hai completato "${event.data.title}".`,
        relevance: 0.6
      };

    case 'expense_added':
      const expenseInsights = await analyzeExpensesRules(userId);
      const alerts = expenseInsights.filter(i => i.type === 'alert');
      if (alerts.length > 0) {
        return alerts[0];
      }
      return null;

    case 'event_upcoming':
      return {
        type: 'reminder',
        title: 'Evento in arrivo',
        message: `"${event.data.title}" inizia tra ${event.data.minutes} minuti.`,
        relevance: 0.9
      };

    case 'budget_alert':
      return {
        type: 'alert',
        title: 'Attenzione al budget',
        message: `Hai raggiunto il ${event.data.percentage}% del tuo budget mensile.`,
        relevance: 0.85
      };

    default:
      return null;
  }
}

/**
 * Get quick summary for the assistant
 */
export async function getQuickSummary(userId: string): Promise<string> {
  const analysis = await runDailyAnalysis(userId);
  
  const parts: string[] = [];

  if (analysis.pendingTasks > 0) {
    parts.push(`${analysis.pendingTasks} task da completare`);
  }

  if (analysis.upcomingEvents > 0) {
    parts.push(`${analysis.upcomingEvents} eventi oggi`);
  }

  if (analysis.budgetStatus.percentage >= 80) {
    parts.push(`budget al ${analysis.budgetStatus.percentage.toFixed(0)}%`);
  }

  if (parts.length === 0) {
    return 'Tutto tranquillo per oggi!';
  }

  return `Hai ${parts.join(', ')}.`;
}

// Export convenience functions
export { generateSmartSuggestions, getContextualGreeting, getQuickActionSuggestions };
