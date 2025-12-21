/**
 * Budget Service - deterministic budget calculations
 *
 * Mirrors the UI logic used in ExpensesPage:
 * - budget comes from settings.monthly_budget (fallback 0)
 * - totalSpent is sum of expenses for current month
 */

import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth } from "date-fns";

export interface BudgetRecalculationResult {
  budget: number;
  totalSpent: number;
  remaining: number;
  percentage: number;
}

export async function recalculateBudgetForUser(userId: string): Promise<BudgetRecalculationResult> {
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

  const [settingsRes, expensesRes] = await Promise.all([
    supabase
      .from("settings")
      .select("monthly_budget")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("expenses")
      .select("amount")
      .eq("user_id", userId)
      .gte("date", monthStart),
  ]);

  const budget = Number(settingsRes.data?.monthly_budget ?? 0);
  const totalSpent = (expensesRes.data ?? []).reduce((sum, e: any) => sum + Number(e.amount ?? 0), 0);

  const remaining = budget - totalSpent;
  const percentage = budget > 0 ? (totalSpent / budget) * 100 : 0;

  return { budget, totalSpent, remaining, percentage };
}
