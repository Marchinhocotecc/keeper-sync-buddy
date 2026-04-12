import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  scheduleTaskNotification, 
  cancelNotificationsForItem,
  getNotificationPreferencesFromSettings
} from "@/services/notificationService";

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
      
      // console.log('[TaskRepo] SELECT todos (useTasks hook)', { user_id: userId });
      const { data, error } = await supabase
        .from("todos")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      // console.log('[TaskRepo] SELECT todos SUCCESS', { count: data?.length || 0 });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!userId,
  });

  const addTask = useMutation({
    mutationFn: async (task: { title: string; priority: "low" | "medium" | "high"; due_date?: string }) => {
      if (!userId) throw new Error("User ID required");
      
      // console.log('[TaskRepo] INSERT todos (useTasks hook)', { user_id: userId, title: task.title });
      const { data, error } = await supabase
        .from("todos")
        .insert([{ ...task, completed: false, user_id: userId }])
        .select()
        .single();

      if (error) throw error;
      // console.log('[TaskRepo] INSERT todos SUCCESS', { id: data.id });
      return data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
      toast({ title: "Task aggiunto" });

      // Schedule notification if enabled
      if (userId && data) {
        try {
          const { data: settings } = await supabase
            .from('settings')
            .select('notifications_enabled, notify_tasks, notify_task_before_minutes')
            .eq('user_id', userId)
            .maybeSingle();

          if (settings?.notifications_enabled && settings?.notify_tasks !== false) {
            await scheduleTaskNotification(
              userId,
              data.id,
              data.title,
              data.due_date || null,
              settings.notify_task_before_minutes || 60
            );
          }
        } catch (error) {
          console.error('Error scheduling task notification:', error);
        }
      }
    },
    onError: (error: any) => {
      toast({ 
        title: "Errore nell'aggiunta del task", 
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
      return { id, newCompleted: !completed };
    },
    onSuccess: async ({ id, newCompleted }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
      
      // Cancel notification if task completed
      if (newCompleted && userId) {
        await cancelNotificationsForItem(userId, id);
      }
    },
    onError: (error: any) => {
      toast({ 
        title: "Errore nell'aggiornamento del task", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("todos").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: async (id) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
      toast({ title: "Task eliminato" });
      
      // Cancel scheduled notification
      if (userId) {
        await cancelNotificationsForItem(userId, id);
      }
    },
    onError: (error: any) => {
      toast({ 
        title: "Errore nell'eliminazione del task", 
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
