import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useTasks } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';

export default function CalendarPage() {
  const { t } = useTranslation();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [userId, setUserId] = React.useState<string | undefined>();
  const { tasks, addTask } = useTasks(userId);
  const [open, setOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    date: new Date().toISOString().split('T')[0],
    time: '12:00',
    description: ''
  });

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id);
    });
  }, []);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const dueDate = `${newEvent.date}T${newEvent.time}:00`;
    await addTask.mutateAsync({
      title: newEvent.title,
      priority: 'medium',
      due_date: dueDate,
    });
    setOpen(false);
    setNewEvent({
      title: '',
      date: new Date().toISOString().split('T')[0],
      time: '12:00',
      description: ''
    });
  };

  const todayEvents = Array.isArray(tasks) 
    ? tasks.filter(task => {
        if (!date || !task.due_date) return false;
        const taskDate = new Date(task.due_date);
        return taskDate.toDateString() === date.toDateString();
      })
    : [];

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-6 py-8 max-w-screen-xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{t('calendar.title')}</h1>
          <p className="text-muted-foreground">{t('calendar.subtitle')}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="border-b border-border/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-semibold flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  {t('calendar.events')}
                </CardTitle>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2 shadow-sm">
                      <Plus className="h-4 w-4" />
                      {t('calendar.createEvent')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>{t('calendar.newEvent')}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateEvent} className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label htmlFor="title">{t('calendar.eventTitle')}</Label>
                        <Input
                          id="title"
                          value={newEvent.title}
                          onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                          required
                          className="h-11"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="date">{t('calendar.date')}</Label>
                          <Input
                            id="date"
                            type="date"
                            value={newEvent.date}
                            onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                            required
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="time">{t('calendar.time')}</Label>
                          <Input
                            id="time"
                            type="time"
                            value={newEvent.time}
                            onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                            required
                            className="h-11"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">{t('calendar.description')}</Label>
                        <Textarea
                          id="description"
                          value={newEvent.description}
                          onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                          rows={3}
                          className="resize-none"
                        />
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                          {t('calendar.cancel')}
                        </Button>
                        <Button type="submit" className="shadow-sm">
                          {t('calendar.create')}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              {date ? (
                <div>
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/50">
                    <CalendarIcon className="h-4 w-4 text-primary" />
                    <h3 className="font-medium">
                      {t('calendar.eventsFor')} {format(date, 'MMMM d, yyyy')}
                    </h3>
                  </div>

                  {todayEvents.length === 0 ? (
                    <div className="text-center py-12">
                      <CalendarIcon className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-muted-foreground">{t('calendar.noEvents')}</p>
                      <p className="text-sm text-muted-foreground/80 mt-1">
                        {t('calendar.addEventPrompt')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {todayEvents.map((event) => (
                        <div
                          key={event.id}
                          className="p-4 rounded-lg border border-border/50 bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-foreground truncate">{event.title}</h4>
                              {event.due_date && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {format(new Date(event.due_date), 'h:mm a')}
                                </p>
                              )}
                            </div>
                            <Badge 
                              variant={event.completed ? "secondary" : "default"}
                              className="shrink-0"
                            >
                              {event.completed ? t('calendar.completed') : t('calendar.pending')}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-12">
                  {t('calendar.selectDate')}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
