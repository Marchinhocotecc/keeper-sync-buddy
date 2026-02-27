import { useState, useEffect, useCallback } from "react";
import { startOfWeek, format } from "date-fns";
import {
  generateWeeklySummary,
  getExistingWeeklySummary,
  type WeeklySummaryData,
} from "@/services/weeklySummaryService";

export function useWeeklySummary(userId: string | undefined) {
  const [summary, setSummary] = useState<WeeklySummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      
      // Check if already generated this week
      const existing = await getExistingWeeklySummary(userId, weekStart);
      if (existing) {
        setSummary(existing);
        return;
      }

      // Generate new
      const result = await generateWeeklySummary(userId);
      setSummary(result);
    } catch (err) {
      console.error("[useWeeklySummary] Error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { summary, isLoading, refresh };
}
