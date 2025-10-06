import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { TaskCard, Task } from '@/components/TaskCard';
import { AddTaskForm } from '@/components/AddTaskForm';
import { WellnessCard } from '@/components/WellnessCard';
import { DailyActivities } from '@/components/DailyActivities';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function HomePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data) {
        setTasks(data.map(todo => ({
          id: todo.id,
          title: todo.title,
          completed: todo.completed,
          priority: todo.priority || 'medium',
          dueDate: todo.due_date,
        })));
      }
    } catch (error: any) {
      console.error('Error fetching tasks:', error);
      toast({
        title: 'Error loading tasks',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = async (title: string, priority: 'low' | 'medium' | 'high') => {
    try {
      const { data, error } = await supabase
        .from('todos')
        .insert([{ title, priority, completed: false }])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const newTask: Task = {
          id: data.id,
          title: data.title,
          completed: data.completed,
          priority: data.priority || 'medium',
        };
        setTasks([newTask, ...tasks]);
        setShowAddForm(false);
        toast({
          title: 'Task added',
          description: 'Your task has been created successfully',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error adding task',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleToggleTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    try {
      const { error } = await supabase
        .from('todos')
        .update({ completed: !task.completed })
        .eq('id', id);

      if (error) throw error;

      setTasks(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
    } catch (error: any) {
      toast({
        title: 'Error updating task',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      const { error } = await supabase.from('todos').delete().eq('id', id);

      if (error) throw error;

      setTasks(tasks.filter((t) => t.id !== id));
      toast({
        title: 'Task deleted',
        description: 'Your task has been removed',
      });
    } catch (error: any) {
      toast({
        title: 'Error deleting task',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-muted-foreground">Loading...</p>
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
                  task={task}
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
                      task={task}
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
