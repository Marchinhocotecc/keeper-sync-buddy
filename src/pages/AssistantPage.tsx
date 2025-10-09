import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AssistantPanel from '@/components/AssistantPanel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

export default function AssistantPage() {
  const { t } = useTranslation();
  const [showPanel, setShowPanel] = useState(false);

  const handleSuggestion = () => {
    setShowPanel(true);
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t('assistant.title')}</h1>
      
      {!showPanel && (
        <Card className="p-8 text-center">
          <Button onClick={handleSuggestion} size="lg" className="gap-2">
            <Sparkles className="h-5 w-5" />
            {t('assistant.getSuggestion')}
          </Button>
          <p className="text-muted-foreground mt-4">
            {t('assistant.suggestionHint')}
          </p>
        </Card>
      )}
      
      {showPanel && <AssistantPanel />}
    </main>
  );
}
