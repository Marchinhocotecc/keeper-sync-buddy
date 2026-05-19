import { useState, useEffect, useCallback } from "react";
import {
  generateMonthlySummary,
  getExistingMonthlySummary,
  type MonthlySummaryData,
} from "@/services/monthlySummaryService";

export function useMonthlySummary(userId: string | undefined) {
  const [summary, setSummary] = useState<MonthlySummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      // Check previous month (completed month)
      const now = new Date();
      const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // getMonth is 0-indexed
      const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

      // Check if already generated
      const existing = await getExistingMonthlySummary(userId, prevMonth, prevYear);
      if (existing) {
        setSummary(existing);
        return;
      }

      // Generate for previous completed month
      const result = await generateMonthlySummary(userId, prevMonth, prevYear);
      setSummary(result);
    } catch (err) {
      console.error("[useMonthlySummary] Error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { summary, isLoading, refresh };
}
