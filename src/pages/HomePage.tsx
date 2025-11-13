import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { TaskCard } from '@/components/TaskCard';
import { AddTaskForm } from '@/components/AddTaskForm';
import { WellnessCard } from '@/components/WellnessCard';
import { Plus, AlertCircle } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function HomePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [userId, setUserId] = useState<string | undefined>();
  const { tasks, isLoading, isError, error, addTask, toggleTask, deleteTask } = useTasks(userId);
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id);
      if (data?.user?.email) {
        const name = data.user.email.split('@')[0];
        setUserName(name.charAt(0).toUpperCase() + name.slice(1));
      }
    });
  }, []);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!Array.isArray(tasks) || tasks.length === 0) return;

    tasks.forEach((task) => {
      if (task.due_date && !task.completed && 'Notification' in window && Notification.permission === 'granted') {
        const dueDate = new Date(task.due_date);
        const now = new Date();
        const timeDiff = dueDate.getTime() - now.getTime();

        if (timeDiff > 0 && timeDiff < 24 * 60 * 60 * 1000) {
          setTimeout(() => {
            new Notification(t('home.taskReminder'), {
              body: task.title,
              icon: '/favicon.ico'
            });
          }, timeDiff);
        }
      }
    });
  }, [tasks, t]);

  const handleAddTask = async (title: string, priority: 'low' | 'medium' | 'high') => {
    await addTask.mutateAsync({ title, priority });
    setShowAddForm(false);
  };

  const handleToggleTask = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      toggleTask.mutate({ id, completed: task.completed });
    }
  };

  const handleDeleteTask = (id: string) => {
    deleteTask.mutate(id);
  };

  const activeTasks = Array.isArray(tasks) ? tasks.filter((t) => !t.completed) : [];
  const completedTasks = Array.isArray(tasks) ? tasks.filter((t) => t.completed) : [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <div className="container mx-auto px-6 py-12 max-w-screen-xl">
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-muted-foreground">{t('home.loading')}</div>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-muted/30">
        <div className="container mx-auto px-6 py-12 max-w-screen-xl">
          <Alert variant="destructive" className="max-w-2xl">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error instanceof Error ? error.message : t('home.errorLoadingTasks')}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-6 py-8 max-w-screen-xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {t('home.greeting', { name: userName || t('home.defaultName') })}
          </h1>
          <p className="text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="border-b border-border/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-semibold">
                    {t('home.todayActivities')}
                  </CardTitle>
                  <Button 
                    onClick={() => setShowAddForm(true)} 
                    size="sm" 
                    className="gap-2 shadow-sm"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('home.addTask')}</span>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                {showAddForm && (
                  <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border/50">
                    <AddTaskForm
                      onAdd={handleAddTask}
                      onCancel={() => setShowAddForm(false)}
                    />
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">
                      {t('home.active')} ({activeTasks.length})
                    </h3>
                    {activeTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        {t('home.noActiveTasks')}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {activeTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={{
                              ...task,
                              priority: task.priority as 'low' | 'medium' | 'high'
                            }}
                            onToggle={handleToggleTask}
                            onDelete={handleDeleteTask}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {completedTasks.length > 0 && (
                    <div className="pt-4 border-t border-border/50">
                      <h3 className="text-sm font-medium text-muted-foreground mb-3">
                        {t('home.completed')} ({completedTasks.length})
                      </h3>
                      <div className="space-y-2">
                        {completedTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={{
                              ...task,
                              priority: task.priority as 'low' | 'medium' | 'high'
                            }}
                            onToggle={handleToggleTask}
                            onDelete={handleDeleteTask}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
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
