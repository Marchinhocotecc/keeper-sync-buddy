/**
 * Layer 0: Persistent Financial State
 * Loads/saves financialProfile from assistant_state.intent_payload
 */

import { supabase } from "@/integrations/supabase/client";

export interface MonthlySnapshot {
  month: number;
  year: number;
  totalSpent: number;
  budget: number;
  burnRate: number;
}

export interface FinancialProfile {
  rollingBurnRate7d: number;
  volatilityScore: number;
  consistencyScore: number;
  behavioralType: "cautious" | "balanced" | "impulsive" | "growth_oriented";
  lastRiskLevel: "safe" | "warning" | "critical";
  riskTrend: "improving" | "stable" | "worsening";
  suggestionAcceptanceRate: number;
  lastInsightShownAt: string | null;
  ignoredConsecutive: number;
  monthlySnapshots: MonthlySnapshot[];
}

export const DEFAULT_PROFILE: FinancialProfile = {
  rollingBurnRate7d: 0,
  volatilityScore: 0,
  consistencyScore: 0.5,
  behavioralType: "balanced",
  lastRiskLevel: "safe",
  riskTrend: "stable",
  suggestionAcceptanceRate: 0.5,
  lastInsightShownAt: null,
  ignoredConsecutive: 0,
  monthlySnapshots: [],
};

export async function loadFinancialProfile(userId: string): Promise<FinancialProfile> {
  try {
    const { data } = await supabase
      .from("assistant_state")
      .select("intent_payload")
      .eq("user_id", userId)
      .maybeSingle();

    const payload = data?.intent_payload as Record<string, unknown> | null;
    if (payload?.financialProfile) {
      return { ...DEFAULT_PROFILE, ...(payload.financialProfile as Partial<FinancialProfile>) };
    }
    return { ...DEFAULT_PROFILE };
  } catch (err) {
    console.error("[FinancialState] Load error:", err);
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveFinancialProfile(userId: string, profile: FinancialProfile): Promise<void> {
  try {
    // Read current payload, merge financialProfile
    const { data } = await supabase
      .from("assistant_state")
      .select("intent_payload")
      .eq("user_id", userId)
      .maybeSingle();

    const currentPayload = (data?.intent_payload as Record<string, unknown>) || {};

    await supabase
      .from("assistant_state")
      .update({
        intent_payload: { ...currentPayload, financialProfile: profile } as any,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  } catch (err) {
    console.error("[FinancialState] Save error:", err);
  }
}

export async function updateMonthlySnapshot(
  userId: string,
  profile: FinancialProfile,
  month: number,
  year: number,
  totalSpent: number,
  budget: number
): Promise<FinancialProfile> {
  const burnRate = budget > 0 ? totalSpent / budget : 0;
  const snapshot: MonthlySnapshot = { month, year, totalSpent, budget, burnRate };

  // Keep last 6 months max, replace if same month exists
  const filtered = profile.monthlySnapshots.filter(
    (s) => !(s.month === month && s.year === year)
  );
  filtered.push(snapshot);
  // Sort and keep last 6
  filtered.sort((a, b) => (a.year - b.year) * 12 + (a.month - b.month));
  const snapshots = filtered.slice(-6);

  const updated = { ...profile, monthlySnapshots: snapshots };
  await saveFinancialProfile(userId, updated);
  return updated;
}
