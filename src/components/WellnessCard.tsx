import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Footprints, Moon, Brain, Heart } from "lucide-react";
import { useWellness } from "@/hooks/useWellness";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

export function WellnessCard() {
  const [user, setUser] = useState<any>(null);
  const { wellnessData, isLoading, updateWellness } = useWellness(user?.id);
  const todayData = wellnessData[0];
  
  const [steps, setSteps] = useState("");
  const [sleep, setSleep] = useState("");
  const [meditation, setMeditation] = useState("");
  const [heartRate, setHeartRate] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user));
  }, []);

  useEffect(() => {
    if (todayData) {
      setSteps(todayData.steps?.toString() || "");
      setSleep(todayData.sleep?.toString() || "");
      setMeditation(todayData.meditation_minutes?.toString() || "");
      setHeartRate(todayData.heart_rate?.toString() || "");
    }
  }, [todayData]);

  const handleSave = () => {
    updateWellness.mutate({
      date: new Date().toISOString().split('T')[0],
      steps: steps ? parseInt(steps) : undefined,
      sleep: sleep ? parseInt(sleep) : undefined,
      meditation_minutes: meditation ? parseInt(meditation) : undefined,
      heart_rate: heartRate ? parseInt(heartRate) : undefined,
    });
  };

  const sleepProgress = sleep ? Math.min((parseInt(sleep) / 8) * 100, 100) : 0;
  const stepsProgress = steps ? Math.min((parseInt(steps) / 10000) * 100, 100) : 0;
  const meditationProgress = meditation ? Math.min((parseInt(meditation) / 20) * 100, 100) : 0;

  const wellnessScore = Math.round((sleepProgress + stepsProgress + meditationProgress) / 3);

  if (isLoading) {
    return (
      <Card className="p-6 border-border/50 shadow-sm">
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-border/50 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold">Benessere</h3>
        {wellnessScore > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 animate-fade-in">
            <span className="text-sm font-medium text-primary">{wellnessScore}%</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="steps" className="flex items-center gap-2 text-sm font-medium">
            <Footprints className="h-4 w-4 text-primary" />
            Passi (obiettivo: 10.000)
          </Label>
          <Input
            id="steps"
            type="number"
            placeholder="0"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            className="transition-all"
          />
          {steps && <Progress value={stepsProgress} className="h-2 animate-scale-in" />}
        </div>

        <div className="space-y-2">
          <Label htmlFor="sleep" className="flex items-center gap-2 text-sm font-medium">
            <Moon className="h-4 w-4 text-accent" />
            Ore di sonno (obiettivo: 8h)
          </Label>
          <Input
            id="sleep"
            type="number"
            placeholder="0"
            value={sleep}
            onChange={(e) => setSleep(e.target.value)}
            className="transition-all"
          />
          {sleep && <Progress value={sleepProgress} className="h-2 animate-scale-in" />}
        </div>

        <div className="space-y-2">
          <Label htmlFor="meditation" className="flex items-center gap-2 text-sm font-medium">
            <Brain className="h-4 w-4 text-secondary" />
            Meditazione (obiettivo: 20min)
          </Label>
          <Input
            id="meditation"
            type="number"
            placeholder="0"
            value={meditation}
            onChange={(e) => setMeditation(e.target.value)}
            className="transition-all"
          />
          {meditation && <Progress value={meditationProgress} className="h-2 animate-scale-in" />}
        </div>

        <div className="space-y-2">
          <Label htmlFor="heartRate" className="flex items-center gap-2 text-sm font-medium">
            <Heart className="h-4 w-4 text-destructive" />
            Battito cardiaco medio (opzionale)
          </Label>
          <Input
            id="heartRate"
            type="number"
            placeholder="70"
            value={heartRate}
            onChange={(e) => setHeartRate(e.target.value)}
            className="transition-all"
          />
        </div>

        <Button 
          onClick={handleSave} 
          className="w-full transition-all hover-scale" 
          disabled={updateWellness.isPending}
        >
          {updateWellness.isPending ? "Salvataggio..." : "Salva"}
        </Button>
      </div>
    </Card>
  );
}
