import { useQuery } from '@tanstack/react-query';
import { useExpenses } from './useExpenses';
import { getMonthlyBudget } from '@/services/budgetService';

export type DailyBudgetStatus = 'good' | 'warning' | 'over' | 'no_budget';

export interface DailyBudget {
  /** Monthly budget for current month (0 if not set) */
  monthlyBudget: number;
  /** Total spent this month so far (incl. today) */
  totalSpent: number;
  /** Spent today only */
  todaySpent: number;
  /** Average daily spend so far (totalSpent / daysElapsed) */
  averageDailySpend: number;
  /**
   * Daily budget remaining for FUTURE days (excludes today, per spec 1b):
   *   (budget - totalSpent) / max(1, daysRemaining - 1)
   * where daysRemaining is inclusive of today.
   */
  dailyBudget: number;
  /** Days remaining inclusive of today (>=1) */
  daysRemainingInclusive: number;
  /** Days remaining excluding today (>=0) */
  daysRemainingExclusive: number;
  /** Total days in current month */
  daysInMonth: number;
  /** Day-of-month (1-31) */
  today: number;
  /** Status colour for the ring */
  status: DailyBudgetStatus;
  /** Progress 0..1 = todaySpent / dailyBudget. Capped at 1.5 for visual */
  todayProgress: number;
  isLoading: boolean;
}

function localDateKey(d: Date): string {
  // YYYY-MM-DD in user's local time
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Hook that returns the user's daily-budget snapshot.
 *
 * Formula (per user spec, choice 1b):
 *   dailyBudget = (monthlyBudget - totalSpent) / max(1, daysRemainingInclusive - 1)
 *
 * If no budget is set (=0), returns status='no_budget'.
 */
export function useDailyBudget(userId?: string): DailyBudget {
  const { expenses, isLoading: expLoading } = useExpenses(userId);

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const today = now.getDate();
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysRemainingInclusive = daysInMonth - today + 1;
  const daysRemainingExclusive = Math.max(0, daysRemainingInclusive - 1);

  const budgetQuery = useQuery({
    queryKey: ['monthly_budget', userId, month, year],
    queryFn: async () => {
      if (!userId) return 0;
      return await getMonthlyBudget(userId, month, year);
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 min
  });

  const monthlyBudget = budgetQuery.data ?? 0;
  const isLoading = expLoading || budgetQuery.isLoading;

  // Filter expenses for the current month
  const todayKey = localDateKey(now);
  let totalSpent = 0;
  let todaySpent = 0;
  let earliestDayOfMonthWithExpense = today;

  for (const e of expenses) {
    const d = new Date(e.date + 'T00:00:00');
    if (d.getFullYear() === year && d.getMonth() + 1 === month) {
      const amt = Number(e.amount);
      totalSpent += amt;
      if (e.date === todayKey) todaySpent += amt;
      const day = d.getDate();
      if (day < earliestDayOfMonthWithExpense) earliestDayOfMonthWithExpense = day;
    }
  }

  const daysElapsed = today; // today inclusive
  const averageDailySpend = daysElapsed > 0 ? totalSpent / daysElapsed : 0;

  // Spec 1b: divisor = daysRemaining (inclusive) - 1, with fallback to 1
  const divisor = Math.max(1, daysRemainingInclusive - 1);
  const remainingBudget = monthlyBudget - totalSpent;
  const dailyBudget = monthlyBudget > 0 ? remainingBudget / divisor : 0;

  // Status
  let status: DailyBudgetStatus = 'good';
  if (monthlyBudget <= 0) status = 'no_budget';
  else if (dailyBudget <= 0) status = 'over';
  else {
    const ratio = dailyBudget > 0 ? todaySpent / dailyBudget : 0;
    if (ratio >= 0.9) status = 'over';
    else if (ratio >= 0.6) status = 'warning';
    else status = 'good';
  }

  const todayProgress = dailyBudget > 0 ? Math.min(1.5, todaySpent / dailyBudget) : 0;

  return {
    monthlyBudget,
    totalSpent,
    todaySpent,
    averageDailySpend,
    dailyBudget,
    daysRemainingInclusive,
    daysRemainingExclusive,
    daysInMonth,
    today,
    status,
    todayProgress,
    isLoading,
  };
}
