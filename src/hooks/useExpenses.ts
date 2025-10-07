import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Expense {
  id: string;
  user_id: string;
  amount: number;
  category: string;
  description?: string;
  icon?: string;
  date: string;
  created_at: string;
}

export const useExpenses = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("date", { ascending: false });

      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });

  const addExpense = useMutation({
    mutationFn: async (expense: Omit<Expense, "id" | "user_id" | "created_at">) => {
      const { data, error } = await supabase
        .from("expenses")
        .insert([expense])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "Expense added successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error adding expense", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "Expense deleted" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error deleting expense", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  return {
    expenses: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addExpense,
    deleteExpense,
  };
};
