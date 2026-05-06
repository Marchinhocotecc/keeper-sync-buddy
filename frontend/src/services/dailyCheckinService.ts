/**
 * Daily Check-in Service — Blocco B point #3
 * Persists evening check-in answers and computes streak from check-ins.
 */

import { supabase } from '@/integrations/supabase/client';

export interface DailyCheckin {
  id: string;
  user_id: string;
  date: string;
  expenses_logged: boolean;
  tasks_done: boolean;
  mood_ok: boolean;
  created_at?: string;
}

function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getTodayCheckin(userId: string): Promise<DailyCheckin | null> {
  const today = localDateKey();
  const { data, error } = await supabase
    .from('daily_checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();
  if (error) return null;
  return (data as DailyCheckin) || null;
}

export async function upsertCheckin(
  userId: string,
  payload: { expenses_logged: boolean; tasks_done: boolean; mood_ok: boolean }
): Promise<DailyCheckin | null> {
  const today = localDateKey();
  const { data, error } = await supabase
    .from('daily_checkins')
    .upsert(
      { user_id: userId, date: today, ...payload },
      { onConflict: 'user_id,date' }
    )
    .select()
    .single();
  if (error) {
    if (import.meta.env.DEV) console.error('[checkin] upsert', error);
    return null;
  }
  return data as DailyCheckin;
}

/** Returns the set of YYYY-MM-DD strings on which the user has a check-in (last `days` days). */
export async function getRecentCheckinDates(userId: string, days = 60): Promise<Set<string>> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = localDateKey(since);
  const { data, error } = await supabase
    .from('daily_checkins')
    .select('date')
    .eq('user_id', userId)
    .gte('date', sinceStr);
  if (error || !data) return new Set();
  return new Set(data.map((r: any) => r.date));
}

/**
 * Streak = consecutive days (counting backward from today) on which the user has
 * EITHER completed a task OR submitted a check-in.
 */
export function computeStreak(
  taskCompletionDates: Set<string>,
  checkinDates: Set<string>,
  hasActivityToday: boolean,
  maxDays = 365
): number {
  const today = new Date();
  let count = 0;
  for (let i = 0; i < maxDays; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    if (i === 0 && hasActivityToday) {
      count++;
      continue;
    }
    if (taskCompletionDates.has(key) || checkinDates.has(key)) {
      count++;
    } else if (i > 0) {
      break;
    }
  }
  return count;
}
