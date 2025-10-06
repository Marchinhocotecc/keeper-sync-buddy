import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TaskCard, Task } from "@/components/TaskCard";
import { AddTaskForm } from "@/components/AddTaskForm";
import { DailyActivities } from "@/components/DailyActivities";
import { WellnessCard } from "@/components/WellnessCard";
import { Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

const Index = () => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: "1",
      title: "Review project proposal",
      completed: false,
      priority: "high",
      dueDate: new Date().toISOString(),
    },
    {
      id: "2",
      title: "Update team documentation",
      completed: false,
      priority: "medium",
    },
    {
      id: "3",
      title: "Call with design team",
      completed: true,
      priority: "low",
    },
  ]);

  const handleAddTask = (title: string, priority: "low" | "medium" | "high") => {
    const newTask: Task = {
      id: Date.now().toString(),
      title,
      completed: false,
      priority,
    };
    setTasks([newTask, ...tasks]);
    setShowAddForm(false);
    toast.success("Task added successfully!");
  };

  const handleToggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      )
    );
  };

  const handleDeleteTask = (id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
    toast.success("Task deleted");
  };

  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Daily Sync Keeper
            </h1>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Sparkles className="h-4 w-4" />
            AI Assistant
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Left Column - Tasks */}
          <div className="md:col-span-2 space-y-6">
            {/* Tasks Section */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Tasks</h2>
                {!showAddForm && (
                  <Button onClick={() => setShowAddForm(true)} size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Task
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                {showAddForm && (
                  <AddTaskForm
                    onAdd={handleAddTask}
                    onCancel={() => setShowAddForm(false)}
                  />
                )}

                {activeTasks.length > 0 ? (
                  activeTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onToggle={handleToggleTask}
                      onDelete={handleDeleteTask}
                    />
                  ))
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No active tasks. Add one to get started!</p>
                  </div>
                )}

                {completedTasks.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mt-8 mb-3">
                      <h3 className="text-sm font-semibold text-muted-foreground">
                        Completed ({completedTasks.length})
                      </h3>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    {completedTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onToggle={handleToggleTask}
                        onDelete={handleDeleteTask}
                      />
                    ))}
                  </>
                )}
              </div>
            </section>
          </div>

          {/* Right Column - Activities & Wellness */}
          <div className="space-y-6">
            <DailyActivities />
            <WellnessCard />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
