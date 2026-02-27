/**
 * Spending Pattern Detection
 * Analyzes recurring day-of-week patterns from expense data.
 */

import { supabase } from "@/integrations/supabase/client";

export interface DayPattern {
  peakDay: number;        // 0=Sun, 1=Mon, ...
  peakDayName: string;
  avgPeakSpending: number;
  globalAvg: number;
}

const DAY_NAMES_IT = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

export async function detectDayPatterns(userId: string): Promise<DayPattern | null> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: expenses } = await supabase
      .from("expenses")
      .select("amount, date")
      .eq("user_id", userId)
      .gte("date", thirtyDaysAgo.toISOString().split("T")[0]);

    if (!expenses || expenses.length < 7) return null;

    // Group by day of week
    const dayTotals: number[][] = [[], [], [], [], [], [], []];
    const dateMap: Record<string, number> = {};

    for (const e of expenses) {
      dateMap[e.date] = (dateMap[e.date] || 0) + Number(e.amount);
    }

    for (const [dateStr, total] of Object.entries(dateMap)) {
      const day = new Date(dateStr).getDay();
      dayTotals[day].push(total);
    }

    // Calculate averages
    const dayAvgs = dayTotals.map((totals) =>
      totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0
    );
    const allDayAvgs = dayAvgs.filter((a) => a > 0);
    if (allDayAvgs.length < 3) return null;

    const globalAvg = allDayAvgs.reduce((a, b) => a + b, 0) / allDayAvgs.length;

    // Find peak day (must be > 1.5x global avg)
    let peakDay = -1;
    let peakAvg = 0;
    for (let i = 0; i < 7; i++) {
      if (dayAvgs[i] > globalAvg * 1.5 && dayAvgs[i] > peakAvg) {
        peakDay = i;
        peakAvg = dayAvgs[i];
      }
    }

    if (peakDay === -1) return null;

    return {
      peakDay,
      peakDayName: DAY_NAMES_IT[peakDay],
      avgPeakSpending: Math.round(peakAvg),
      globalAvg: Math.round(globalAvg),
    };
  } catch (err) {
    console.error("[SpendingPatterns] Error:", err);
    return null;
  }
}
