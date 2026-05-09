import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TaskCard } from '@/components/TaskCard';
import { AddTaskForm } from '@/components/AddTaskForm';
import { WellnessCard } from '@/components/WellnessCard';
import { FinancialInsightCard } from '@/components/FinancialInsightCard';
import { WeeklySummaryCard } from '@/components/WeeklySummaryCard';
import { MonthlySummaryCard } from '@/components/MonthlySummaryCard';
import { Plus, AlertCircle, CheckCircle2, Flag, ChevronRight, Flame, Loader2 } from 'lucide-react';
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
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { PageTransition } from '@/components/PageTransition';
import { PullToRefresh } from '@/components/PullToRefresh';
import { formatCurrency } from '@/utils/currency';
import { useQueryClient } from '@tanstack/react-query';
import { DailyBudgetRing } from '@/components/DailyBudgetRing';
import { HomeChatBar } from '@/components/HomeChatBar';
import { CheckInSheet } from '@/components/CheckInSheet';
import { SampleExpenseBanner } from '@/components/SampleExpenseBanner';
import { useTodayCheckin, useRecentCheckinDates } from '@/hooks/useDailyCheckin';
import { computeStreak } from '@/services/dailyCheckinService';

function getTimeGreetingKey(): string {
  const h = new Date().getHours();
  if (h < 12) return 'home.greetingMorning';
  if (h < 18) return 'home.greetingAfternoon';
  return 'home.greetingEvening';
}

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userId, userName, isLoading, error } = useHomeData();
  const { tasks, addTask, toggleTask, deleteTask } = useTasks(userId);
  const { addEvent, updateEvent, deleteEvent } = useCalendarEvents(userId);
  const { expenses } = useExpenses(userId);
  const { insights, financialInsight, weeklySummary, monthlySummary } = useHomeInsights(userId);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const { data: todayCheckin } = useTodayCheckin(userId);
  const { data: checkinDates } = useRecentCheckinDates(userId);

  // Auto-open evening check-in: after 21:00 if not done today (only first time per session)
  useEffect(() => {
    if (!userId) return;
    const seenKey = `checkin_seen_${new Date().toDateString()}`;
    if (sessionStorage.getItem(seenKey)) return;
    const now = new Date();
    if (now.getHours() >= 21 && !todayCheckin) {
      const t = setTimeout(() => {
        setShowCheckin(true);
        sessionStorage.setItem(seenKey, '1');
      }, 1500); // wait until page settled
      return () => clearTimeout(t);
    }
  }, [userId, todayCheckin]);

  // Deep-link from notification tap: ?checkin=open opens the sheet immediately
  useEffect(() => {
    if (searchParams.get('checkin') === 'open') {
      setShowCheckin(true);
      // strip the query param so a refresh doesn't reopen it
      const next = new URLSearchParams(searchParams);
      next.delete('checkin');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const todayTasks = tasks.filter((t) => !t.completed && t.priority === 'high');
  const completedToday = tasks.filter((t) => t.completed).length;
  const totalTodayTasks = tasks.filter((t) => t.priority === 'high').length;
  const upcomingTasks = tasks.filter((t) => !t.completed && t.priority !== 'high');

  // Calculate streak: combines task completions + daily check-ins (Blocco B)
  const streak = useMemo(() => {
    const completedTasks = tasks.filter(t => t.completed && t.due_date);
    const datesWithCompletions = new Set<string>();
    completedTasks.forEach(t => {
      if (t.due_date) datesWithCompletions.add(t.due_date.split('T')[0]);
    });
    const todayKey = new Date().toISOString().split('T')[0];
    if (completedToday > 0) datesWithCompletions.add(todayKey);
    const checkins = checkinDates || new Set<string>();
    const hasActivityToday = completedToday > 0 || !!todayCheckin;
    return computeStreak(datesWithCompletions, checkins, hasActivityToday);
  }, [tasks, completedToday, checkinDates, todayCheckin]);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weekExpenses = expenses
    .filter(e => new Date(e.date) >= weekStart)
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const progressPercent = totalTodayTasks > 0 ? Math.round((completedToday / tasks.length) * 100) : 0;

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
      if (import.meta.env.DEV) console.error('Error syncing task with calendar:', err);
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

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const dateLocale = `${i18n.language}-${i18n.language.toUpperCase()}`;

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="page-container">
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-6 w-96 mb-8" />
          <Skeleton className="h-16 rounded-xl mb-6" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background">
        <div className="page-container">
          <Alert variant="destructive" className="max-w-2xl rounded-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error.message || t('home.errorLoading')}</AlertDescription>
          </Alert>
        </div>
      </main>
    );
  }

  const insightCards = insights.filter(insight =>
    (insight.type === "critical_risk" || insight.type === "soft_warning") && insight.financialInsight ||
    insight.type === "weekly_summary" && insight.weeklySummary ||
    insight.type === "monthly_summary" && insight.monthlySummary
  );

  const visibleTasks = showAllTasks ? [...todayTasks, ...upcomingTasks] : todayTasks.slice(0, 3);

  return (
    <PageTransition>
      <main className="min-h-screen bg-background pb-20 sm:pb-0">
        <PullToRefresh onRefresh={handleRefresh}>
          <div className="page-container">
            {/* Header with greeting + streak badge */}
            <div className="page-header animate-fade-in">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="page-title truncate">{t(getTimeGreetingKey(), { name: userName })}</h1>
                  <p className="page-subtitle">
                    {new Date().toLocaleDateString(dateLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
                {streak >= 1 && (
                  <button
                    type="button"
                    onClick={() => setShowCheckin(true)}
                    className="shrink-0 mt-1 flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[12px] font-semibold animate-pop-in pressable"
                    aria-label={t('checkin.open', { defaultValue: 'Apri check-in' })}
                  >
                    <Flame className="h-3.5 w-3.5" />
                    <span className="tabular-nums">{streak}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Sticky chat bar (Blocco B #6) */}
            <HomeChatBar />

            {/* Sample expense tutorial banner (Blocco C) — shows after onboarding until dismissed or sample deleted */}
            <SampleExpenseBanner userId={userId} expenses={expenses} />

            {/* Daily Budget Ring — answers "posso spendere oggi?" in 1 second */}
            <div className="mb-4">
              <DailyBudgetRing
                userId={userId}
                onSetBudget={() => navigate('/expenses')}
                onRingTap={() => navigate('/expenses')}
              />
            </div>

            {/* Compact stats row (task progress + week expenses) */}
            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="card-ios p-3.5 flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4.5 w-4.5 text-success" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold">
                    {t('home.completedTasks')}
                  </p>
                  <p className="text-[15px] font-semibold tabular-nums leading-tight">
                    {completedToday}
                    {tasks.length > 0 && (
                      <span className="text-muted-foreground font-normal text-[13px]"> / {tasks.length}</span>
                    )}
                  </p>
                </div>
              </div>
              <Link
                to="/expenses"
                className="card-ios p-3.5 flex items-center gap-2.5 pressable hover:bg-muted/30 transition-colors"
              >
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Flag className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold">
                    {t('home.weekExpenses')}
                  </p>
                  <p className="text-[15px] font-semibold tabular-nums leading-tight">
                    {formatCurrency(weekExpenses, i18n.language, 0)}
                  </p>
                </div>
              </Link>
            </div>

            {/* Daily Nudge */}
            {userId && (
              <div className="mb-5 animate-fade-in">
                <DailyNudge userId={userId} />
              </div>
            )}

            {/* Insights horizontal scroll */}
            {insightCards.length > 0 && (
              <div className="mb-5 animate-fade-in">
                <ScrollArea className="w-full">
                  <div className="flex gap-4 pb-2">
                    {insightCards.map((insight, idx) => {
                      if ((insight.type === "critical_risk" || insight.type === "soft_warning") && insight.financialInsight && userId) {
                        return (
                          <div key={`fi-${idx}`} className="min-w-[300px] sm:min-w-0 sm:flex-1">
                            <FinancialInsightCard insight={insight.financialInsight} userId={userId} />
                          </div>
                        );
                      }
                      if (insight.type === "weekly_summary" && insight.weeklySummary) {
                        return (
                          <div key={`ws-${idx}`} className="min-w-[300px] sm:min-w-0 sm:flex-1">
                            <WeeklySummaryCard summary={insight.weeklySummary} />
                          </div>
                        );
                      }
                      if (insight.type === "monthly_summary" && insight.monthlySummary) {
                        return (
                          <div key={`ms-${idx}`} className="min-w-[300px] sm:min-w-0 sm:flex-1">
                            <MonthlySummaryCard summary={insight.monthlySummary} />
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>
            )}

            {/* Tasks + Wellness */}
            <div className="grid gap-5 sm:gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-5 sm:space-y-6">
                <Card>
                  <CardHeader className="border-b border-border px-4 sm:px-6 py-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2 text-foreground">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                        {t('home.myTasks')}
                      </CardTitle>
                      <Button onClick={() => setShowAddForm(true)} size="sm" className="gap-2 h-9 text-sm" disabled={addTask.isPending}>
                        {addTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
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

                    {visibleTasks.length === 0 && !showAllTasks ? (
                      <div className="text-center py-8">
                        <Flag className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground mb-3">{t('home.noPriorityTasks')}</p>
                        <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)} className="gap-2">
                          <Plus className="h-3.5 w-3.5" />{t('home.add')}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {visibleTasks.map((task) => (
                          <TaskCard key={task.id} task={{ ...task, priority: task.priority as 'low' | 'medium' | 'high' }} onToggle={handleToggleTask} onDelete={handleDeleteTask} />
                        ))}
                      </div>
                    )}

                    {(todayTasks.length > 3 || upcomingTasks.length > 0) && (
                      <button
                        onClick={() => setShowAllTasks(!showAllTasks)}
                        className="flex items-center gap-1 mt-4 text-sm text-primary hover:underline"
                      >
                        {showAllTasks ? t('home.showLess') : t('home.viewAll', { count: todayTasks.length + upcomingTasks.length })}
                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showAllTasks ? 'rotate-90' : ''}`} />
                      </button>
                    )}
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-6">
                <WellnessCard />
              </div>
            </div>
          </div>
        </PullToRefresh>

        {/* Evening check-in sheet (Blocco B #3) — auto-opens after 21:00 if not done */}
        <CheckInSheet
          open={showCheckin}
          onOpenChange={setShowCheckin}
          currentStreak={streak}
        />
      </main>
    </PageTransition>
  );
}
