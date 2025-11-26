import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface UserSettings {
  user_id: string;
  theme: string;
  language: string;
  notifications_enabled: boolean;
  monthly_budget?: number;
  created_at: string;
  updated_at: string;
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
      return data;
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
      toast({ title: "✅ Impostazioni aggiornate con successo" });
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
