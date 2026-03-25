/**
 * Daily Nudge — single contextual sentence shown once per day.
 * Reads financialSignals + risk level + spending patterns + wellness data.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFinancialInsights } from "@/hooks/useFinancialInsights";
import { detectDayPatterns, type DayPattern } from "@/services/spendingPatterns";
import { useWellness } from "@/hooks/useWellness";
import { AlertCircle, TrendingDown, Shield } from "lucide-react";

interface DailyNudgeProps {
  userId: string;
}

export function DailyNudge({ userId }: DailyNudgeProps) {
  const { t } = useTranslation();
  const { insight } = useFinancialInsights(userId);
  const { wellnessData } = useWellness(userId);
  const [dismissed, setDismissed] = useState(false);
  const [dayPattern, setDayPattern] = useState<DayPattern | null>(null);

  const todayKey = `ayvro_nudge_${new Date().toISOString().split("T")[0]}`;

  useEffect(() => {
    if (localStorage.getItem(todayKey) === "dismissed") {
      setDismissed(true);
    }
  }, [todayKey]);

  useEffect(() => {
    if (userId) {
      detectDayPatterns(userId).then(setDayPattern);
    }
  }, [userId]);

  if (dismissed || !insight?.signals) return null;

  const { dailySafeLimit } = insight.signals;
  const risk = insight.riskLevel;

  const handleDismiss = () => {
    localStorage.setItem(todayKey, "dismissed");
    setDismissed(true);
  };

  let nudgeText = "";
  let Icon = Shield;

  if (risk === "critical") {
    nudgeText = t('nudge.avoidSpending');
    Icon = AlertCircle;
  } else if (risk === "warning") {
    nudgeText = t('nudge.stayUnder', { amount: Math.round(dailySafeLimit) });
    Icon = TrendingDown;
  } else {
    nudgeText = t('nudge.canSpend', { amount: Math.round(dailySafeLimit) });
    Icon = Shield;
  }

  // Append peak day warning
  const today = new Date().getDay();
  if (dayPattern && dayPattern.peakDay === today) {
    nudgeText += ` ${t('nudge.peakDay', { day: dayPattern.peakDayName })}`;
  }

  // Wellness integration: low sleep warning
  const yesterdayData = wellnessData?.[1];
  if (yesterdayData?.sleep && yesterdayData.sleep < 6) {
    nudgeText += ` ${t('nudge.lowSleep')}`;
  }

  const colorClasses = {
    critical: "bg-destructive/10 text-destructive border-destructive/20",
    warning: "bg-warning/10 text-warning-foreground border-warning/20",
    safe: "bg-primary/5 text-foreground border-primary/10",
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm animate-fade-in cursor-pointer ${colorClasses[risk]}`}
      onClick={handleDismiss}
      role="button"
      tabIndex={0}
      aria-label={t('nudge.closeNudge')}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{nudgeText}</span>
      <span className="text-xs opacity-50">✕</span>
    </div>
  );
}
