/**
 * Habits Engine - Pattern recognition without AI
 */

import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, startOfWeek, subDays, getDay, getHours } from 'date-fns';
import type { HabitPattern, ProductivityPattern, SpendingPattern } from './types';

/**
 * Analyze task completion patterns
 */
export async function getProductivityPatterns(userId: string): Promise<ProductivityPattern> {
  const defaultPattern: ProductivityPattern = {
    mostProductiveDays: [1, 2, 3, 4, 5], // Mon-Fri by default
    mostProductiveHours: [9, 10, 11, 14, 15],
    averageTasksPerDay: 0,
    completionRate: 0
  };

  try {
    // Get tasks from last 30 days
    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo);

    if (!tasks || tasks.length === 0) {
      return defaultPattern;
    }

    const completedTasks = tasks.filter(t => t.completed);
    const completionRate = tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0;

    // Analyze by day of week
    const dayCount: Record<number, number> = {};
    const dayCompletions: Record<number, number> = {};

    completedTasks.forEach(task => {
      const dayOfWeek = getDay(parseISO(task.created_at));
      dayCompletions[dayOfWeek] = (dayCompletions[dayOfWeek] || 0) + 1;
    });

    tasks.forEach(task => {
      const dayOfWeek = getDay(parseISO(task.created_at));
      dayCount[dayOfWeek] = (dayCount[dayOfWeek] || 0) + 1;
    });

    // Find most productive days (highest completion count)
    const sortedDays = Object.entries(dayCompletions)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([day]) => parseInt(day));

    // Analyze by hour (using creation time as proxy)
    const hourCompletions: Record<number, number> = {};
    completedTasks.forEach(task => {
      const hour = getHours(parseISO(task.created_at));
      hourCompletions[hour] = (hourCompletions[hour] || 0) + 1;
    });

    const sortedHours = Object.entries(hourCompletions)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([hour]) => parseInt(hour));

    return {
      mostProductiveDays: sortedDays.length > 0 ? sortedDays : defaultPattern.mostProductiveDays,
      mostProductiveHours: sortedHours.length > 0 ? sortedHours : defaultPattern.mostProductiveHours,
      averageTasksPerDay: tasks.length / 30,
      completionRate
    };
  } catch (error) {
    console.error('Error getting productivity patterns:', error);
    return defaultPattern;
  }
}

/**
 * Analyze spending patterns
 */
export async function getSpendingPatterns(userId: string): Promise<SpendingPattern> {
  const defaultPattern: SpendingPattern = {
    highSpendingDays: [],
    topCategories: [],
    weeklyAverage: 0,
    monthlyTrend: 'stable'
  };

  try {
    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .gte('date', thirtyDaysAgo)
      .order('date', { ascending: false });

    if (!expenses || expenses.length === 0) {
      return defaultPattern;
    }

    // Analyze by day of week
    const daySpending: Record<number, number> = {};
    expenses.forEach(expense => {
      const dayOfWeek = getDay(parseISO(expense.date));
      daySpending[dayOfWeek] = (daySpending[dayOfWeek] || 0) + Number(expense.amount);
    });

    const sortedDays = Object.entries(daySpending)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([day]) => parseInt(day));

    // Analyze by category
    const categorySpending: Record<string, number> = {};
    let totalSpent = 0;
    expenses.forEach(expense => {
      const cat = expense.category || 'Altro';
      categorySpending[cat] = (categorySpending[cat] || 0) + Number(expense.amount);
      totalSpent += Number(expense.amount);
    });

    const topCategories = Object.entries(categorySpending)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: (amount / totalSpent) * 100
      }));

    // Weekly average
    const weeklyAverage = totalSpent / 4;

    // Monthly trend (compare first half vs second half)
    const fifteenDaysAgo = format(subDays(new Date(), 15), 'yyyy-MM-dd');
    const firstHalf = expenses.filter(e => e.date < fifteenDaysAgo);
    const secondHalf = expenses.filter(e => e.date >= fifteenDaysAgo);

    const firstHalfTotal = firstHalf.reduce((sum, e) => sum + Number(e.amount), 0);
    const secondHalfTotal = secondHalf.reduce((sum, e) => sum + Number(e.amount), 0);

    let monthlyTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (secondHalfTotal > firstHalfTotal * 1.2) {
      monthlyTrend = 'increasing';
    } else if (secondHalfTotal < firstHalfTotal * 0.8) {
      monthlyTrend = 'decreasing';
    }

    return {
      highSpendingDays: sortedDays,
      topCategories,
      weeklyAverage,
      monthlyTrend
    };
  } catch (error) {
    console.error('Error getting spending patterns:', error);
    return defaultPattern;
  }
}

