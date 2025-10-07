import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { TaskCard } from '@/components/TaskCard';
import { AddTaskForm } from '@/components/AddTaskForm';
import { WellnessCard } from '@/components/WellnessCard';
import { DailyActivities } from '@/components/DailyActivities';
import { Plus, AlertCircle } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function HomePage() {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const { tasks, isLoading, isError, error, addTask, toggleTask, deleteTask } = useTasks();

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
          <div className="animate-pulse text-muted-foreground">Loading...</div>
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
            {error instanceof Error ? error.message : 'Failed to load tasks'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">{t('home.tasks')}</h2>
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
                  No active tasks. Add one to get started!
                </p>
              )}
              {activeTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={{
                    id: task.id,
                    title: task.title,
                    completed: task.completed,
                    priority: task.priority,
                    dueDate: task.due_date,
                  }}
                  onToggle={handleToggleTask}
                  onDelete={handleDeleteTask}
                />
              ))}
            </div>

            {completedTasks.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-3 text-muted-foreground">
                  Completed
                </h3>
                <div className="space-y-3">
                  {completedTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={{
                        id: task.id,
                        title: task.title,
                        completed: task.completed,
                        priority: task.priority,
                        dueDate: task.due_date,
                      }}
                      onToggle={handleToggleTask}
                      onDelete={handleDeleteTask}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <DailyActivities />
          <WellnessCard />
        </div>
      </div>
    </main>
  );
}
