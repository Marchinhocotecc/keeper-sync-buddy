import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { TaskCard } from '@/components/TaskCard';
import { AddTaskForm } from '@/components/AddTaskForm';
import { WellnessCard } from '@/components/WellnessCard';
import { FinancialInsightCard } from '@/components/FinancialInsightCard';
import { WeeklySummaryCard } from '@/components/WeeklySummaryCard';
import { MonthlySummaryCard } from '@/components/MonthlySummaryCard';
import { Plus, AlertCircle, CheckCircle2, Clock, Flag, TrendingUp, Wallet } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useHomeData } from '@/hooks/useHomeData';
import { useHomeInsights } from '@/hooks/useHomeInsights';
import { useExpenses } from '@/hooks/useExpenses';
import { DailyNudge } from '@/components/DailyNudge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { userId, userName, isLoading, error } = useHomeData();
  const { tasks, addTask, toggleTask, deleteTask } = useTasks(userId);
  const { addEvent, updateEvent, deleteEvent } = useCalendarEvents(userId);
  const { expenses } = useExpenses(userId);
  const { insights, financialInsight, weeklySummary, monthlySummary } = useHomeInsights(userId);
  const [showAddForm, setShowAddForm] = useState(false);

  const todayTasks = tasks.filter((t) => !t.completed && t.priority === 'high');
  const completedToday = tasks.filter((t) => t.completed).length;
  const upcomingTasks = tasks.filter((t) => !t.completed && t.priority === 'medium');
  const lowPriorityTasks = tasks.filter((t) => !t.completed && t.priority === 'low');
  const completedTasks = tasks.filter((t) => t.completed);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weekExpenses = expenses
    .filter(e => new Date(e.date) >= weekStart)
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const syncTaskToCalendar = useCallback(async (task: any, action: 'create' | 'update' | 'delete') => {
    if (!userId) return;
    try {
      if (action === 'create') {
        const eventData: any = {
          title: task.title,
          description: task.title,
          category: task.priority === 'low' ? 'low_priority' : 'task',
        };
        if (task.priority === 'low') {
          eventData.start_time = new Date().toISOString();
          eventData.end_time = new Date().toISOString();
        } else if (task.due_date) {
          eventData.start_time = new Date(task.due_date).toISOString();
          const endTime = new Date(task.due_date);
          endTime.setHours(endTime.getHours() + 1);
          eventData.end_time = endTime.toISOString();
        } else {
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
          description: task.completed ? '✅ ' + t('home.completed') : task.title,
        });
      } else if (action === 'delete' && task.calendar_event_id) {
        await deleteEvent.mutateAsync(task.calendar_event_id);
      }
    } catch (err) {
      console.error('Error syncing task with calendar:', err);
    }
  }, [userId, addEvent, updateEvent, deleteEvent, t]);

  const handleAddTask = useCallback(async (title: string, priority: 'low' | 'medium' | 'high') => {
    if (!title.trim()) {
      toast({ title: t('home.taskTitleRequired'), description: t('home.taskTitleRequiredDesc'), variant: "destructive" });
      return;
    }
    try {
      const newTask = await addTask.mutateAsync({ title, priority });
      await syncTaskToCalendar(newTask, 'create');
      setShowAddForm(false);
      toast({ title: t('home.taskAdded'), description: t('home.taskAddedDesc', { title }) });
    } catch (err) {
      toast({ title: t('home.taskError'), description: t('home.taskErrorDesc'), variant: "destructive" });
    }
  }, [addTask, syncTaskToCalendar, toast, t]);

  const handleToggleTask = useCallback(async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    try {
      await toggleTask.mutateAsync({ id, completed: task.completed });
      await syncTaskToCalendar(task, 'update');
      if (!task.completed) {
        toast({ title: t('home.taskCompleted'), description: t('home.taskCompletedDesc', { title: task.title }) });
      }
    } catch (err) {
      toast({ title: t('home.taskError'), description: t('home.taskErrorDesc'), variant: "destructive" });
    }
  }, [tasks, toggleTask, syncTaskToCalendar, toast, t]);

  const handleDeleteTask = useCallback(async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    try {
      await deleteTask.mutateAsync(id);
      await syncTaskToCalendar(task, 'delete');
    } catch (err) {
      toast({ title: t('home.taskError'), description: t('home.taskErrorDesc'), variant: "destructive" });
    }
  }, [tasks, deleteTask, syncTaskToCalendar, toast, t]);

  const dateLocale = i18n.language === 'it' ? 'it-IT' : i18n.language === 'de' ? 'de-DE' : i18n.language === 'fr' ? 'fr-FR' : i18n.language === 'es' ? 'es-ES' : i18n.language === 'pt' ? 'pt-PT' : 'en-US';

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="page-container">
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-6 w-96 mb-8" />
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <Skeleton className="h-24 rounded-[18px]" />
            <Skeleton className="h-24 rounded-[18px]" />
            <Skeleton className="h-24 rounded-[18px]" />
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
            <AlertDescription>{error.message || t('home.errorLoading')}</AlertDescription>
          </Alert>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-20 sm:pb-0">
      <div className="page-container">
        <div className="page-header animate-fade-in">
          <h1 className="page-title">{t('home.greeting', { name: userName })}</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString(dateLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {userId && (
          <div className="mb-4 animate-fade-in">
            <DailyNudge userId={userId} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3 mb-6 animate-fade-in">
          <Card className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-success/10">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{completedToday}</p>
                <p className="text-sm text-muted-foreground">{t('home.completedTasks')}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{todayTasks.length}</p>
                <p className="text-sm text-muted-foreground">{t('home.highPriority')}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-warning/10">
                <Wallet className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">€{weekExpenses.toFixed(0)}</p>
                <p className="text-sm text-muted-foreground">{t('home.weekExpenses')}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {insights.length > 0 && (
          <div className="space-y-4 mb-6 animate-fade-in">
            {insights.map((insight, idx) => {
              if ((insight.type === "critical_risk" || insight.type === "soft_warning") && insight.financialInsight && userId) {
                return <FinancialInsightCard key={`fi-${idx}`} insight={insight.financialInsight} userId={userId} />;
              }
              if (insight.type === "weekly_summary" && insight.weeklySummary) {
                return <WeeklySummaryCard key={`ws-${idx}`} summary={insight.weeklySummary} />;
              }
              if (insight.type === "monthly_summary" && insight.monthlySummary) {
                return <MonthlySummaryCard key={`ms-${idx}`} summary={insight.monthlySummary} />;
              }
              return null;
            })}
          </div>
        )}

        <div className="grid gap-5 sm:gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5 sm:space-y-6">
            <Card>
              <CardHeader className="border-b border-border px-4 sm:px-6 py-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2 text-foreground">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    {t('home.myTasks')}
                  </CardTitle>
                  <Button onClick={() => setShowAddForm(true)} size="sm" className="gap-2 h-9 text-sm">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('home.add')}</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                {showAddForm && (
                  <div className="mb-5 animate-scale-in">
                    <AddTaskForm onAdd={handleAddTask} onCancel={() => setShowAddForm(false)} />
                  </div>
                )}
                <Tabs defaultValue="today" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 mb-4 h-auto p-1 bg-muted rounded-xl">
                    <TabsTrigger value="today" className="gap-1.5 text-sm py-2">
                      <Flag className="h-3.5 w-3.5 hidden sm:block" />
                      <span className="truncate">{t('home.today')} ({todayTasks.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="upcoming" className="gap-1.5 text-sm py-2">
                      <Clock className="h-3.5 w-3.5 hidden sm:block" />
                      <span className="truncate">{t('home.upcoming')} ({upcomingTasks.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="low" className="gap-1.5 text-sm py-2">
                      <span className="truncate">{t('home.lowPriority')} ({lowPriorityTasks.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="gap-1.5 text-sm py-2">
                      <CheckCircle2 className="h-3.5 w-3.5 hidden sm:block" />
                      <span className="truncate">{t('home.done')} ({completedTasks.length})</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="today" className="space-y-2.5 max-h-[350px] overflow-y-auto">
                    {todayTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">{t('home.noPriorityTasks')}</p>
                    ) : todayTasks.map((task) => (
                      <TaskCard key={task.id} task={{ ...task, priority: task.priority as 'low' | 'medium' | 'high' }} onToggle={handleToggleTask} onDelete={handleDeleteTask} />
                    ))}
                  </TabsContent>
                  <TabsContent value="upcoming" className="space-y-2.5 max-h-[350px] overflow-y-auto">
                    {upcomingTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">{t('home.noUpcomingTasks')}</p>
                    ) : upcomingTasks.map((task) => (
                      <TaskCard key={task.id} task={{ ...task, priority: task.priority as 'low' | 'medium' | 'high' }} onToggle={handleToggleTask} onDelete={handleDeleteTask} />
                    ))}
                  </TabsContent>
                  <TabsContent value="low" className="space-y-2.5 max-h-[350px] overflow-y-auto">
                    {lowPriorityTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">{t('home.noLowPriorityTasks')}</p>
                    ) : lowPriorityTasks.map((task) => (
                      <TaskCard key={task.id} task={{ ...task, priority: task.priority as 'low' | 'medium' | 'high' }} onToggle={handleToggleTask} onDelete={handleDeleteTask} />
                    ))}
                  </TabsContent>
                  <TabsContent value="completed" className="space-y-2.5 max-h-[350px] overflow-y-auto">
                    {completedTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">{t('home.noCompletedTasks')}</p>
                    ) : completedTasks.map((task) => (
                      <TaskCard key={task.id} task={{ ...task, priority: task.priority as 'low' | 'medium' | 'high' }} onToggle={handleToggleTask} onDelete={handleDeleteTask} />
                    ))}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <WellnessCard />
          </div>
        </div>
      </div>
    </main>
  );
}
