import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTasks } from "./useTasks";
import { useWellness } from "./useWellness";
import { useCalendarEvents } from "./useCalendarEvents";

export interface HomeData {
  userId: string;
  userName: string;
  tasks: any[];
  wellnessData: any[];
  events: any[];
  isLoading: boolean;
  error: Error | null;
}

export const useHomeData = () => {
  const [userId, setUserId] = useState<string | undefined>();
  const [userName, setUserName] = useState<string>("");
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const { tasks, isLoading: tasksLoading, isError: tasksError, error: tasksErrorMsg } = useTasks(userId);
  const { wellnessData, isLoading: wellnessLoading, isError: wellnessError } = useWellness(userId);
  const { events, isLoading: eventsLoading, isError: eventsError } = useCalendarEvents(userId);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
          setUserId(data.user.id);
          const name = data.user.email?.split('@')[0] || 'Utente';
          setUserName(name.charAt(0).toUpperCase() + name.slice(1));
        }
      } catch (err) {
        console.error("Error loading user:", err);
      } finally {
        setIsAuthLoading(false);
      }
    };

    loadUserData();
  }, []);

  const isLoading = isAuthLoading || tasksLoading || wellnessLoading || eventsLoading;
  const hasError = tasksError || wellnessError || eventsError;
  const error = hasError ? (tasksErrorMsg || new Error("Errore nel caricamento dei dati")) : null;

  return {
    userId,
    userName,
    tasks: tasks || [],
    wellnessData: wellnessData || [],
    events: events || [],
    isLoading,
    error,
  };
};
