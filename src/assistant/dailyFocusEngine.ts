/**
 * Daily Focus Engine - Deterministic decision engine for daily priorities
 * 
 * This engine analyzes user data and makes decisive recommendations
 * about what the user should focus on today.
 */

import { format, parseISO, differenceInMinutes, isToday, isBefore, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { getRecentMessages } from './contextStore';

// Types for the Focus Engine
export interface FocusItem {
  type: 'task' | 'event' | 'recovery' | 'wellness';
  id: string | null;
  title: string;
  reason: string;
  confidence: 'high' | 'medium';
  priority: number; // 1-10
  estimatedMinutes?: number;
  action?: {
    type: 'complete' | 'skip' | 'reschedule';
    payload?: Record<string, any>;
  };
}

export interface DailyFocus {
  items: FocusItem[];
  availableMinutes: number;
  energyLevel: 'low' | 'medium' | 'high';
  cognitiveCapacity: number; // 1-3 based on energy
  summary: string;
  reasoning: string;
}

export interface TimeBlock {
  start: Date;
  end: Date;
  durationMinutes: number;
  type: 'free' | 'busy';
}

// Constants
const MAX_FOCUS_ITEMS = 3;
const COGNITIVE_LIMITS: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3
};

/**
 * Main entry point: Calculate today's focus
 */
export async function calculateDailyFocus(userId: string): Promise<DailyFocus> {
  // Gather all data in parallel
  const [
    freeTimeBlocks,
    pendingTasks,
    todayEvents,
    energyLevel,
    conversationContext
  ] = await Promise.all([
    calculateFreeTime(userId),
    getPendingTasks(userId),
    getTodayEvents(userId),
    estimateEnergyLevel(userId),
    analyzeConversationContext(userId)
  ]);

  const availableMinutes = freeTimeBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  const cognitiveCapacity = COGNITIVE_LIMITS[energyLevel];

  // Build focus items
  const focusItems = buildFocusItems(
    pendingTasks,
    todayEvents,
    freeTimeBlocks,
    energyLevel,
    cognitiveCapacity,
    conversationContext
  );

  // Generate summary
  const summary = generateSummary(focusItems, availableMinutes, energyLevel);
  const reasoning = generateReasoning(focusItems, energyLevel, conversationContext);

  return {
    items: focusItems,
    availableMinutes,
    energyLevel,
    cognitiveCapacity,
    summary,
    reasoning
  };
}

/**
 * Calculate free time blocks for today
 */
async function calculateFreeTime(userId: string): Promise<TimeBlock[]> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(8, 0, 0, 0); // Working hours start at 8
  
  const todayEnd = new Date(now);
  todayEnd.setHours(20, 0, 0, 0); // Working hours end at 20

  const { data: events } = await supabase
    .from('calendar_events')
    .select('start_time, end_time, title')
    .eq('user_id', userId)
    .gte('start_time', format(todayStart, 'yyyy-MM-dd HH:mm:ss'))
    .lte('end_time', format(todayEnd, 'yyyy-MM-dd HH:mm:ss'))
    .order('start_time', { ascending: true });

  const busyBlocks: TimeBlock[] = (events || []).map(e => ({
    start: new Date(e.start_time),
    end: new Date(e.end_time),
    durationMinutes: differenceInMinutes(new Date(e.end_time), new Date(e.start_time)),
    type: 'busy' as const
  }));

  // Find free slots
  const freeBlocks: TimeBlock[] = [];
  let currentTime = now > todayStart ? now : todayStart;

  for (const busy of busyBlocks) {
    if (busy.start > currentTime) {
      const gap = differenceInMinutes(busy.start, currentTime);
      if (gap >= 30) { // Only count gaps of 30+ minutes
        freeBlocks.push({
          start: currentTime,
          end: busy.start,
          durationMinutes: gap,
          type: 'free'
        });
      }
    }
    currentTime = busy.end > currentTime ? busy.end : currentTime;
  }

  // Add remaining time until end of day
  if (currentTime < todayEnd) {
    const remaining = differenceInMinutes(todayEnd, currentTime);
    if (remaining >= 30) {
      freeBlocks.push({
        start: currentTime,
        end: todayEnd,
        durationMinutes: remaining,
        type: 'free'
      });
    }
  }

  return freeBlocks;
}

