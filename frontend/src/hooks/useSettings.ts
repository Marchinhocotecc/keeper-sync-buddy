import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ensureUserSettings, updateUserSettings, type UserSettings } from "@/services/settingsService";

// Re-export type for backward compatibility
export type { UserSettings } from "@/services/settingsService";

export const useSettings = (userId?: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["settings", userId],
    queryFn: async () => {
      if (!userId) return null;
      // USA ensureUserSettings - garantisce esistenza, NO errori 406
      return await ensureUserSettings(userId);
    },
    enabled: !!userId,
  });

  const updateSettings = useMutation({
    mutationFn: async (settings: Partial<UserSettings>) => {
      if (!userId) throw new Error("User ID required");
      return await updateUserSettings(userId, settings);
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
