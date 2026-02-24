/**
 * Layer 6: Financial Insights Orchestrator Hook
 * Calls L0-L5, manages trigger rules (max 1/day, anti-habituation).
 */

import { useState, useEffect, useCallback } from "react";
import { loadFinancialProfile, saveFinancialProfile, updateMonthlySnapshot, type FinancialProfile } from "@/services/financialState";
import { generateFinancialSignals, type FinancialSignals } from "@/services/financialSignals";
import { evaluateRisk, classifyBehavior, computeRiskTrend, type RiskResult } from "@/services/riskEngine";
import { generateProjection, type QuarterlyProjection } from "@/services/quarterlyProjection";
import { trackActionShown, calculateAcceptanceRate, getIgnoredSuggestions, countConsecutiveIgnored, type ActionEvent } from "@/services/actionTracker";
import { supabase } from "@/integrations/supabase/client";

interface FinancialAction {
  type: "create_task" | "adjust_budget" | "set_limit";
  title: string;
  reason: string;
  priority: "low" | "medium" | "high";
}

export interface FinancialInsight {
  summary: string;
  riskLevel: "safe" | "warning" | "critical";
  insights: string[];
  actions: FinancialAction[];
  quarterlyProjection?: string;
  signals: FinancialSignals;
  projection: QuarterlyProjection;
}

export function useFinancialInsights(userId: string | undefined) {
  const [insight, setInsight] = useState<FinancialInsight | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);

    try {
      // Layer 0: Load persistent state
      let profile = await loadFinancialProfile(userId);

      // Layer 1: Generate signals
      const signals = await generateFinancialSignals(userId);
      if (!signals) {
        setInsight(null);
        setIsLoading(false);
        return;
      }

      // Update monthly snapshot
      const now = new Date();
      profile = await updateMonthlySnapshot(
        userId, profile, now.getMonth() + 1, now.getFullYear(),
        signals.totalSpent, signals.budget
      );

      // Layer 2: Risk evaluation
      const risk = evaluateRisk(signals, profile);

      // Layer 2.5: Behavioral classification
      const newBehavioralType = classifyBehavior(signals, profile);
      const newRiskTrend = computeRiskTrend(risk.riskLevel, profile.lastRiskLevel);

      // Get action history for feedback metrics
      const payload = await getPayload(userId);
      const history = (payload.actionHistory as ActionEvent[]) || [];
      const acceptanceRate = calculateAcceptanceRate(history);
      const ignoredConsecutive = countConsecutiveIgnored(history);
      const ignoredSuggestions = getIgnoredSuggestions(history);

      // Update profile
      profile = {
        ...profile,
        rollingBurnRate7d: signals.burnRate,
        behavioralType: newBehavioralType,
        lastRiskLevel: risk.riskLevel,
        riskTrend: newRiskTrend,
        suggestionAcceptanceRate: acceptanceRate,
        ignoredConsecutive,
      };

      // Check if we should show insight
      if (!risk.shouldShowInsight) {
        await saveFinancialProfile(userId, profile);
        setInsight(null);
        setIsLoading(false);
        return;
      }

      // Layer 5: Projection
      const projection = generateProjection(signals, profile);

      // Layer 3: AI interpretation via edge function
      let advice;
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;

        const resp = await supabase.functions.invoke("ai-free-chat", {
          body: {
            userMessage: "__FINANCIAL_ADVICE__",
            financialContext: {
              signals: {
                burnRate: signals.burnRate,
                projectedEndBalance: signals.projectedEndBalance,
                dailyAvgSpent: signals.dailyAvgSpent,
                dailySafeLimit: signals.dailySafeLimit,
                topCategory: signals.topCategory,
                categoryBreakdown: signals.categoryBreakdown,
                savingsGap: signals.savingsGap,
                totalSpent: signals.totalSpent,
                budget: signals.budget,
                daysRemaining: signals.daysRemaining,
                timeProgress: signals.timeProgress,
                impulseCount: signals.impulseCount,
              },
              risk: { riskLevel: risk.riskLevel, flags: risk.flags },
              profile: {
                behavioralType: profile.behavioralType,
                riskTrend: profile.riskTrend,
                suggestionAcceptanceRate: profile.suggestionAcceptanceRate,
                consistencyScore: profile.consistencyScore,
              },
              projection: {
                scenarioIfContinue: projection.scenarioIfContinue,
                scenarioIfAdjust: projection.scenarioIfAdjust,
                trend: projection.trend,
              },
              ignoredSuggestions,
            },
          },
        });

        if (resp.data?.financialAdvice) {
          advice = resp.data.financialAdvice;
        }
      } catch (err) {
        console.error("[useFinancialInsights] Edge function error:", err);
      }

      // Fallback if no AI advice
      if (!advice) {
        advice = {
          summary: risk.riskLevel === "critical"
            ? `Attenzione: hai speso €${Math.round(signals.totalSpent)} su €${Math.round(signals.budget)}. ${projection.scenarioIfContinue}`
            : risk.riskLevel === "warning"
              ? `Stai usando il ${Math.round(signals.burnRate * 100)}% del budget. Limite giornaliero: €${Math.round(signals.dailySafeLimit)}.`
              : `Situazione sotto controllo. Hai €${Math.round(signals.budget - signals.totalSpent)} disponibili.`,
          riskLevel: risk.riskLevel,
          insights: [projection.scenarioIfContinue, projection.scenarioIfAdjust].filter(Boolean),
          actions: risk.riskLevel !== "safe" ? [{
            type: "create_task" as const,
            title: `Rivedi spese ${signals.topCategory}`,
            reason: `Categoria con più spesa`,
            priority: risk.riskLevel === "critical" ? "high" as const : "medium" as const,
          }] : [],
          quarterlyProjection: projection.scenarioIfContinue,
        };
      }

      // Track actions shown (Layer 4)
      for (const action of advice.actions || []) {
        await trackActionShown(userId, { type: action.type, title: action.title });
      }

      // Update lastInsightShownAt
      profile.lastInsightShownAt = new Date().toISOString();
      await saveFinancialProfile(userId, profile);

      setInsight({
        summary: advice.summary,
        riskLevel: advice.riskLevel,
        insights: advice.insights || [],
        actions: advice.actions || [],
        quarterlyProjection: advice.quarterlyProjection,
        signals,
        projection,
      });
    } catch (err) {
      console.error("[useFinancialInsights] Error:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { insight, isLoading, error, refresh };
}

// Helper to get raw payload
async function getPayload(userId: string): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from("assistant_state")
    .select("intent_payload")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.intent_payload as Record<string, unknown>) || {};
}
