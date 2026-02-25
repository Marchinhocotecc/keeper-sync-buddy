/**
 * Layer 1: Data Intelligence
 * Pure deterministic function — NO AI, NO LLM.
 * Calculates financial signals from raw data.
 */

import { supabase } from "@/integrations/supabase/client";

export interface FinancialSignals {
  burnRate: number;
  projectedEndBalance: number;
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;
  timeProgress: number;
  topCategory: string;
  categoryBreakdown: Record<string, { spent: number; percentage: number }>;
  dailyAvgSpent: number;
  dailySafeLimit: number;
  impulseFlag: boolean;
  impulseCount: number;
  savingsGap: number;
  weeklyTrend: number[];
  totalSpent: number;
  budget: number;
  dailySpending: Record<string, number>;
}

export async function generateFinancialSignals(userId: string): Promise<FinancialSignals | null> {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysElapsed = Math.max(now.getDate(), 1);
    const daysRemaining = daysInMonth - daysElapsed;
    const timeProgress = daysElapsed / daysInMonth;

    const startOfMonth = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endOfMonth = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    // Fetch expenses and budget in parallel
    const [expensesRes, budgetRes] = await Promise.all([
      supabase
        .from("expenses")
        .select("amount, category, date")
        .eq("user_id", userId)
        .gte("date", startOfMonth)
        .lte("date", endOfMonth),
      supabase
        .from("budgets")
        .select("amount")
        .eq("user_id", userId)
        .eq("month", month + 1)
        .eq("year", year)
        .maybeSingle(),
    ]);

    const expenses = expensesRes.data || [];
    const budget = Number(budgetRes.data?.amount ?? 0);

    if (budget === 0 && expenses.length === 0) return null;

    // Total spent
    const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);

    // Burn rate
    const burnRate = budget > 0 ? totalSpent / budget : 0;

    // Daily average & projection
    const dailyAvgSpent = daysElapsed > 0 ? totalSpent / daysElapsed : 0;
    const projectedEndBalance = budget - (dailyAvgSpent * daysInMonth);
    const dailySafeLimit = daysRemaining > 0 ? Math.max(0, (budget - totalSpent) / daysRemaining) : 0;

    // Category breakdown
    const catMap: Record<string, number> = {};
    for (const e of expenses) {
      const cat = e.category || "other";
      catMap[cat] = (catMap[cat] || 0) + Number(e.amount);
    }
    const categoryBreakdown: Record<string, { spent: number; percentage: number }> = {};
    let topCategory = "other";
    let topAmount = 0;
    for (const [cat, spent] of Object.entries(catMap)) {
      categoryBreakdown[cat] = { spent, percentage: budget > 0 ? spent / budget : 0 };
      if (spent > topAmount) { topAmount = spent; topCategory = cat; }
    }

    // Savings gap (how much over budget pace)
    const expectedSpentByNow = budget * timeProgress;
    const savingsGap = totalSpent - expectedSpentByNow;

    // Weekly trend (expenses per week of current month)
    const weeklyTrend: number[] = [0, 0, 0, 0, 0];
    for (const e of expenses) {
      const day = new Date(e.date).getDate();
      const week = Math.min(Math.floor((day - 1) / 7), 4);
      weeklyTrend[week] += Number(e.amount);
    }

    // Impulse detection: days with spending > 2x daily average
    const dailySpending: Record<string, number> = {};
    for (const e of expenses) {
      dailySpending[e.date] = (dailySpending[e.date] || 0) + Number(e.amount);
    }
    let impulseCount = 0;
    const threshold = dailyAvgSpent * 2;
    for (const dayTotal of Object.values(dailySpending)) {
      if (dayTotal > threshold && threshold > 0) impulseCount++;
    }
    const impulseFlag = impulseCount >= 3;

    return {
      burnRate,
      projectedEndBalance,
      daysInMonth,
      daysElapsed,
      daysRemaining,
      timeProgress,
      topCategory,
      categoryBreakdown,
      dailyAvgSpent,
      dailySafeLimit,
      impulseFlag,
      impulseCount,
      savingsGap,
      weeklyTrend,
      totalSpent,
      budget,
      dailySpending,
    };
  } catch (err) {
    console.error("[FinancialSignals] Error:", err);
    return null;
  }
}
