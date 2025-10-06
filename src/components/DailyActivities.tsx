import { Card } from "@/components/ui/card";
import { CheckCircle2, Circle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  label: string;
  completed: boolean;
}

export function DailyActivities() {
  const [activities, setActivities] = useState<Activity[]>([
    { id: "1", label: "Morning meditation", completed: false },
    { id: "2", label: "Drink 8 glasses of water", completed: false },
    { id: "3", label: "30 min exercise", completed: false },
    { id: "4", label: "Read for 20 minutes", completed: false },
  ]);

  const toggleActivity = (id: string) => {
    setActivities((prev) =>
      prev.map((activity) =>
        activity.id === id ? { ...activity, completed: !activity.completed } : activity
      )
    );
  };

  const completedCount = activities.filter((a) => a.completed).length;
  const progress = (completedCount / activities.length) * 100;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Today's Activities</h3>
        <span className="text-sm font-medium text-primary">
          {completedCount}/{activities.length}
        </span>
      </div>
      <div className="space-y-2">
        {activities.map((activity) => (
          <button
            key={activity.id}
            onClick={() => toggleActivity(activity.id)}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-lg transition-all hover:bg-muted/50",
              activity.completed && "opacity-60"
            )}
          >
            {activity.completed ? (
              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
            <span
              className={cn(
                "text-left font-medium",
                activity.completed && "line-through text-muted-foreground"
              )}
            >
              {activity.label}
            </span>
          </button>
        ))}
      </div>
      {progress === 100 && (
        <div className="mt-4 p-3 bg-success/10 border border-success/20 rounded-lg text-center">
          <p className="text-sm font-medium text-success">🎉 All activities completed!</p>
        </div>
      )}
    </Card>
  );
}