/**
 * Get pending tasks prioritized by urgency
 */
async function getPendingTasks(userId: string) {
  console.log('[TaskRepo] SELECT todos (daily focus)', { user_id: userId });
  const { data: todos } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .eq('completed', false)
    .order('due_date', { ascending: true, nullsFirst: false });

  // Score and return tasks from todos only (single source of truth)
  const allTasks = (todos || []).map(t => ({
    ...t,
    source: 'todos' as const,
    daysOverdue: t.due_date ? calculateDaysOverdue(t.due_date) : 0,
    urgencyScore: calculateUrgencyScore(t)
  }));

  return allTasks.sort((a, b) => b.urgencyScore - a.urgencyScore);
}

/**
 * Calculate urgency score for a task (higher = more urgent)
 */
function calculateUrgencyScore(task: any): number {
  let score = 5; // Base score

  // Priority weighting
  if (task.priority === 'high') score += 3;
  else if (task.priority === 'medium') score += 1;
  else score -= 1;

  // Due date weighting
  if (task.due_date) {
    const daysUntilDue = Math.floor((new Date(task.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue < 0) score += 4; // Overdue
    else if (daysUntilDue === 0) score += 3; // Due today
    else if (daysUntilDue <= 2) score += 2; // Due soon
  }

  // Age weighting (older uncompleted tasks get priority)
  if (task.created_at) {
    const daysOld = Math.floor((Date.now() - new Date(task.created_at).getTime()) / (1000 * 60 * 60 * 24));
    if (daysOld > 7) score += 2;
    else if (daysOld > 3) score += 1;
  }

  return Math.min(score, 10);
}

function calculateDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/**
 * Get today's events
 */
async function getTodayEvents(userId: string) {
  const todayStart = format(new Date(), 'yyyy-MM-dd 00:00:00');
  const todayEnd = format(new Date(), 'yyyy-MM-dd 23:59:59');

  const { data: events } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', todayStart)
    .lte('start_time', todayEnd)
    .order('start_time', { ascending: true });

  return events || [];
}

/**
 * Estimate energy level from wellness data
 */
async function estimateEnergyLevel(userId: string): Promise<'low' | 'medium' | 'high'> {
  const yesterday = format(addDays(new Date(), -1), 'yyyy-MM-dd');
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: wellness } = await supabase
    .from('wellness_data')
    .select('*')
    .eq('user_id', userId)
    .in('date', [yesterday, today])
    .order('date', { ascending: false })
    .limit(1);

  if (!wellness || wellness.length === 0) {
    return 'medium'; // Default to medium if no data
  }

  const latest = wellness[0];
  let score = 50; // Base score

  // Sleep quality (0-10 hours, optimal is 7-8)
  if (latest.sleep) {
    if (latest.sleep >= 7 && latest.sleep <= 8) score += 20;
    else if (latest.sleep >= 6) score += 10;
    else if (latest.sleep < 5) score -= 20;
  }

  // Steps (activity level)
  if (latest.steps) {
    if (latest.steps >= 8000) score += 15;
    else if (latest.steps >= 5000) score += 5;
    else if (latest.steps < 2000) score -= 10;
  }

  // Meditation (stress management)
  if (latest.meditation_minutes && latest.meditation_minutes > 0) {
    score += 10;
  }

  // Convert score to level
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * Analyze conversation context for user state signals
 */
async function analyzeConversationContext(userId: string): Promise<{
  hasConfusion: boolean;
  hasOverload: boolean;
  hasFatigue: boolean;
  recentTopics: string[];
}> {
  const messages = await getRecentMessages(userId, 5);
  
  const confusionKeywords = ['confuso', 'non so', 'non capisco', 'aiutami', 'perso'];
  const overloadKeywords = ['troppo', 'tanto', 'stress', 'non ce la faccio', 'sovraccarico'];
  const fatigueKeywords = ['stanco', 'esausto', 'dormito poco', 'fatica', 'energia'];

  const allContent = messages.map(m => m.content.toLowerCase()).join(' ');

  return {
    hasConfusion: confusionKeywords.some(k => allContent.includes(k)),
    hasOverload: overloadKeywords.some(k => allContent.includes(k)),
    hasFatigue: fatigueKeywords.some(k => allContent.includes(k)),
    recentTopics: extractTopics(messages)
  };
}

function extractTopics(messages: any[]): string[] {
  const topics: string[] = [];
  for (const msg of messages) {
    if (msg.intent && msg.intent !== 'unknown') {
      topics.push(msg.intent);
    }
  }
  return [...new Set(topics)];
}

/**
 * Build focus items with intelligent prioritization
 */
function buildFocusItems(
  tasks: any[],
  events: any[],
  freeTime: TimeBlock[],
  energy: 'low' | 'medium' | 'high',
  capacity: number,
  context: { hasConfusion: boolean; hasOverload: boolean; hasFatigue: boolean }
): FocusItem[] {
  const items: FocusItem[] = [];
  const totalFreeMinutes = freeTime.reduce((sum, b) => sum + b.durationMinutes, 0);

  // Adjust capacity based on context signals
  let adjustedCapacity = capacity;
  if (context.hasOverload || context.hasFatigue) {
    adjustedCapacity = Math.max(1, capacity - 1);
  }

  // If user is overwhelmed, suggest recovery first
  if (context.hasOverload || context.hasFatigue || energy === 'low') {
    if (totalFreeMinutes >= 30) {
      items.push({
        type: 'recovery',
        id: null,
        title: 'Prenditi 15 minuti di pausa',
        reason: energy === 'low' 
          ? 'La tua energia è bassa. Una breve pausa ti aiuterà a essere più efficace.'
          : 'Sembri sovraccarico. Prima di fare altro, ricarica le batterie.',
        confidence: 'high',
        priority: 10,
        estimatedMinutes: 15,
        action: { type: 'skip' }
      });
      adjustedCapacity = Math.max(1, adjustedCapacity - 1);
    }
  }

  // Add urgent events (within 2 hours)
  const now = new Date();
  const urgentEvents = events.filter(e => {
    const start = new Date(e.start_time);
    const hoursUntil = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntil > 0 && hoursUntil <= 2;
  });

  for (const event of urgentEvents.slice(0, 1)) {
    if (items.length >= adjustedCapacity) break;
    const startTime = format(new Date(event.start_time), 'HH:mm');
    items.push({
      type: 'event',
      id: event.id,
      title: event.title,
      reason: `Inizia alle ${startTime}. Preparati per questo appuntamento.`,
      confidence: 'high',
      priority: 9,
      action: { type: 'complete', payload: { eventId: event.id } }
    });
  }

  // Add highest priority tasks
  const selectedTasks = tasks.slice(0, adjustedCapacity - items.length);
  
  for (const task of selectedTasks) {
    if (items.length >= adjustedCapacity) break;

    let reason = '';
    if (task.daysOverdue > 0) {
      reason = `In ritardo di ${task.daysOverdue} giorn${task.daysOverdue === 1 ? 'o' : 'i'}. È il momento di chiuderlo.`;
    } else if (task.priority === 'high') {
      reason = 'Alta priorità. Meglio farlo quando hai ancora energia.';
    } else if (task.urgencyScore >= 7) {
      reason = 'È in sospeso da tempo. Completarlo ti darà soddisfazione.';
    } else {
      reason = 'Un buon task da completare nel tempo libero che hai.';
    }

    items.push({
      type: 'task',
      id: task.id,
      title: task.title,
      reason,
      confidence: task.urgencyScore >= 7 ? 'high' : 'medium',
      priority: task.urgencyScore,
      estimatedMinutes: 30, // Default estimate
      action: { 
        type: 'complete', 
        payload: { taskId: task.id, source: task.source } 
      }
    });
  }

  return items.sort((a, b) => b.priority - a.priority);
}

/**
 * Generate human-readable summary
 */
function generateSummary(items: FocusItem[], availableMinutes: number, energy: string): string {
  if (items.length === 0) {
    return 'Oggi sei libero! Nessun impegno urgente. Goditi la giornata.';
  }

  const hours = Math.floor(availableMinutes / 60);
  const mins = availableMinutes % 60;
  const timeStr = hours > 0 
    ? `${hours} or${hours === 1 ? 'a' : 'e'}${mins > 0 ? ` e ${mins} minuti` : ''}`
    : `${mins} minuti`;

  const mainItem = items[0];
  
  if (items.length === 1) {
    return `Hai ${timeStr} liberi. Ti propongo una sola cosa: ${mainItem.title.toLowerCase()}.`;
  }

  return `Hai ${timeStr} liberi e ${items.length} cose su cui concentrarti. La priorità è: ${mainItem.title.toLowerCase()}.`;
}

/**
 * Generate reasoning explanation
 */
function generateReasoning(
  items: FocusItem[], 
  energy: string,
  context: { hasConfusion: boolean; hasOverload: boolean; hasFatigue: boolean }
): string {
  const parts: string[] = [];

  if (energy === 'low') {
    parts.push('La tua energia oggi è bassa');
  } else if (energy === 'high') {
    parts.push('Hai buona energia oggi');
  }

  if (context.hasOverload) {
    parts.push('ho notato che sei sotto pressione');
  }

  if (context.hasConfusion) {
    parts.push('ti aiuto a fare chiarezza');
  }

  if (items.length > 0) {
    const reasons = items.map(i => i.reason).filter(Boolean);
    if (reasons.length > 0) {
      parts.push(reasons[0]);
    }
  }

  return parts.length > 0 
    ? parts.join('. ') + '.'
    : 'Ho analizzato i tuoi impegni e selezionato le priorità più importanti.';
}

/**
 * Quick check if user is asking for focus/guidance
 */
export function isFocusRequest(message: string): boolean {
  const patterns = [
    /cosa (potrei|dovrei|devo) fare/i,
    /da dove (inizio|comincio|parto)/i,
    /sono (confuso|perso|sovraccarico)/i,
    /ho poco tempo/i,
    /aiutami a (decidere|organizzare|capire)/i,
    /cosa mi (consigli|suggerisci)/i,
    /priorit[àa]/i,
    /su cosa (mi )?concentro/i,
    /cosa (è|sarebbe) (più )?importante/i,
    /non so (cosa|da dove)/i,
    /giornata|oggi|mattina|pomeriggio/i
  ];

  return patterns.some(p => p.test(message));
}

/**
 * Format focus response for the assistant
 */
export function formatFocusResponse(focus: DailyFocus): {
  message: string;
  decision: string;
  reasoning: string;
  suggestions: string[];
} {
  if (focus.items.length === 0) {
    return {
      message: focus.summary,
      decision: 'Nessuna azione richiesta',
      reasoning: 'Non hai impegni urgenti per oggi.',
      suggestions: ['Aggiungi un task', 'Pianifica domani']
    };
  }

  const mainItem = focus.items[0];
  const otherItems = focus.items.slice(1);

  let message = focus.summary;
  
  // Add energy context
  if (focus.energyLevel === 'low') {
    message += ' Oggi vai piano con te stesso.';
  }

  const decision = mainItem.title;
  const reasoning = mainItem.reason;

  const suggestions = otherItems.map(i => i.title);
  if (suggestions.length < 2) {
    suggestions.push('Mostra calendario');
  }

  return {
    message,
    decision,
    reasoning,
    suggestions
  };
}
