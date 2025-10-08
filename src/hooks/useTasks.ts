import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  due_date?: string;
  user_id: string;
  created_at: string;
}

export const useTasks = (userId?: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["tasks", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("todos")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
    enabled: !!userId,
  });

  const addTask = useMutation({
    mutationFn: async (task: { title: string; priority: "low" | "medium" | "high" }) => {
      if (!userId) throw new Error("User ID required");
      
      const { data, error } = await supabase
        .from("todos")
        .insert([{ ...task, completed: false, user_id: userId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
      toast({ title: "Task added successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error adding task", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from("todos")
        .update({ completed: !completed })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error updating task", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("todos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
      toast({ title: "Task deleted" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error deleting task", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addTask,
    toggleTask,
    deleteTask,
  };
};
