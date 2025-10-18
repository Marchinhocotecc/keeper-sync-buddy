import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { useTasks } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';

export default function CalendarPage() {
  const { t } = useTranslation();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [userId, setUserId] = React.useState<string | undefined>();
  const { tasks, addTask } = useTasks(userId);
  const [open, setOpen] = useState(false);
  const [eventStatus, setEventStatus] = useState<Record<string, 'normal' | 'completed' | 'cancelled'>>({});
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
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t('calendar.title')}</h1>
      <div className="grid gap-6 md:grid-cols-[1fr,300px]">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">{t('calendar.events')}</h2>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t('calendar.createEvent')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('calendar.newEvent')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateEvent} className="space-y-4">
                  <div>
                    <Label htmlFor="title">{t('calendar.eventTitle')}</Label>
                    <Input
                      id="title"
                      value={newEvent.title}
                      onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="date">{t('calendar.date')}</Label>
                      <Input
                        id="date"
                        type="date"
                        value={newEvent.date}
                        onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="time">{t('calendar.time')}</Label>
                      <Input
                        id="time"
                        type="time"
                        value={newEvent.time}
                        onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="description">{t('calendar.description')}</Label>
                    <Textarea
                      id="description"
                      value={newEvent.description}
                      onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    {t('calendar.create')}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {date ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">{format(date, 'MMMM d, yyyy')}</h3>
                {todayEvents.length > 0 && (
                  <Badge variant="secondary">{todayEvents.length} {t('calendar.events')}</Badge>
                )}
              </div>
              {todayEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t('calendar.noEvents')}
                </p>
              ) : (
                <div className="space-y-2">
                  {todayEvents.map((event) => {
                    const status = eventStatus[event.id] || 'normal';
                    return (
                      <Card 
                        key={event.id} 
                        className={`p-4 transition-colors ${
                          status === 'completed' ? 'bg-green-500/10 border-green-500/30' : 
                          status === 'cancelled' ? 'bg-red-500/10 border-red-500/30' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h4 className="font-medium">{event.title}</h4>
                            <p className="text-sm text-muted-foreground">
                              {event.due_date && format(new Date(event.due_date), 'HH:mm')}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-500/20"
                              onClick={() => setEventStatus(prev => ({ ...prev, [event.id]: 'completed' }))}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-500/20"
                              onClick={() => setEventStatus(prev => ({ ...prev, [event.id]: 'cancelled' }))}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">{t('calendar.selectDate')}</p>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">{t('calendar.calendar')}</h2>
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            className="rounded-md border"
          />
        </Card>
      </div>
    </main>
  );
}