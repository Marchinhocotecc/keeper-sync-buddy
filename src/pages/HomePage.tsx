import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { TaskCard } from '@/components/TaskCard';
import { AddTaskForm } from '@/components/AddTaskForm';
import { WellnessCard } from '@/components/WellnessCard';
import { Plus, AlertCircle, Trash2 } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function HomePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [userId, setUserId] = useState<string | undefined>();
  const { tasks, isLoading, isError, error, addTask, toggleTask, deleteTask } = useTasks(userId);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id);
    });
  }, []);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Schedule notifications for tasks
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
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-muted-foreground">{t('home.loading')}</div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : t('home.errorLoadingTasks')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">{t('home.todayActivities')}</h2>
              <Button onClick={() => setShowAddForm(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                {t('home.addTask')}
              </Button>
            </div>

            {showAddForm && (
              <AddTaskForm
                onAdd={handleAddTask}
                onCancel={() => setShowAddForm(false)}
              />
            )}

            <div className="space-y-3">
              {activeTasks.length === 0 && !showAddForm && (
                <p className="text-center text-muted-foreground py-8">
                  {t('home.noActiveTasks')}
                </p>
              )}
              {activeTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2">
                  <div className="flex-1">
                    <TaskCard
                      task={{
                        id: task.id,
                        title: task.title,
                        completed: task.completed,
                        priority: task.priority as "low" | "medium" | "high",
                        dueDate: task.due_date,
                      }}
                      onToggle={handleToggleTask}
                      onDelete={handleDeleteTask}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteTask(task.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {completedTasks.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-3 text-muted-foreground">
                  {t('home.completed')}
                </h3>
                <div className="space-y-3">
                  {completedTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2">
                      <div className="flex-1">
                        <TaskCard
                          task={{
                            id: task.id,
                            title: task.title,
                            completed: task.completed,
                            priority: task.priority as "low" | "medium" | "high",
                            dueDate: task.due_date,
                          }}
                          onToggle={handleToggleTask}
                          onDelete={handleDeleteTask}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteTask(task.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <WellnessCard />
        </div>
      </div>
    </main>
  );
}