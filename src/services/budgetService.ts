/**
 * Budget Service - centralized budget management using the budgets table
 *
 * Uses the budgets table with columns: user_id, month, year, amount
 * This is the single source of truth for monthly budgets.
 */

import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";

export interface MonthlyBudgetData {
  budget: number;
  totalSpent: number;
  remaining: number;
  percentage: number;
}

/**
 * Get the monthly budget for a user for a specific month/year
 * Returns 0 if no budget is set
 */
export async function getMonthlyBudget(
  userId: string,
  month: number,
  year: number
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("budgets")
      .select("amount")
      .eq("user_id", userId)
      .eq("month", month)
      .eq("year", year)
      .maybeSingle();

    if (error) {
      console.error("Error fetching monthly budget:", error);
      return 0;
    }

    return Number(data?.amount ?? 0);
  } catch (err) {
    console.error("Exception fetching monthly budget:", err);
    return 0;
  }
}

/**
 * Upsert (create or update) the monthly budget for a user
 */
export async function upsertMonthlyBudget(
  userId: string,
  month: number,
  year: number,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("budgets")
      .upsert(
        {
          user_id: userId,
          month,
          year,
          amount,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,month,year",
        }
      );

    if (error) {
      console.error("Error upserting monthly budget:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Exception upserting monthly budget:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Get total expenses for a user for a specific month/year
 */
export async function getMonthlyExpensesTotal(
  userId: string,
  month: number,
  year: number
): Promise<number> {
  try {
    // Create date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = endOfMonth(startDate);

    const startStr = format(startDate, "yyyy-MM-dd");
    const endStr = format(endDate, "yyyy-MM-dd");

    const { data, error } = await supabase
      .from("expenses")
      .select("amount")
      .eq("user_id", userId)
      .gte("date", startStr)
      .lte("date", endStr);

    if (error) {
      console.error("Error fetching monthly expenses:", error);
      return 0;
    }

    return (data ?? []).reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
  } catch (err) {
    console.error("Exception fetching monthly expenses:", err);
    return 0;
  }
}

/**
 * Get complete budget data for a user for a specific month/year
 * This includes budget, total spent, remaining, and percentage
 */
export async function getMonthlyBudgetData(
  userId: string,
  month: number,
  year: number
): Promise<MonthlyBudgetData> {
  const [budget, totalSpent] = await Promise.all([
    getMonthlyBudget(userId, month, year),
    getMonthlyExpensesTotal(userId, month, year),
  ]);

  const remaining = budget - totalSpent;
  const percentage = budget > 0 ? (totalSpent / budget) * 100 : 0;

  return { budget, totalSpent, remaining, percentage };
}

/**
 * Recalculate budget data for the current month
 * Used by the AI assistant to get updated budget info after recording expenses
 */
export async function recalculateBudgetForUser(userId: string): Promise<MonthlyBudgetData> {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-indexed
  const year = now.getFullYear();

  return getMonthlyBudgetData(userId, month, year);
}
