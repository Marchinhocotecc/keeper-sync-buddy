/**
 * Layer 2: Adaptive Risk Engine
 * Deterministic risk evaluation with profile-adaptive thresholds.
 * Also includes behavioral classification (Layer 2.5).
 */

import type { FinancialSignals } from "./financialSignals";
import type { FinancialProfile } from "./financialState";

export interface RiskResult {
  riskLevel: "safe" | "warning" | "critical";
  flags: string[];
  confidence: number;
  shouldShowInsight: boolean;
}

export function evaluateRisk(
  signals: FinancialSignals,
  profile: FinancialProfile
): RiskResult {
  const flags: string[] = [];
  let riskLevel: "safe" | "warning" | "critical" = "safe";

  const { behavioralType, riskTrend, lastInsightShownAt, ignoredConsecutive } = profile;
  const { burnRate, timeProgress, projectedEndBalance, impulseFlag, impulseCount, budget } = signals;

  // Adaptive thresholds based on behavioral type
  let warnThreshold: number;
  let critThreshold: number;
  let skipWarnUnlessWorsening = false;

  switch (behavioralType) {
    case "cautious":
      warnThreshold = 0.70;
      critThreshold = 0.85;
      break;
    case "balanced":
      warnThreshold = 0.75;
      critThreshold = 0.90;
      break;
    case "impulsive":
      warnThreshold = 0.80;
      critThreshold = 0.95;
      skipWarnUnlessWorsening = true;
      break;
    case "growth_oriented":
      warnThreshold = 0.85;
      critThreshold = 0.95;
      break;
    default:
      warnThreshold = 0.75;
      critThreshold = 0.90;
  }

  // Evaluate burn rate vs time progress
  if (burnRate > critThreshold && timeProgress < 0.85) {
    riskLevel = "critical";
    flags.push("over_budget_critical");
  } else if (burnRate > warnThreshold && timeProgress < 0.60) {
    if (!skipWarnUnlessWorsening || riskTrend === "worsening") {
      riskLevel = "warning";
      flags.push("over_budget_pace");
    }
  }

  // Projection negative
  if (projectedEndBalance < 0 && budget > 0) {
    if (riskLevel !== "critical") riskLevel = "critical";
    flags.push("negative_projection");
  } else if (projectedEndBalance < 0 && budget === 0) {
    // No budget set — can't evaluate
  }

  // Impulsive spending for non-impulsive profiles
  if (behavioralType === "impulsive") {
    if (projectedEndBalance < -(budget * 0.1) && budget > 0) {
      riskLevel = "critical";
      flags.push("impulsive_critical_overshoot");
    }
  } else if (impulseFlag) {
    if (riskLevel === "safe") riskLevel = "warning";
    flags.push("impulse_spending");
  }

  if (impulseCount >= 5) {
    flags.push("high_impulse_frequency");
  }

  // Confidence based on data availability
  const confidence = Math.min(1, signals.daysElapsed / 10);

  // Should show insight logic
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  let shouldShowInsight = false;

  // First of month — always show
  if (now.getDate() === 1) {
    shouldShowInsight = true;
  }
  // Already shown today? Skip
  else if (lastInsightShownAt && lastInsightShownAt.startsWith(today)) {
    shouldShowInsight = false;
  }
  // Anti-habituation: pause after 3 ignored consecutive
  else if (ignoredConsecutive >= 3) {
    // Allow after 3 days of pause
    if (lastInsightShownAt) {
      const lastShown = new Date(lastInsightShownAt);
      const daysSince = Math.floor((now.getTime() - lastShown.getTime()) / (1000 * 60 * 60 * 24));
      shouldShowInsight = daysSince >= 3;
    } else {
      shouldShowInsight = true;
    }
  }
  // Show if warning/critical
  else if (riskLevel !== "safe") {
    shouldShowInsight = true;
  }
  // Show if worsening trend
  else if (riskTrend === "worsening") {
    shouldShowInsight = true;
  }

  return { riskLevel, flags, confidence, shouldShowInsight };
}

/**
 * Layer 2.5: Behavioral Classification
 * Deterministic algorithm to classify user financial behavior.
 */
export function classifyBehavior(
  signals: FinancialSignals,
  profile: FinancialProfile
): "cautious" | "balanced" | "impulsive" | "growth_oriented" {
  const { impulseCount, burnRate } = signals;
  const { consistencyScore, suggestionAcceptanceRate, monthlySnapshots } = profile;

  // Check if trend is improving over snapshots
  const recentSnapshots = monthlySnapshots.slice(-3);
  let trendImproving = false;
  if (recentSnapshots.length >= 2) {
    const burnRates = recentSnapshots.map((s) => s.burnRate);
    trendImproving = burnRates[burnRates.length - 1] < burnRates[0];
  }

  // High consistency + low impulse = cautious
  if (consistencyScore > 0.8 && impulseCount <= 1 && burnRate < 0.7) {
    return "cautious";
  }

  // Improving trend + accepts suggestions = growth_oriented
  if (trendImproving && suggestionAcceptanceRate > 0.6 && consistencyScore > 0.5) {
    return "growth_oriented";
  }

  // High impulse or low consistency = impulsive
  if (impulseCount >= 4 || consistencyScore < 0.3) {
    return "impulsive";
  }

  return "balanced";
}

/**
 * Determine risk trend based on comparing current vs last risk level
 */
export function computeRiskTrend(
  currentRisk: "safe" | "warning" | "critical",
  lastRisk: "safe" | "warning" | "critical"
): "improving" | "stable" | "worsening" {
  const levels = { safe: 0, warning: 1, critical: 2 };
  const diff = levels[currentRisk] - levels[lastRisk];
  if (diff > 0) return "worsening";
  if (diff < 0) return "improving";
  return "stable";
}
