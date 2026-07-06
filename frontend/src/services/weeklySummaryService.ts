/**
 * Weekly Summary Engine — Deterministic
 * Compares current week spending vs previous week.
 * Persists to weekly_summaries table.
 */

import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfWeek } from "date-fns";

export interface WeeklySummaryData {
  totalSpent: number;
  previousWeekSpent: number;
  variance: number; // percentage change
  dominantCategory: string;
  criticalDays: Array<{ date: string; amount: number }>;
  strategicAction: string;
  weekStart: string;
  weekEnd: string;
}

export async function generateWeeklySummary(userId: string): Promise<WeeklySummaryData | null> {
  try {
    const now = new Date();
    // Current week: Monday → TODAY (inclusive). We do NOT include future days
    // because they can't have expenses yet and would leak inconsistent totals
    // when the user has data-entry glitches.
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = now;
    const prevWeekStart = subDays(weekStart, 7);
    const prevWeekEnd = subDays(weekStart, 1);

    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const weekEndStr = format(weekEnd, "yyyy-MM-dd");
    const prevStartStr = format(prevWeekStart, "yyyy-MM-dd");
    const prevEndStr = format(prevWeekEnd, "yyyy-MM-dd");

    // Fetch current + previous week expenses in parallel. Both queries filter
    // strictly by date to keep the totals in sync with what the user actually
    // spent this week vs last week.
    const [currentRes, prevRes] = await Promise.all([
      supabase
        .from("expenses")
        .select("amount, category, date")
        .eq("user_id", userId)
        .gte("date", weekStartStr)
        .lte("date", weekEndStr),
      supabase
        .from("expenses")
        .select("amount, date")
        .eq("user_id", userId)
        .gte("date", prevStartStr)
        .lte("date", prevEndStr),
    ]);

    const currentExpenses = currentRes.data || [];
    const prevExpenses = prevRes.data || [];

    if (currentExpenses.length === 0 && prevExpenses.length === 0) return null;

    const totalSpent = currentExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const previousWeekSpent = prevExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const variance = previousWeekSpent > 0
      ? ((totalSpent - previousWeekSpent) / previousWeekSpent) * 100
      : 0;

    // Dominant category
    const catMap: Record<string, number> = {};
    for (const e of currentExpenses) {
      const cat = e.category || "altro";
      catMap[cat] = (catMap[cat] || 0) + Number(e.amount);
    }
    let dominantCategory = "altro";
    let maxCatAmount = 0;
    for (const [cat, amount] of Object.entries(catMap)) {
      if (amount > maxCatAmount) {
        maxCatAmount = amount;
        dominantCategory = cat;
      }
    }

    // Critical days (top 2 by spending)
    const dailyMap: Record<string, number> = {};
    for (const e of currentExpenses) {
      dailyMap[e.date] = (dailyMap[e.date] || 0) + Number(e.amount);
    }
    const criticalDays = Object.entries(dailyMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([date, amount]) => ({ date, amount }));

    // Strategic action — concrete and specific
    let strategicAction: string;
    if (variance > 20 && maxCatAmount > 0) {
      const reduction = Math.round(maxCatAmount * 0.15);
      strategicAction = `Riduci "${dominantCategory}" di €${reduction} la prossima settimana`;
    } else if (variance > 0) {
      strategicAction = `Mantieni il ritmo: la spesa è in linea con la settimana precedente`;
    } else if (variance < -10) {
      strategicAction = `Ottimo trend! Hai risparmiato ${Math.abs(Math.round(variance))}% rispetto alla settimana scorsa`;
    } else {
      strategicAction = `Spesa stabile. Concentrati sulla categoria "${dominantCategory}" per ottimizzare`;
    }

    const summary: WeeklySummaryData = {
      totalSpent,
      previousWeekSpent,
      variance,
      dominantCategory,
      criticalDays,
      strategicAction,
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
    };

    // Persist to weekly_summaries (upsert)
    await supabase
      .from("weekly_summaries" as any)
      .upsert(
        {
          user_id: userId,
          week_start: weekStartStr,
          week_end: weekEndStr,
          summary_json: summary as any,
        },
        { onConflict: "user_id,week_start" }
      );

    return summary;
  } catch (err) {
    console.error("[WeeklySummary] Error:", err);
    return null;
  }
}

export async function getExistingWeeklySummary(
  userId: string,
  weekStart: string
): Promise<WeeklySummaryData | null> {
  try {
    const { data } = await (supabase
      .from("weekly_summaries" as any)
      .select("summary_json")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .maybeSingle() as any);

    if (data?.summary_json) {
      return data.summary_json as WeeklySummaryData;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getLatestWeeklySummary(
  userId: string
): Promise<WeeklySummaryData | null> {
  try {
    const { data } = await (supabase
      .from("weekly_summaries" as any)
      .select("summary_json")
      .eq("user_id", userId)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle() as any);

    if (data?.summary_json) {
      return data.summary_json as WeeklySummaryData;
    }
    return null;
  } catch {
    return null;
  }
}
