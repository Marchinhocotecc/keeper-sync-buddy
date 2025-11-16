import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface CalendarEvent {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  category?: string;
  created_at: string;
}

export interface CreateEventData {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  category?: string;
}

export interface UpdateEventData extends Partial<CreateEventData> {
  id: string;
}

export const useCalendarEvents = (userId?: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["calendar-events", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("user_id", userId)
        .order("start_time", { ascending: true });

      if (error) throw error;
      return (data || []) as CalendarEvent[];
    },
    enabled: !!userId,
  });

  const addEvent = useMutation({
    mutationFn: async (event: CreateEventData) => {
      if (!userId) throw new Error("User ID required");
      
      const { data, error } = await supabase
        .from("calendar_events")
        .insert([{ ...event, user_id: userId }])
        .select()
        .single();

      if (error) throw error;
      return data as CalendarEvent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", userId] });
      toast({ 
        title: "✅ Evento creato!",
        description: "Il tuo evento è stato aggiunto al calendario"
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Errore nella creazione", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const updateEvent = useMutation({
    mutationFn: async ({ id, ...updates }: UpdateEventData) => {
      const { data, error } = await supabase
        .from("calendar_events")
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;
      return data as CalendarEvent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", userId] });
      toast({ 
        title: "✅ Evento aggiornato!",
        description: "Le modifiche sono state salvate"
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Errore nell'aggiornamento", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", userId] });
      toast({ 
        title: "🗑️ Evento eliminato",
        description: "L'evento è stato rimosso dal calendario"
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Errore nell'eliminazione", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const getEventsForDate = (date: Date) => {
    return (query.data || []).filter((event) => {
      const eventDate = new Date(event.start_time);
      return eventDate.toDateString() === date.toDateString();
    });
  };

  const getDaysWithEvents = () => {
    const daysSet = new Set<string>();
    (query.data || []).forEach((event) => {
      const date = new Date(event.start_time);
      daysSet.add(date.toDateString());
    });
    return daysSet;
  };

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addEvent,
    updateEvent,
    deleteEvent,
    getEventsForDate,
    getDaysWithEvents,
  };
};
