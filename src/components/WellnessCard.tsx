import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Footprints, Moon, Brain } from "lucide-react";
import { useWellness } from "@/hooks/useWellness";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export function WellnessCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [user, setUser] = React.useState<any>(null);
  const { wellnessData, isLoading, updateWellness } = useWellness(user?.id);
  const todayData = wellnessData[0];
  
  const [steps, setSteps] = useState(todayData?.steps?.toString() || "");
  const [sleep, setSleep] = useState(todayData?.sleep?.toString() || "");
  const [meditation, setMeditation] = useState(todayData?.meditation_minutes?.toString() || "");

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user));
  }, []);

  React.useEffect(() => {
    if (todayData) {
      setSteps(todayData.steps?.toString() || "");
      setSleep(todayData.sleep?.toString() || "");
      setMeditation(todayData.meditation_minutes?.toString() || "");
    }
  }, [todayData]);

  const handleSave = () => {
    updateWellness.mutate({
      date: new Date().toISOString().split('T')[0],
      steps: steps ? parseInt(steps) : undefined,
      sleep: sleep ? parseInt(sleep) : undefined,
      meditation_minutes: meditation ? parseInt(meditation) : undefined,
    });
  };

  const sleepProgress = sleep ? Math.min((parseInt(sleep) / 8) * 100, 100) : 0;
  const stepsProgress = steps ? Math.min((parseInt(steps) / 10000) * 100, 100) : 0;
  const meditationProgress = meditation ? Math.min((parseInt(meditation) / 20) * 100, 100) : 0;

  if (isLoading) {
    return <Card className="p-6"><p className="text-muted-foreground">{t('home.loading')}</p></Card>;
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">{t('home.wellness')}</h3>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="steps" className="flex items-center gap-2">
            <Footprints className="h-4 w-4 text-primary" />
            {t('home.steps')}
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
            {t('home.sleepHours')}
          </Label>
          <Input
            id="sleep"
            type="number"
            placeholder="8"
            value={sleep}
            onChange={(e) => setSleep(e.target.value)}
          />
          <Progress value={sleepProgress} className="h-2" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="meditation" className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-secondary" />
            {t('home.meditationMinutes')}
          </Label>
          <Input
            id="meditation"
            type="number"
            placeholder="20"
            value={meditation}
            onChange={(e) => setMeditation(e.target.value)}
          />
          <Progress value={meditationProgress} className="h-2" />
        </div>

        <Button onClick={handleSave} className="w-full" disabled={updateWellness.isPending}>
          {updateWellness.isPending ? t('home.saving') : t('home.saveWellness')}
        </Button>
      </div>
    </Card>
  );
}