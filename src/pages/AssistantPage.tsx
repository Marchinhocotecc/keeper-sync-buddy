import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AssistantPanel from '@/components/AssistantPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

export default function AssistantPage() {
  const { t } = useTranslation();
  const [showPanel, setShowPanel] = useState(false);

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">{t('assistant.title')}</h1>
          <p className="page-subtitle">Il tuo assistente personale AI</p>
        </div>
        
        {!showPanel ? (
          <Card className="app-card max-w-2xl mx-auto">
            <CardContent className="pt-10 sm:pt-12 pb-10 sm:pb-12 text-center px-4 sm:px-6">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5 sm:mb-6">
                <Sparkles className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
              </div>
              <h2 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3">Benvenuto nell'Assistente AI</h2>
              <p className="text-sm text-muted-foreground mb-6 sm:mb-8 max-w-md mx-auto">
                Chiedi consigli, suggerimenti o aiuto per organizzare la tua giornata
              </p>
              <Button onClick={() => setShowPanel(true)} size="lg" className="gap-2 shadow-sm h-11 sm:h-12">
                <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
                Inizia una conversazione
              </Button>
            </CardContent>
          </Card>
        ) : (
          <AssistantPanel />
        )}
      </div>
    </main>
  );
}
