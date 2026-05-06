import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the top-N category slugs the user has used most often
 * over the last `days` days. Used to promote chips for quick-add.
 *
 * Cached for 10 minutes.
 */
export function useTopCategories(userId?: string, options?: { days?: number; limit?: number }) {
  const days = options?.days ?? 30;
  const limit = options?.limit ?? 3;

  return useQuery({
    queryKey: ['top_categories', userId, days, limit],
    queryFn: async () => {
      if (!userId) return [] as string[];
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('expenses')
        .select('category')
        .eq('user_id', userId)
        .gte('date', sinceStr);

      if (error) return [] as string[];
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        const c = row.category || 'other';
        counts[c] = (counts[c] || 0) + 1;
      });
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([cat]) => cat);
    },
    enabled: !!userId,
    staleTime: 10 * 60 * 1000, // 10 min
    gcTime: 30 * 60 * 1000,
  });
}
