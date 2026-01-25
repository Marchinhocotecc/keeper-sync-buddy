import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, FileText, Trash2, Search, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useNotes } from '@/hooks/useNotes';
import { supabase } from '@/integrations/supabase/client';
import { APP_NAME } from '@/config/brand';

export default function NotesPage() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  const { notes, isLoading, addNote, deleteNote } = useNotes(userId);

  const filteredNotes = notes.filter(note =>
    note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddNote = async () => {
    if (!newContent.trim()) {
      toast({ title: 'Scrivi qualcosa', variant: 'destructive' });
      return;
    }
    try {
      await addNote.mutateAsync({ content: newContent.trim() });
      setNewContent('');
      setShowAddModal(false);
      toast({ title: 'Nota aggiunta ✨' });
    } catch {
      toast({ title: 'Errore nel salvataggio', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNote.mutateAsync(id);
      toast({ title: 'Nota eliminata' });
    } catch {
      toast({ title: 'Errore', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-20 sm:pb-24">
      <div className="page-container">
        {/* Header */}
        <div className="page-header animate-fade-in flex items-center justify-between">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Note
            </h1>
            <p className="page-subtitle">Le tue note personali</p>
          </div>
          <Button onClick={() => setShowAddModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuova Nota</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca nelle note..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Notes Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filteredNotes.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full py-16 text-center text-muted-foreground"
              >
                {searchQuery ? 'Nessuna nota trovata' : 'Nessuna nota ancora. Creane una!'}
              </motion.div>
            ) : (
              filteredNotes.map((note) => (
                <motion.div
                  key={note.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="group hover:shadow-ayvo transition-all">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <span className="text-xs text-muted-foreground">
                          {new Date(note.created_at).toLocaleDateString('it-IT', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(note.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-6">
                        {note.content}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Add Note Modal */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nuova Nota</DialogTitle>
            </DialogHeader>
            <Textarea
              placeholder="Scrivi la tua nota..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="min-h-[150px] resize-none"
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Annulla
              </Button>
              <Button onClick={handleAddNote} disabled={addNote.isPending}>
                {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salva'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
