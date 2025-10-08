import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface WellnessData {
  id: string;
  user_id: string;
  date: string;
  sleep?: number;
  activity?: string;
  created_at: string;
}

export const useWellness = (userId?: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["wellness", userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from("wellness_data")
        .select("*")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(30);

      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
    enabled: !!userId,
  });

  const updateWellness = useMutation({
    mutationFn: async (wellness: Partial<WellnessData> & { date: string }) => {
      if (!userId) throw new Error("User ID required");

      const { data, error } = await supabase
        .from("wellness_data")
        .upsert({ user_id: userId, ...wellness })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wellness", userId] });
      toast({ title: "Wellness data updated" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error updating wellness data", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  return {
    wellnessData: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    updateWellness,
  };
};
