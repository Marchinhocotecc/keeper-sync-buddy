import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { TaskCard } from '@/components/TaskCard';
import { AddTaskForm } from '@/components/AddTaskForm';
import { WellnessCard } from '@/components/WellnessCard';
import { Plus, AlertCircle, CheckCircle2, Clock, Flag } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useHomeData } from '@/hooks/useHomeData';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function HomePage() {
  const { toast } = useToast();
  const { userId, userName, isLoading, error } = useHomeData();
  const { tasks, addTask, toggleTask, deleteTask } = useTasks(userId);
  const { addEvent, updateEvent, deleteEvent } = useCalendarEvents(userId);
  const [showAddForm, setShowAddForm] = useState(false);

  // Sync task with calendar event
  const syncTaskToCalendar = useCallback(async (
    task: any, 
    action: 'create' | 'update' | 'delete'
  ) => {
    if (!userId) return;

    try {
      if (action === 'create') {
        const eventData: any = {
          title: task.title,
          description: task.title,
          category: task.priority === 'low' ? 'low_priority' : 'task',
        };

        // Low priority tasks → no specific time
        if (task.priority === 'low') {
          eventData.start_time = new Date().toISOString();
          eventData.end_time = new Date().toISOString();
        } else if (task.due_date) {
          eventData.start_time = new Date(task.due_date).toISOString();
          const endTime = new Date(task.due_date);
          endTime.setHours(endTime.getHours() + 1);
          eventData.end_time = endTime.toISOString();
        } else {
          // Default: today at 9am
          const startTime = new Date();
          startTime.setHours(9, 0, 0, 0);
          eventData.start_time = startTime.toISOString();
          const endTime = new Date(startTime);
          endTime.setHours(10);
          eventData.end_time = endTime.toISOString();
        }

        await addEvent.mutateAsync(eventData);
      } else if (action === 'update' && task.calendar_event_id) {
        await updateEvent.mutateAsync({
          id: task.calendar_event_id,
          title: task.title,
          description: task.completed ? '✅ Completato' : task.title,
        });
      } else if (action === 'delete' && task.calendar_event_id) {
        await deleteEvent.mutateAsync(task.calendar_event_id);
      }
    } catch (err) {
      console.error('Error syncing task with calendar:', err);
    }
  }, [userId, addEvent, updateEvent, deleteEvent]);

  const handleAddTask = useCallback(async (
    title: string, 
    priority: 'low' | 'medium' | 'high'
  ) => {
    if (!title.trim()) {
      toast({
        title: "Un momento!",
        description: "Dai un titolo al tuo task 📝",
        variant: "destructive"
      });
      return;
    }

    try {
      const newTask = await addTask.mutateAsync({ title, priority });
      await syncTaskToCalendar(newTask, 'create');
      setShowAddForm(false);
      toast({
        title: "Fatto! ✨",
        description: `"${title}" è stato aggiunto`
      });
    } catch (err) {
      toast({
        title: "Ops!",
        description: "Qualcosa non ha funzionato. Riprova!",
        variant: "destructive"
      });
    }
  }, [addTask, syncTaskToCalendar, toast]);

  const handleToggleTask = useCallback(async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    try {
      await toggleTask.mutateAsync({ id, completed: task.completed });
      await syncTaskToCalendar(task, 'update');
      
      if (!task.completed) {
        toast({
          title: "Ottimo lavoro! ✨",
          description: `"${task.title}" completato`,
        });
      }
    } catch (err) {
      toast({
        title: "Ops!",
        description: "Qualcosa non ha funzionato. Riprova!",
        variant: "destructive"
      });
    }
  }, [tasks, toggleTask, syncTaskToCalendar, toast]);

  const handleDeleteTask = useCallback(async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    try {
      await deleteTask.mutateAsync(id);
      await syncTaskToCalendar(task, 'delete');
    } catch (err) {
      toast({
        title: "Ops!",
        description: "Qualcosa non ha funzionato. Riprova!",
        variant: "destructive"
      });
    }
  }, [tasks, deleteTask, syncTaskToCalendar, toast]);

  // Filter tasks by priority and completion
  const todayTasks = tasks.filter((t) => !t.completed && t.priority === 'high');
  const upcomingTasks = tasks.filter((t) => !t.completed && t.priority === 'medium');
  const lowPriorityTasks = tasks.filter((t) => !t.completed && t.priority === 'low');
  const completedTasks = tasks.filter((t) => t.completed);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="page-container">
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-6 w-96 mb-8" />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Skeleton className="h-96 w-full rounded-[18px]" />
            </div>
            <div>
              <Skeleton className="h-96 w-full rounded-[18px]" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background">
        <div className="page-container">
          <Alert variant="destructive" className="max-w-2xl rounded-[18px]">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error.message || "Errore nel caricamento dei dati"}
            </AlertDescription>
          </Alert>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="page-container">
        {/* Header */}
        <div className="page-header animate-fade-in">
          <h1 className="page-title">
            Ciao {userName}! ✨
          </h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('it-IT', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>

        <div className="grid gap-5 sm:gap-6 lg:grid-cols-3">
          {/* Tasks Section */}
          <div className="lg:col-span-2 space-y-5 sm:space-y-6">
            <Card>
              <CardHeader className="border-b border-border px-4 sm:px-6 py-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2 text-foreground">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    I miei Task
                  </CardTitle>
                  <Button 
                    onClick={() => setShowAddForm(true)} 
                    size="sm" 
                    className="gap-2 h-9 text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Aggiungi</span>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-6">
                {showAddForm && (
                  <div className="mb-5 animate-scale-in">
                    <AddTaskForm
                      onAdd={handleAddTask}
                      onCancel={() => setShowAddForm(false)}
                    />
                  </div>
                )}

                <Tabs defaultValue="today" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 mb-4 h-auto p-1 bg-muted rounded-xl">
                    <TabsTrigger value="today" className="gap-1.5 text-sm py-2">
                      <Flag className="h-3.5 w-3.5 hidden sm:block" />
                      <span className="truncate">Oggi ({todayTasks.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="upcoming" className="gap-1.5 text-sm py-2">
                      <Clock className="h-3.5 w-3.5 hidden sm:block" />
                      <span className="truncate">Prossimi ({upcomingTasks.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="low" className="gap-1.5 text-sm py-2">
                      <span className="truncate">Bassi ({lowPriorityTasks.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="gap-1.5 text-sm py-2">
                      <CheckCircle2 className="h-3.5 w-3.5 hidden sm:block" />
                      <span className="truncate">Fatti ({completedTasks.length})</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="today" className="space-y-2.5 max-h-[350px] overflow-y-auto">
                    {todayTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        Nessun task prioritario per oggi 🎉
                      </p>
                    ) : (
                      todayTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={{
                            ...task,
                            priority: task.priority as 'low' | 'medium' | 'high'
                          }}
                          onToggle={handleToggleTask}
                          onDelete={handleDeleteTask}
                        />
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="upcoming" className="space-y-2.5 max-h-[350px] overflow-y-auto">
                    {upcomingTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        Nessun task in programma
                      </p>
                    ) : (
                      upcomingTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={{
                            ...task,
                            priority: task.priority as 'low' | 'medium' | 'high'
                          }}
                          onToggle={handleToggleTask}
                          onDelete={handleDeleteTask}
                        />
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="low" className="space-y-2.5 max-h-[350px] overflow-y-auto">
                    {lowPriorityTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        Nessun task a bassa priorità
                      </p>
                    ) : (
                      lowPriorityTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={{
                            ...task,
                            priority: task.priority as 'low' | 'medium' | 'high'
                          }}
                          onToggle={handleToggleTask}
                          onDelete={handleDeleteTask}
                        />
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="completed" className="space-y-2.5 max-h-[350px] overflow-y-auto">
                    {completedTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        Nessun task completato ancora
                      </p>
                    ) : (
                      completedTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={{
                            ...task,
                            priority: task.priority as 'low' | 'medium' | 'high'
                          }}
                          onToggle={handleToggleTask}
                          onDelete={handleDeleteTask}
                        />
                      ))
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Wellness Section */}
          <div className="space-y-6">
            <WellnessCard />
          </div>
        </div>
      </div>
    </main>
  );
}
