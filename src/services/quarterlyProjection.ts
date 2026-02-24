/**
 * Layer 5: Strategic Projection
 * Deterministic 3-month projection based on historical data.
 * NO LLM involved.
 */

import type { FinancialSignals } from "./financialSignals";
import type { FinancialProfile } from "./financialState";

export interface QuarterlyProjection {
  projectedMonth1: number;
  projectedMonth2: number;
  projectedMonth3: number;
  trend: "improving" | "stable" | "worsening";
  scenarioIfContinue: string;
  scenarioIfAdjust: string;
}

export function generateProjection(
  signals: FinancialSignals,
  profile: FinancialProfile
): QuarterlyProjection {
  const { dailyAvgSpent, budget, topCategory, categoryBreakdown } = signals;
  const { monthlySnapshots } = profile;

  // Monthly projected spending based on current daily average
  const monthlyProjected = dailyAvgSpent * 30;

  // Use historical snapshots for trend detection
  const recent = monthlySnapshots.slice(-3);
  let avgHistoricalSpend = monthlyProjected;
  if (recent.length >= 2) {
    avgHistoricalSpend = recent.reduce((s, r) => s + r.totalSpent, 0) / recent.length;
  }

  // Blend historical + current for projections
  const blended = recent.length >= 2
    ? (monthlyProjected * 0.6 + avgHistoricalSpend * 0.4)
    : monthlyProjected;

  const projectedMonth1 = budget - blended;
  const projectedMonth2 = budget - blended; // Assumes same behavior
  const projectedMonth3 = budget - blended;

  // Compute trend from snapshots
  let trend: "improving" | "stable" | "worsening" = "stable";
  if (recent.length >= 2) {
    const burnRates = recent.map((s) => s.burnRate);
    const first = burnRates[0];
    const last = burnRates[burnRates.length - 1];
    if (last < first - 0.05) trend = "improving";
    else if (last > first + 0.05) trend = "worsening";
  }

  // Scenarios
  const totalSavedIfContinue = projectedMonth1 + projectedMonth2 + projectedMonth3;
  let scenarioIfContinue: string;
  if (totalSavedIfContinue >= 0) {
    scenarioIfContinue = `Se mantieni questo ritmo, in 3 mesi risparmierai circa €${Math.round(totalSavedIfContinue)}.`;
  } else {
    scenarioIfContinue = `Se mantieni questo ritmo, in 3 mesi sarai in deficit di €${Math.round(Math.abs(totalSavedIfContinue))}.`;
  }

  // Calculate potential savings from reducing top category by 20%
  const topCatData = categoryBreakdown[topCategory];
  const topCatMonthly = topCatData ? topCatData.spent : 0;
  const potentialSaving = Math.round(topCatMonthly * 0.2);
  const scenarioIfAdjust = potentialSaving > 0
    ? `Riducendo ${topCategory} del 20%, risparmieresti circa €${potentialSaving}/mese.`
    : `Continua a monitorare le spese per individuare aree di risparmio.`;

  return {
    projectedMonth1,
    projectedMonth2,
    projectedMonth3,
    trend,
    scenarioIfContinue,
    scenarioIfAdjust,
  };
}
