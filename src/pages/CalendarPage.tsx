import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Calendar as CalendarIcon, Clock, Tag, Edit, Trash2, AlertCircle } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { useCalendarEvents, CalendarEvent } from '@/hooks/useCalendarEvents';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function CalendarPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [date, setDate] = useState<Date>(new Date());
  const [userId, setUserId] = useState<string | undefined>();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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
    start_time: '',
    end_time: '',
    category: 'personal',
    isAllDay: false
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id);
    });
  }, []);

  const daysWithEvents = getDaysWithEvents();
  const dayEvents = getEventsForDate(date);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const getCategoryColor = (category?: string): string => {
    switch (category) {
      case 'work': return 'bg-primary/10 text-primary border-primary/20';
      case 'personal': return 'bg-success/10 text-success border-success/20';
      case 'health': return 'bg-warning/10 text-warning border-warning/20';
      case 'social': return 'bg-accent/10 text-accent border-accent/20';
      case 'low_priority': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getCategoryDotColor = (category?: string): string => {
    switch (category) {
      case 'work': return 'bg-primary';
      case 'personal': return 'bg-success';
      case 'health': return 'bg-warning';
      case 'social': return 'bg-accent';
      case 'low_priority': return 'bg-muted-foreground/50';
      default: return 'bg-primary';
    }
  };

  const getEventTimeDisplay = (event: CalendarEvent): string => {
    if (!event.start_time || !event.end_time) {
      return t('calendar.allDay');
    }
    
    try {
      const start = parseISO(event.start_time);
      const end = parseISO(event.end_time);
      
      if (!isValid(start) || !isValid(end)) {
        return t('calendar.noTimeSet');
      }
      
      return `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`;
    } catch {
      return t('calendar.noTimeSet');
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast({
        title: "Errore",
        description: "Il titolo è obbligatorio",
        variant: "destructive"
      });
      return;
    }

    try {
      let startDateTime: string;
      let endDateTime: string;

      if (formData.isAllDay || !formData.start_time) {
        // All-day event or no time specified
        startDateTime = `${formData.start_date}T00:00:00`;
        endDateTime = `${formData.start_date}T23:59:59`;
      } else {
        startDateTime = `${formData.start_date}T${formData.start_time}:00`;
        endDateTime = `${formData.start_date}T${formData.end_time || formData.start_time}:00`;

        if (new Date(endDateTime) <= new Date(startDateTime)) {
          toast({
            title: "Errore",
            description: "L'ora di fine deve essere successiva all'ora di inizio",
            variant: "destructive"
          });
          return;
        }
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
    } catch (error) {
      console.error('Error creating event:', error);
    }
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    if (!formData.title.trim()) {
      toast({
        title: "Errore",
        description: "Il titolo è obbligatorio",
        variant: "destructive"
      });
      return;
    }

    try {
      let startDateTime: string;
      let endDateTime: string;

      if (formData.isAllDay || !formData.start_time) {
        startDateTime = `${formData.start_date}T00:00:00`;
        endDateTime = `${formData.start_date}T23:59:59`;
      } else {
        startDateTime = `${formData.start_date}T${formData.start_time}:00`;
        endDateTime = `${formData.start_date}T${formData.end_time || formData.start_time}:00`;

        if (new Date(endDateTime) <= new Date(startDateTime)) {
          toast({
            title: "Errore",
            description: "L'ora di fine deve essere successiva all'ora di inizio",
            variant: "destructive"
          });
          return;
        }
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
    } catch (error) {
      console.error('Error updating event:', error);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
    
    try {
      await deleteEvent.mutateAsync(selectedEvent.id);
      setDetailDialogOpen(false);
      setSelectedEvent(null);
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  };

  const openDetailModal = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setDetailDialogOpen(true);
    setIsEditing(false);
  };

  const startEditing = () => {
    if (!selectedEvent) return;
    
    try {
      const startDate = parseISO(selectedEvent.start_time);
      const endDate = parseISO(selectedEvent.end_time);
      
      const isAllDayEvent = !selectedEvent.start_time || 
                           !selectedEvent.end_time || 
                           (format(startDate, 'HH:mm') === '00:00' && format(endDate, 'HH:mm') === '23:59');
      
      setFormData({
        title: selectedEvent.title,
        description: selectedEvent.description || '',
        start_date: isValid(startDate) ? format(startDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        start_time: !isAllDayEvent && isValid(startDate) ? format(startDate, 'HH:mm') : '',
        end_time: !isAllDayEvent && isValid(endDate) ? format(endDate, 'HH:mm') : '',
        category: selectedEvent.category || 'personal',
        isAllDay: isAllDayEvent
      });
    } catch {
      setFormData({
        title: selectedEvent.title,
        description: selectedEvent.description || '',
        start_date: format(new Date(), 'yyyy-MM-dd'),
        start_time: '',
        end_time: '',
        category: selectedEvent.category || 'personal',
        isAllDay: true
      });
    }
    
    setIsEditing(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      start_date: format(date, 'yyyy-MM-dd'),
      start_time: '',
      end_time: '',
      category: 'personal',
      isAllDay: false
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setCreateDialogOpen(true);
  };

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-screen-xl">
        {/* Header */}
        <div className="mb-6 sm:mb-8 animate-fade-in">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            📅 {t('calendar.title')}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {t('calendar.subtitle')}
          </p>
        </div>

        {/* Calendar Card */}
        <Card className="border-border/50 shadow-sm mb-6 animate-fade-in">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col items-center">
              {isLoading ? (
                <div className="w-full max-w-sm space-y-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : (
                <div className="relative calendar-with-indicators">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleDateSelect}
                    className="rounded-md border-0"
                  />
                  <style>{`
                    .calendar-with-indicators .rdp-day_button {
                      position: relative;
                    }
                    ${Array.from(daysWithEvents).map(dateStr => {
                      const eventsForDay = getEventsForDate(new Date(dateStr));
                      const dateObj = new Date(dateStr);
                      const dayNum = dateObj.getDate();
                      const monthNum = dateObj.getMonth();
                      const yearNum = dateObj.getFullYear();
                      
                      return `
                        .calendar-with-indicators button[name="day"][data-date="${yearNum}-${String(monthNum + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}"]:after {
                          content: "";
                          position: absolute;
                          bottom: 4px;
                          left: 50%;
                          transform: translateX(-50%);
                          width: 4px;
                          height: 4px;
                          border-radius: 999px;
                          background: hsl(var(--primary));
                        }
                      `;
                    }).join('\n')}
                  `}</style>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Daily Events Section */}
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-semibold text-foreground flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              {format(date, 'EEEE, d MMMM yyyy', { locale: it })}
            </h2>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : dayEvents.length === 0 ? (
            <Card className="border-dashed border-2 border-border/50">
              <CardContent className="p-8 text-center">
                <CalendarIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground mb-4">{t('calendar.noEvents')}</p>
                <Button onClick={openCreateDialog} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t('calendar.createEvent')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {dayEvents.map((event) => (
                <Card
                  key={event.id}
                  className="cursor-pointer hover:shadow-md transition-all duration-200 border-border/50 hover:border-primary/20 group"
                  onClick={() => openDetailModal(event)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground mb-2 truncate group-hover:text-primary transition-colors">
                          {event.title}
                        </h3>
                        {event.description && (
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
                            {event.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {getEventTimeDisplay(event)}
                          </span>
                          {event.category && (
                            <Badge 
                              variant="outline" 
                              className={cn("text-xs", getCategoryColor(event.category))}
                            >
                              <Tag className="h-3 w-3 mr-1" />
                              {t(`calendar.${event.category}`)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Button */}
      <Button
        onClick={openCreateDialog}
        size="lg"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-110 z-50"
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* Event Detail Modal */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? t('calendar.edit') : 'Dettagli Evento'}
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
                  <span>
                    {format(parseISO(selectedEvent.start_time), 'EEEE, d MMMM yyyy', { locale: it })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{getEventTimeDisplay(selectedEvent)}</span>
                </div>
                {selectedEvent.category && (
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="outline" className={getCategoryColor(selectedEvent.category)}>
                      {t(`calendar.${selectedEvent.category}`)}
                    </Badge>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={startEditing} variant="outline" className="flex-1 gap-2">
                  <Edit className="h-4 w-4" />
                  {t('calendar.edit')}
                </Button>
                <Button onClick={handleDeleteEvent} variant="destructive" className="flex-1 gap-2">
                  <Trash2 className="h-4 w-4" />
                  {t('calendar.delete')}
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

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-all-day"
                    checked={formData.isAllDay}
                    onChange={(e) => setFormData({ ...formData, isAllDay: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="edit-all-day" className="cursor-pointer">
                    {t('calendar.allDay')}
                  </Label>
                </div>
              </div>

              {!formData.isAllDay && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-start-time">Inizio</Label>
                    <Input
                      id="edit-start-time"
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-end-time">Fine</Label>
                    <Input
                      id="edit-end-time"
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="edit-category">{t('calendar.category')}</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger id="edit-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="work">{t('calendar.work')}</SelectItem>
                    <SelectItem value="personal">{t('calendar.personal')}</SelectItem>
                    <SelectItem value="health">{t('calendar.health')}</SelectItem>
                    <SelectItem value="social">{t('calendar.social')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                  {t('calendar.cancel')}
                </Button>
                <Button type="submit" disabled={updateEvent.isPending}>
                  {updateEvent.isPending ? t('calendar.saving') : t('calendar.save')}
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
            <DialogTitle>{t('calendar.newEvent')}</DialogTitle>
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

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="all-day"
                  checked={formData.isAllDay}
                  onChange={(e) => setFormData({ ...formData, isAllDay: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="all-day" className="cursor-pointer">
                  {t('calendar.allDay')}
                </Label>
              </div>
            </div>

            {!formData.isAllDay && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-time">Inizio</Label>
                  <Input
                    id="start-time"
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-time">Fine</Label>
                  <Input
                    id="end-time"
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="category">{t('calendar.category')}</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work">{t('calendar.work')}</SelectItem>
                  <SelectItem value="personal">{t('calendar.personal')}</SelectItem>
                  <SelectItem value="health">{t('calendar.health')}</SelectItem>
                  <SelectItem value="social">{t('calendar.social')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                {t('calendar.cancel')}
              </Button>
              <Button type="submit" disabled={addEvent.isPending}>
                {addEvent.isPending ? t('calendar.saving') : t('calendar.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
