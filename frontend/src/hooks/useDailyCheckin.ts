import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTodayCheckin,
  upsertCheckin,
  getRecentCheckinDates,
  DailyCheckin,
} from '@/services/dailyCheckinService';

export function useTodayCheckin(userId?: string) {
  return useQuery({
    queryKey: ['daily_checkin_today', userId],
    queryFn: async () => {
      if (!userId) return null;
      return await getTodayCheckin(userId);
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}

export function useRecentCheckinDates(userId?: string, days = 60) {
  return useQuery({
    queryKey: ['daily_checkin_dates', userId, days],
    queryFn: async () => {
      if (!userId) return new Set<string>();
      return await getRecentCheckinDates(userId, days);
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertCheckin(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { expenses_logged: boolean; tasks_done: boolean; mood_ok: boolean }) => {
      if (!userId) throw new Error('No user');
      const result = await upsertCheckin(userId, payload);
      if (!result) throw new Error('Failed to save check-in');
      return result as DailyCheckin;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily_checkin_today', userId] });
      qc.invalidateQueries({ queryKey: ['daily_checkin_dates', userId] });
    },
  });
}
