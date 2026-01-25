import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Note {
  id: string;
  user_id: string;
  content: string;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export function useNotes(userId: string | null) {
  const queryClient = useQueryClient();

  const notesQuery = useQuery({
    queryKey: ['notes', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Note[];
    },
    enabled: !!userId
  });

  const addNote = useMutation({
    mutationFn: async ({ content, category }: { content: string; category?: string }) => {
      if (!userId) throw new Error('User not authenticated');
      const { data, error } = await supabase
        .from('notes')
        .insert({ user_id: userId, content, category: category || null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', userId] });
    }
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, content, category }: { id: string; content: string; category?: string }) => {
      const { data, error } = await supabase
        .from('notes')
        .update({ content, category: category || null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', userId] });
    }
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', userId] });
    }
  });

  return {
    notes: notesQuery.data ?? [],
    isLoading: notesQuery.isLoading,
    error: notesQuery.error,
    addNote,
    updateNote,
    deleteNote
  };
}
