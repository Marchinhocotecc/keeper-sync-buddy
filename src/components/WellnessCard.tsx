import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Heart, Droplets, Moon } from "lucide-react";

export function WellnessCard() {
  const wellnessData = [
    { icon: Heart, label: "Exercise", value: 60, color: "text-success" },
    { icon: Droplets, label: "Water", value: 75, color: "text-primary" },
    { icon: Moon, label: "Sleep", value: 40, color: "text-accent" },
  ];

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-muted/30">
      <h3 className="text-lg font-semibold mb-4">Daily Wellness</h3>
      <div className="space-y-4">
        {wellnessData.map((item) => (
          <div key={item.label} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <item.icon className={cn("h-4 w-4", item.color)} />
                <span className="font-medium">{item.label}</span>
              </div>
              <span className="text-muted-foreground">{item.value}%</span>
            </div>
            <Progress value={item.value} className="h-2" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function cn(...inputs: string[]) {
  return inputs.filter(Boolean).join(" ");
}
