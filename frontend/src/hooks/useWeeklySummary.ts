import { useState, useEffect, useCallback } from "react";
import {
  generateWeeklySummary,
  type WeeklySummaryData,
} from "@/services/weeklySummaryService";

export function useWeeklySummary(userId: string | undefined) {
  const [summary, setSummary] = useState<WeeklySummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      // Always recompute fresh — the query is one Supabase call filtered by
      // date, so it's cheap. Caching in `weekly_summaries` was causing stale
      // totals when the user added a new expense mid-week.
      const result = await generateWeeklySummary(userId);
      setSummary(result);
    } catch (err) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error("[useWeeklySummary] Error:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { summary, isLoading, refresh };
}
