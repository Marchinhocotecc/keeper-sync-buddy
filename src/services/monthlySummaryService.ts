/**
 * Monthly Summary Engine — Deterministic
 * Evaluates budget adherence, peak spending, and month-over-month variance.
 * Persists to monthly_summaries table.
 */

import { supabase } from "@/integrations/supabase/client";

export interface MonthlySummaryData {
  month: number;
  year: number;
  totalSpent: number;
  budget: number;
  budgetRespected: boolean;
  peakDay: { date: string; amount: number } | null;
  previousMonthSpent: number;
  varianceVsPrevMonth: number; // percentage
  strategicAction: string;
}

export async function generateMonthlySummary(
  userId: string,
  month: number,
  year: number
): Promise<MonthlySummaryData | null> {
  try {
    const daysInMonth = new Date(year, month, 0).getDate();
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    // Previous month
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevDays = new Date(prevYear, prevMonth, 0).getDate();
    const prevStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
    const prevEnd = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(prevDays).padStart(2, "0")}`;

    const [expensesRes, prevExpensesRes, budgetRes] = await Promise.all([
      supabase
        .from("expenses")
        .select("amount, category, date")
        .eq("user_id", userId)
        .gte("date", startDate)
        .lte("date", endDate),
      supabase
        .from("expenses")
        .select("amount")
        .eq("user_id", userId)
        .gte("date", prevStart)
        .lte("date", prevEnd),
      supabase
        .from("budgets")
        .select("amount")
        .eq("user_id", userId)
        .eq("month", month)
        .eq("year", year)
        .maybeSingle(),
    ]);

    const expenses = expensesRes.data || [];
    const prevExpenses = prevExpensesRes.data || [];
    const budget = Number(budgetRes.data?.amount ?? 0);

    if (expenses.length === 0 && budget === 0) return null;

    const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const previousMonthSpent = prevExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const budgetRespected = budget > 0 ? totalSpent <= budget : true;
    const varianceVsPrevMonth = previousMonthSpent > 0
      ? ((totalSpent - previousMonthSpent) / previousMonthSpent) * 100
      : 0;

    // Peak day
    const dailyMap: Record<string, number> = {};
    const catMap: Record<string, number> = {};
    for (const e of expenses) {
      dailyMap[e.date] = (dailyMap[e.date] || 0) + Number(e.amount);
      const cat = e.category || "altro";
      catMap[cat] = (catMap[cat] || 0) + Number(e.amount);
    }

    let peakDay: { date: string; amount: number } | null = null;
    let peakAmount = 0;
    for (const [date, amount] of Object.entries(dailyMap)) {
      if (amount > peakAmount) {
        peakAmount = amount;
        peakDay = { date, amount };
      }
    }

    // Top category for strategic action
    let topCat = "altro";
    let topCatAmount = 0;
    for (const [cat, amount] of Object.entries(catMap)) {
      if (amount > topCatAmount) {
        topCatAmount = amount;
        topCat = cat;
      }
    }

    // Strategic action — concrete
    let strategicAction: string;
    if (!budgetRespected && budget > 0) {
      const overBy = Math.round(totalSpent - budget);
      const reductionPct = Math.min(30, Math.round((overBy / topCatAmount) * 100));
      strategicAction = `Riduci "${topCat}" del ${reductionPct}% il prossimo mese (-€${Math.round(topCatAmount * reductionPct / 100)})`;
    } else if (varianceVsPrevMonth > 15) {
      strategicAction = `Spesa in aumento del ${Math.round(varianceVsPrevMonth)}%. Rivedi "${topCat}" per contenere la crescita`;
    } else if (budgetRespected && budget > 0) {
      const saved = Math.round(budget - totalSpent);
      strategicAction = `Budget rispettato! €${saved} risparmiati. Mantieni questa disciplina`;
    } else {
      strategicAction = `Imposta un budget mensile per monitorare meglio le spese`;
    }

    const summary: MonthlySummaryData = {
      month,
      year,
      totalSpent,
      budget,
      budgetRespected,
      peakDay,
      previousMonthSpent,
      varianceVsPrevMonth,
      strategicAction,
    };

    // Persist (upsert)
    await supabase
      .from("monthly_summaries" as any)
      .upsert(
        {
          user_id: userId,
          month,
          year,
          summary_json: summary as any,
        },
        { onConflict: "user_id,month,year" }
      );

    return summary;
  } catch (err) {
    console.error("[MonthlySummary] Error:", err);
    return null;
  }
}

export async function getExistingMonthlySummary(
  userId: string,
  month: number,
  year: number
): Promise<MonthlySummaryData | null> {
  try {
    const { data } = await (supabase
      .from("monthly_summaries" as any)
      .select("summary_json")
      .eq("user_id", userId)
      .eq("month", month)
      .eq("year", year)
      .maybeSingle() as any);

    if (data?.summary_json) {
      return data.summary_json as MonthlySummaryData;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getLatestMonthlySummary(
  userId: string
): Promise<MonthlySummaryData | null> {
  try {
    const { data } = await (supabase
      .from("monthly_summaries" as any)
      .select("summary_json")
      .eq("user_id", userId)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle() as any);

    if (data?.summary_json) {
      return data.summary_json as MonthlySummaryData;
    }
    return null;
  } catch {
    return null;
  }
}
