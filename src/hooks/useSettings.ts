import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface UserSettings {
  user_id: string;
  theme: string;
  language: string;
  notifications_enabled: boolean;
  monthly_budget?: number;
  // Notification preferences
  notify_tasks?: boolean;
  notify_calendar?: boolean;
  notify_daily_focus?: boolean;
  notify_wellbeing?: boolean;
  notify_focus_time?: string;
  notify_wellbeing_time?: string;
  notify_task_before_minutes?: number;
  created_at: string;
  updated_at?: string;
}

export const useSettings = (userId?: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["settings", userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      return data as UserSettings | null;
    },
    enabled: !!userId,
  });

  const updateSettings = useMutation({
    mutationFn: async (settings: Partial<UserSettings>) => {
      if (!userId) throw new Error("User ID required");

      const { data, error } = await supabase
        .from("settings")
        .upsert({ user_id: userId, ...settings })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", userId] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Errore durante l'aggiornamento delle impostazioni", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    updateSettings,
  };
};
