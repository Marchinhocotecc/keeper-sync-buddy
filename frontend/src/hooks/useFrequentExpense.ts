import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the user's most frequent expense category in the last `days` days,
 * with the average amount for that category.
 *
 * Used by the QuickAddFab long-press to pre-fill a "repeat frequent expense" intent.
 */
export function useFrequentExpense(userId?: string, options?: { days?: number }) {
  const days = options?.days ?? 28;

  return useQuery({
    queryKey: ['frequent_expense', userId, days],
    queryFn: async () => {
      if (!userId) return null as null | { category: string; avgAmount: number; count: number };
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('expenses')
        .select('category, amount')
        .eq('user_id', userId)
        .gte('date', sinceStr);

      if (error || !data || data.length === 0) return null;
      const buckets: Record<string, { sum: number; count: number }> = {};
      data.forEach((row: any) => {
        const c = row.category || 'other';
        const amt = Number(row.amount) || 0;
        if (!buckets[c]) buckets[c] = { sum: 0, count: 0 };
        buckets[c].sum += amt;
        buckets[c].count += 1;
      });
      const top = Object.entries(buckets).sort((a, b) => b[1].count - a[1].count)[0];
      if (!top) return null;
      const [category, stats] = top;
      return {
        category,
        avgAmount: Math.round((stats.sum / stats.count) * 100) / 100,
        count: stats.count,
      };
    },
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
