/**
 * Rules Engine - Intelligent rule-based analysis without AI
 */

import { supabase } from '@/integrations/supabase/client';
import { format, isToday, isTomorrow, startOfWeek, endOfWeek, startOfMonth, differenceInDays, parseISO, isAfter, isBefore, addHours } from 'date-fns';
import { it } from 'date-fns/locale';
import type { EngineOutput, TimeSlot, UserContext } from './types';

interface TaskData {
  id: string;
  title: string;
  priority: string;
  completed: boolean;
  created_at: string;
}

interface EventData {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  category?: string;
}

interface ExpenseData {
  id: string;
  amount: number;
  category: string;
  date: string;
  description?: string;
}

interface BudgetData {
  amount: number;
  month?: number;
  year: number;
}

/**
 * Analyze tasks and generate insights
 */
export async function analyzeTasksRules(userId: string): Promise<EngineOutput[]> {
  const insights: EngineOutput[] = [];

  try {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!tasks || tasks.length === 0) {
      insights.push({
        type: 'suggestion',
        title: 'Nessun task',
        message: 'Non hai ancora creato task. Vuoi iniziare aggiungendo qualcosa alla tua lista?',
        relevance: 0.5
      });
      return insights;
    }

    const pendingTasks = tasks.filter(t => !t.completed);
    const completedTasks = tasks.filter(t => t.completed);
    const highPriorityPending = pendingTasks.filter(t => t.priority === 'high');

    // High priority tasks alert
    if (highPriorityPending.length > 0) {
      insights.push({
        type: 'alert',
        title: 'Task prioritari',
        message: `Hai ${highPriorityPending.length} task ad alta priorità da completare: ${highPriorityPending.slice(0, 2).map(t => t.title).join(', ')}${highPriorityPending.length > 2 ? '...' : ''}`,
        relevance: 0.9,
        actionable: true
      });
    }

    // Too many pending tasks
    if (pendingTasks.length > 10) {
      insights.push({
        type: 'insight',
        title: 'Tanti task in sospeso',
        message: `Hai ${pendingTasks.length} task in sospeso. Considera di completarne o eliminarne alcuni per rimanere organizzato.`,
        relevance: 0.7
      });
    }

    // Good progress
    if (completedTasks.length > 0 && pendingTasks.length <= 3) {
      insights.push({
        type: 'insight',
        title: 'Ottimo lavoro!',
        message: 'Stai mantenendo la tua lista task sotto controllo. Continua così!',
        relevance: 0.4
      });
    }

    // Old uncompleted tasks (created > 7 days ago)
    const now = new Date();
    const oldTasks = pendingTasks.filter(t => {
      const createdAt = parseISO(t.created_at);
      return differenceInDays(now, createdAt) > 7;
    });

    if (oldTasks.length > 0) {
      insights.push({
        type: 'reminder',
        title: 'Task in ritardo',
        message: `Hai ${oldTasks.length} task creati più di una settimana fa ancora da completare.`,
        relevance: 0.8
      });
    }

  } catch (error) {
    console.error('Error analyzing tasks:', error);
  }

  return insights;
}

/**
 * Analyze events and generate insights
 */
export async function analyzeEventsRules(userId: string): Promise<EngineOutput[]> {
  const insights: EngineOutput[] = [];
  const now = new Date();

  try {
    const todayStart = format(now, 'yyyy-MM-dd 00:00:00');
    const weekEnd = format(endOfWeek(now), 'yyyy-MM-dd 23:59:59');

    const { data: events } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', todayStart)
      .lte('start_time', weekEnd)
      .order('start_time', { ascending: true });

    if (!events || events.length === 0) {
      insights.push({
        type: 'suggestion',
        title: 'Calendario libero',
        message: 'Non hai eventi programmati questa settimana. È il momento perfetto per pianificare qualcosa!',
        relevance: 0.4
      });
      return insights;
    }

    // Today's events
    const todayEvents = events.filter(e => isToday(parseISO(e.start_time)));
    if (todayEvents.length > 0) {
      const nextEvent = todayEvents[0];
      const eventTime = format(parseISO(nextEvent.start_time), 'HH:mm', { locale: it });
      insights.push({
        type: 'reminder',
        title: 'Prossimo evento',
        message: `Oggi hai "${nextEvent.title}" alle ${eventTime}.`,
        relevance: 0.9
      });
    }

    // Tomorrow's events
    const tomorrowEvents = events.filter(e => isTomorrow(parseISO(e.start_time)));
    if (tomorrowEvents.length > 0) {
      insights.push({
        type: 'insight',
        title: 'Domani',
        message: `Domani hai ${tomorrowEvents.length} eventi programmati.`,
        relevance: 0.6
      });
    }

    // Busy week
    if (events.length > 10) {
      insights.push({
        type: 'alert',
        title: 'Settimana intensa',
        message: `Questa settimana hai ${events.length} eventi. Ricordati di prenderti delle pause!`,
        relevance: 0.7
      });
    }

  } catch (error) {
    console.error('Error analyzing events:', error);
  }

  return insights;
}

/**
 * Analyze expenses vs budget
 */
