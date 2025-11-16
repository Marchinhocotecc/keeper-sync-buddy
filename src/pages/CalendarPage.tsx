import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Calendar as CalendarIcon, Clock, Tag, Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { useCalendarEvents, CalendarEvent } from '@/hooks/useCalendarEvents';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export default function CalendarPage() {
  const { t } = useTranslation();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [userId, setUserId] = useState<string | undefined>();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const {
    events,
    isLoading,
    addEvent,
    updateEvent,
    deleteEvent,
    getEventsForDate,
    getDaysWithEvents,
  } = useCalendarEvents(userId);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '09:00',
    end_time: '10:00',
    category: 'work'
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id);
    });
  }, []);

  const daysWithEvents = getDaysWithEvents();

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate) {
      setDaySheetOpen(true);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const startDateTime = `${formData.start_date}T${formData.start_time}:00`;
    const endDateTime = `${formData.start_date}T${formData.end_time}:00`;

    if (new Date(endDateTime) <= new Date(startDateTime)) {
      return;
    }

    await addEvent.mutateAsync({
      title: formData.title,
      description: formData.description,
      start_time: startDateTime,
      end_time: endDateTime,
      category: formData.category,
    });

    setCreateDialogOpen(false);
    resetForm();
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    const startDateTime = `${formData.start_date}T${formData.start_time}:00`;
    const endDateTime = `${formData.start_date}T${formData.end_time}:00`;

    if (new Date(endDateTime) <= new Date(startDateTime)) {
      return;
    }

    await updateEvent.mutateAsync({
      id: selectedEvent.id,
      title: formData.title,
      description: formData.description,
      start_time: startDateTime,
      end_time: endDateTime,
      category: formData.category,
    });

    setIsEditing(false);
    setDetailDialogOpen(false);
    setSelectedEvent(null);
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
    await deleteEvent.mutateAsync(selectedEvent.id);
    setDetailDialogOpen(false);
    setSelectedEvent(null);
  };

  const openDetailModal = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setDetailDialogOpen(true);
    setIsEditing(false);
  };

  const startEditing = () => {
    if (!selectedEvent) return;
    const startDate = new Date(selectedEvent.start_time);
    const endDate = new Date(selectedEvent.end_time);
    
    setFormData({
      title: selectedEvent.title,
      description: selectedEvent.description || '',
      start_date: format(startDate, 'yyyy-MM-dd'),
      start_time: format(startDate, 'HH:mm'),
      end_time: format(endDate, 'HH:mm'),
      category: selectedEvent.category || 'work'
    });
    setIsEditing(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      start_date: date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      start_time: '09:00',
      end_time: '10:00',
      category: 'work'
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setCreateDialogOpen(true);
  };

  const dayEvents = date ? getEventsForDate(date) : [];

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'work': return 'bg-primary/10 text-primary border-primary/20';
      case 'personal': return 'bg-success/10 text-success border-success/20';
      case 'health': return 'bg-warning/10 text-warning border-warning/20';
      case 'social': return 'bg-accent/10 text-accent border-accent/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-screen-xl">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            📅 {t('calendar.title')}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {t('calendar.subtitle')}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-1">
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col items-center">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={handleDateSelect}
                  className="rounded-md border-0"
                  modifiers={{
                    hasEvents: (date) => daysWithEvents.has(date.toDateString())
                  }}
                  modifiersClassNames={{
                    hasEvents: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-primary after:rounded-full"
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Floating Action Button */}
      <Button
        onClick={openCreateDialog}
        size="lg"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* Day Events Bottom Sheet */}
      <Sheet open={daySheetOpen} onOpenChange={setDaySheetOpen}>
        <SheetContent side="bottom" className="h-[80vh] sm:h-[70vh]">
          <SheetHeader>
            <SheetTitle className="text-xl flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              {date && format(date, 'EEEE, d MMMM yyyy', { locale: it })}
            </SheetTitle>
          </SheetHeader>
          
          <div className="mt-6 space-y-3 overflow-y-auto max-h-[calc(80vh-120px)]">
            {dayEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CalendarIcon className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground mb-4">Nessun evento per questo giorno</p>
                <Button onClick={openCreateDialog} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Crea evento
                </Button>
              </div>
            ) : (
              dayEvents.map((event) => (
                <Card
                  key={event.id}
                  className="cursor-pointer hover:shadow-md transition-shadow border-border/50"
                  onClick={() => openDetailModal(event)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground mb-2 truncate">
                          {event.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {format(new Date(event.start_time), 'HH:mm')} - {format(new Date(event.end_time), 'HH:mm')}
                          </span>
                          {event.category && (
                            <Badge variant="outline" className={cn("text-xs", getCategoryColor(event.category))}>
                              <Tag className="h-3 w-3 mr-1" />
                              {event.category}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Event Detail Modal */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-8">
              {isEditing ? 'Modifica Evento' : 'Dettagli Evento'}
            </DialogTitle>
          </DialogHeader>

          {!isEditing && selectedEvent ? (
            <div className="space-y-4 py-4">
              <div>
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  {selectedEvent.title}
                </h3>
                {selectedEvent.description && (
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {selectedEvent.description}
                  </p>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarIcon className="h-4 w-4" />
                  <span>{format(new Date(selectedEvent.start_time), 'EEEE, d MMMM yyyy', { locale: it })}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    {format(new Date(selectedEvent.start_time), 'HH:mm')} - {format(new Date(selectedEvent.end_time), 'HH:mm')}
                  </span>
                </div>
                {selectedEvent.category && (
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="outline" className={getCategoryColor(selectedEvent.category)}>
                      {selectedEvent.category}
                    </Badge>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={startEditing} variant="outline" className="flex-1 gap-2">
                  <Edit className="h-4 w-4" />
                  Modifica
                </Button>
                <Button onClick={handleDeleteEvent} variant="destructive" className="flex-1 gap-2">
                  <Trash2 className="h-4 w-4" />
                  Elimina
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleUpdateEvent} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Titolo *</Label>
                <Input
                  id="edit-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  placeholder="Es: Riunione con il team"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Descrizione</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Aggiungi dettagli..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-date">Data *</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-start-time">Inizio *</Label>
                  <Input
                    id="edit-start-time"
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-end-time">Fine *</Label>
                  <Input
                    id="edit-end-time"
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-category">Categoria</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger id="edit-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="work">Lavoro</SelectItem>
                    <SelectItem value="personal">Personale</SelectItem>
                    <SelectItem value="health">Salute</SelectItem>
                    <SelectItem value="social">Sociale</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                  Annulla
                </Button>
                <Button type="submit" disabled={updateEvent.isPending}>
                  {updateEvent.isPending ? 'Salvataggio...' : 'Salva'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Event Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nuovo Evento</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateEvent} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titolo *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="Es: Riunione con il team"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Aggiungi dettagli..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Data *</Label>
              <Input
                id="date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-time">Inizio *</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-time">Fine *</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work">Lavoro</SelectItem>
                  <SelectItem value="personal">Personale</SelectItem>
                  <SelectItem value="health">Salute</SelectItem>
                  <SelectItem value="social">Sociale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={addEvent.isPending}>
                {addEvent.isPending ? 'Creazione...' : 'Crea Evento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
