import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Footprints, Moon, Weight } from "lucide-react";
import { useWellness } from "@/hooks/useWellness";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export function WellnessCard() {
  const { toast } = useToast();
  const [user, setUser] = React.useState<any>(null);
  const { wellnessData, isLoading, updateWellness } = useWellness(user?.id);
  const todayData = wellnessData[0];
  
  const [steps, setSteps] = useState(todayData?.steps?.toString() || "");
  const [sleep, setSleep] = useState(todayData?.sleep_hours?.toString() || "");
  const [weight, setWeight] = useState(todayData?.weight?.toString() || "");

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user));
  }, []);

  React.useEffect(() => {
    if (todayData) {
      setSteps(todayData.steps?.toString() || "");
      setSleep(todayData.sleep_hours?.toString() || "");
      setWeight(todayData.weight?.toString() || "");
    }
  }, [todayData]);

  const handleSave = () => {
    updateWellness.mutate({
      date: new Date().toISOString().split('T')[0],
      steps: steps ? parseInt(steps) : undefined,
      sleep_hours: sleep ? parseFloat(sleep) : undefined,
      weight: weight ? parseFloat(weight) : undefined,
    });
  };

  const stepsProgress = steps ? Math.min((parseInt(steps) / 10000) * 100, 100) : 0;
  const sleepProgress = sleep ? Math.min((parseFloat(sleep) / 8) * 100, 100) : 0;

  if (isLoading) {
    return <Card className="p-6"><p className="text-muted-foreground">Loading wellness data...</p></Card>;
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Daily Wellness</h3>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="steps" className="flex items-center gap-2">
            <Footprints className="h-4 w-4 text-primary" />
            Steps
          </Label>
          <Input
            id="steps"
            type="number"
            placeholder="10000"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
          />
          <Progress value={stepsProgress} className="h-2" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sleep" className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-accent" />
            Sleep (hours)
          </Label>
          <Input
            id="sleep"
            type="number"
            step="0.5"
            placeholder="8"
            value={sleep}
            onChange={(e) => setSleep(e.target.value)}
          />
          <Progress value={sleepProgress} className="h-2" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="weight" className="flex items-center gap-2">
            <Weight className="h-4 w-4 text-success" />
            Weight (kg)
          </Label>
          <Input
            id="weight"
            type="number"
            step="0.1"
            placeholder="70"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </div>

        <Button onClick={handleSave} className="w-full" disabled={updateWellness.isPending}>
          {updateWellness.isPending ? "Saving..." : "Save Wellness Data"}
        </Button>
      </div>
    </Card>
  );
}
