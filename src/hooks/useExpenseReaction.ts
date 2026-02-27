/**
 * Post-expense micro-intervention hook.
 * Call reactToExpense() after a successful recordExpense to show contextual toast.
 */

import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { generateFinancialSignals } from "@/services/financialSignals";

export function useExpenseReaction() {
  const { toast } = useToast();

  const reactToExpense = useCallback(
    async (userId: string, expenseAmount: number, category: string) => {
      try {
        const signals = await generateFinancialSignals(userId);
        if (!signals) return;

        const { burnRate, dailySafeLimit, dailySpending } = signals;

        // Count today's expenses
        const today = new Date().toISOString().split("T")[0];
        const todayTotal = dailySpending[today] || 0;

        if (burnRate > 0.9) {
          toast({
            title: "⚠️ Attenzione",
            description: "Hai superato il 90% del budget mensile.",
            variant: "destructive",
          });
        } else if (burnRate > 0.8) {
          toast({
            title: "📊 Ritmo alto",
            description: "Stai spendendo più del ritmo medio questa settimana.",
          });
        } else if (dailySafeLimit < 10) {
          toast({
            title: "🔴 Limite basso",
            description: `Limite giornaliero sotto €10. Attenzione.`,
          });
        } else if (todayTotal > signals.dailyAvgSpent * 2 && signals.dailyAvgSpent > 0) {
          toast({
            title: "💡 Spesa elevata oggi",
            description: `Hai già speso €${Math.round(todayTotal)} oggi, il doppio della media.`,
          });
        }
      } catch {
        // Silent fail — nudge is non-critical
      }
    },
    [toast]
  );

  return { reactToExpense };
}