/**
 * Get all user patterns
 */
export async function getUserPatterns(userId: string): Promise<HabitPattern[]> {
  const patterns: HabitPattern[] = [];

  const productivity = await getProductivityPatterns(userId);
  const spending = await getSpendingPatterns(userId);

  // Convert productivity patterns
  if (productivity.mostProductiveDays.length > 0) {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    patterns.push({
      type: 'productivity',
      description: `Sei più produttivo il ${productivity.mostProductiveDays.slice(0, 2).map(d => dayNames[d]).join(' e ')}.`,
      dayOfWeek: productivity.mostProductiveDays,
      frequency: productivity.averageTasksPerDay,
      confidence: productivity.completionRate / 100
    });
  }

  if (productivity.mostProductiveHours.length > 0) {
    patterns.push({
      type: 'productivity',
      description: `I tuoi orari più produttivi sono alle ${productivity.mostProductiveHours.slice(0, 2).join(' e alle ')}.`,
      timeOfDay: `${productivity.mostProductiveHours[0]}:00`,
      frequency: productivity.averageTasksPerDay,
      confidence: 0.7
    });
  }

  // Convert spending patterns
  if (spending.topCategories.length > 0) {
    patterns.push({
      type: 'spending',
      description: `Spendi di più in "${spending.topCategories[0].category}" (${spending.topCategories[0].percentage.toFixed(0)}% del totale).`,
      frequency: spending.weeklyAverage,
      confidence: 0.8
    });
  }

  if (spending.monthlyTrend !== 'stable') {
    patterns.push({
      type: 'spending',
      description: spending.monthlyTrend === 'increasing' 
        ? 'Le tue spese stanno aumentando questo mese.'
        : 'Le tue spese stanno diminuendo questo mese.',
      frequency: 1,
      confidence: 0.75
    });
  }

  return patterns;
}

/**
 * Predict best time slots based on habits
 */
export async function predictBestTimeSlots(userId: string): Promise<string[]> {
  const productivity = await getProductivityPatterns(userId);
  const suggestions: string[] = [];

  if (productivity.mostProductiveHours.length > 0) {
    const bestHour = productivity.mostProductiveHours[0];
    suggestions.push(`${bestHour}:00 - ${bestHour + 1}:00`);
    
    if (productivity.mostProductiveHours[1]) {
      const secondBest = productivity.mostProductiveHours[1];
      suggestions.push(`${secondBest}:00 - ${secondBest + 1}:00`);
    }
  }

  return suggestions.length > 0 ? suggestions : ['10:00 - 11:00', '14:00 - 15:00'];
}

/**
 * Identify potential weaknesses/areas to improve
 */
export async function predictWeaknesses(userId: string): Promise<string[]> {
  const weaknesses: string[] = [];

  const productivity = await getProductivityPatterns(userId);
  const spending = await getSpendingPatterns(userId);

  if (productivity.completionRate < 50) {
    weaknesses.push('Basso tasso di completamento task - considera di ridurre il numero di task');
  }

  if (spending.monthlyTrend === 'increasing') {
    weaknesses.push('Spese in aumento - potresti voler rivedere il budget');
  }

  if (spending.highSpendingDays.includes(0) || spending.highSpendingDays.includes(6)) {
    weaknesses.push('Spendi di più nel weekend - potresti pianificare meglio le spese');
  }

  return weaknesses;
}