export async function analyzeExpensesRules(userId: string): Promise<EngineOutput[]> {
  const insights: EngineOutput[] = [];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  try {
    // Get current month expenses
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .gte('date', monthStart)
      .order('date', { ascending: false });

    // Get budget
    const { data: budgets } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('year', currentYear)
      .or(`month.eq.${currentMonth},month.is.null`);

    const totalSpent = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
    const budget = budgets?.[0]?.amount || 1000;
    const percentage = (totalSpent / budget) * 100;

    // Budget alerts
    if (percentage >= 100) {
      insights.push({
        type: 'alert',
        title: 'Budget superato!',
        message: `Hai superato il budget mensile del ${(percentage - 100).toFixed(0)}%. Speso: €${totalSpent.toFixed(2)} su €${budget}`,
        relevance: 1.0
      });
    } else if (percentage >= 80) {
      insights.push({
        type: 'alert',
        title: 'Attenzione al budget',
        message: `Hai usato l'${percentage.toFixed(0)}% del tuo budget mensile. Rimangono €${(budget - totalSpent).toFixed(2)}`,
        relevance: 0.85
      });
    } else if (percentage >= 50) {
      insights.push({
        type: 'insight',
        title: 'Metà budget',
        message: `Hai speso €${totalSpent.toFixed(2)}, circa il ${percentage.toFixed(0)}% del budget mensile.`,
        relevance: 0.5
      });
    }

    // Category analysis
    if (expenses && expenses.length > 0) {
      const categoryTotals: Record<string, number> = {};
      expenses.forEach(e => {
        const cat = e.category || 'Altro';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(e.amount);
      });

      const topCategory = Object.entries(categoryTotals)
        .sort(([, a], [, b]) => b - a)[0];

      if (topCategory && topCategory[1] > totalSpent * 0.4) {
        insights.push({
          type: 'insight',
          title: 'Categoria principale',
          message: `La categoria "${topCategory[0]}" rappresenta il ${((topCategory[1] / totalSpent) * 100).toFixed(0)}% delle tue spese questo mese.`,
          relevance: 0.6
        });
      }
    }

  } catch (error) {
    console.error('Error analyzing expenses:', error);
  }

  return insights;
}

/**
 * Find free time slots in the schedule
 */
export async function findFreeTimeSlots(userId: string, context: UserContext): Promise<TimeSlot[]> {
  const slots: TimeSlot[] = [];
  const now = new Date();
  const workStart = context.preferences.workingHours?.start || '09:00';
  const workEnd = context.preferences.workingHours?.end || '18:00';

  try {
    const todayStart = format(now, 'yyyy-MM-dd 00:00:00');
    const todayEnd = format(now, 'yyyy-MM-dd 23:59:59');

    const { data: events } = await supabase
      .from('calendar_events')
      .select('start_time, end_time')
      .eq('user_id', userId)
      .gte('start_time', todayStart)
      .lte('start_time', todayEnd)
      .order('start_time', { ascending: true });

    // Simple gap detection
    let lastEnd = parseISO(`${format(now, 'yyyy-MM-dd')} ${workStart}`);
    const workEndTime = parseISO(`${format(now, 'yyyy-MM-dd')} ${workEnd}`);

    if (events && events.length > 0) {
      for (const event of events) {
        const eventStart = parseISO(event.start_time);
        const eventEnd = parseISO(event.end_time);

        if (isAfter(eventStart, lastEnd) && isAfter(eventStart, now)) {
          const gapMinutes = (eventStart.getTime() - lastEnd.getTime()) / 60000;
          if (gapMinutes >= 30) {
            slots.push({
              start: format(lastEnd, 'HH:mm'),
              end: format(eventStart, 'HH:mm'),
              duration: gapMinutes,
              type: 'free',
              quality: gapMinutes >= 60 ? 0.8 : 0.5
            });
          }
        }
        lastEnd = isAfter(eventEnd, lastEnd) ? eventEnd : lastEnd;
      }
    }

    // Check remaining time until work end
    if (isBefore(lastEnd, workEndTime) && isBefore(now, workEndTime)) {
      const actualStart = isAfter(now, lastEnd) ? now : lastEnd;
      const gapMinutes = (workEndTime.getTime() - actualStart.getTime()) / 60000;
      if (gapMinutes >= 30) {
        slots.push({
          start: format(actualStart, 'HH:mm'),
          end: workEnd,
          duration: gapMinutes,
          type: 'free',
          quality: 0.7
        });
      }
    }

  } catch (error) {
    console.error('Error finding free slots:', error);
  }

  return slots;
}

/**
 * Run all rules and combine insights
 */
export async function runAllRules(userId: string, context: UserContext): Promise<EngineOutput[]> {
  const [taskInsights, eventInsights, expenseInsights] = await Promise.all([
    analyzeTasksRules(userId),
    analyzeEventsRules(userId),
    analyzeExpensesRules(userId)
  ]);

  // Combine and sort by relevance
  const allInsights = [...taskInsights, ...eventInsights, ...expenseInsights];
  return allInsights.sort((a, b) => b.relevance - a.relevance);
}
