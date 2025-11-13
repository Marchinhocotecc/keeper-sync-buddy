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
      <div className="container mx-auto px-6 py-8 max-w-screen-xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{t('assistant.title')}</h1>
          <p className="text-muted-foreground">Il tuo assistente personale AI</p>
        </div>
        
        {!showPanel ? (
          <Card className="border-border/50 shadow-sm max-w-2xl mx-auto">
            <CardContent className="pt-12 pb-12 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-3">Benvenuto nell'Assistente AI</h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Chiedi consigli, suggerimenti o aiuto per organizzare la tua giornata
              </p>
              <Button onClick={() => setShowPanel(true)} size="lg" className="gap-2 shadow-sm">
                <Sparkles className="h-5 w-5" />
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
