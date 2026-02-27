/**
 * Home Insight Priority Orchestrator
 * 
 * Hierarchy:
 * 1. Critical risk → always visible
 * 2. Monthly summary → first access of the month
 * 3. Weekly summary → first access of the week
 * 4. Soft warnings → only if no other insight active
 * 
 * Max 2 insights shown simultaneously.
 */

import { useMemo } from "react";
import { useFinancialInsights, type FinancialInsight } from "@/hooks/useFinancialInsights";
import { useWeeklySummary } from "@/hooks/useWeeklySummary";
import { useMonthlySummary } from "@/hooks/useMonthlySummary";
import type { WeeklySummaryData } from "@/services/weeklySummaryService";
import type { MonthlySummaryData } from "@/services/monthlySummaryService";

export type InsightType = "critical_risk" | "monthly_summary" | "weekly_summary" | "soft_warning";

export interface HomeInsight {
  type: InsightType;
  priority: number; // lower = higher priority
  financialInsight?: FinancialInsight;
  weeklySummary?: WeeklySummaryData;
  monthlySummary?: MonthlySummaryData;
}

export function useHomeInsights(userId: string | undefined) {
  const { insight: financialInsight, isLoading: financialLoading, refresh: refreshFinancial } = useFinancialInsights(userId);
  const { summary: weeklySummary, isLoading: weeklyLoading, refresh: refreshWeekly } = useWeeklySummary(userId);
  const { summary: monthlySummary, isLoading: monthlyLoading, refresh: refreshMonthly } = useMonthlySummary(userId);

  const insights = useMemo(() => {
    const all: HomeInsight[] = [];

    // 1. Critical risk — always
    if (financialInsight && financialInsight.riskLevel === "critical") {
      all.push({
        type: "critical_risk",
        priority: 0,
        financialInsight,
      });
    }

    // 2. Monthly summary — first access of month
    if (monthlySummary) {
      all.push({
        type: "monthly_summary",
        priority: 1,
        monthlySummary,
      });
    }

    // 3. Weekly summary — first access of week
    if (weeklySummary) {
      all.push({
        type: "weekly_summary",
        priority: 2,
        weeklySummary,
      });
    }

    // 4. Soft warning (non-critical financial insight)
    if (financialInsight && financialInsight.riskLevel === "warning") {
      // Only show if no critical risk already present
      if (!all.some((i) => i.type === "critical_risk")) {
        all.push({
          type: "soft_warning",
          priority: 3,
          financialInsight,
        });
      }
    }

    // Sort by priority and take max 2
    all.sort((a, b) => a.priority - b.priority);
    return all.slice(0, 2);
  }, [financialInsight, weeklySummary, monthlySummary]);

  const isLoading = financialLoading || weeklyLoading || monthlyLoading;

  const refreshAll = () => {
    refreshFinancial();
    refreshWeekly();
    refreshMonthly();
  };

  return { insights, isLoading, refreshAll, financialInsight, weeklySummary, monthlySummary };
}
