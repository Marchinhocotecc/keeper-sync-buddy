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
    <main className="min-h-screen bg-background">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">{t('assistant.title')}</h1>
          <p className="page-subtitle">{t('assistant.subtitle')}</p>
        </div>
        
        {!showPanel ? (
          <Card className="app-card max-w-2xl mx-auto">
            <CardContent className="pt-10 sm:pt-12 pb-10 sm:pb-12 text-center px-4 sm:px-6">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-5 sm:mb-6 shadow-lg">
                <Sparkles className="h-8 w-8 sm:h-10 sm:w-10 text-primary-foreground" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-3">Ciao! Sono LUMI ✨</h2>
              <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8 max-w-md mx-auto">
                Il tuo assistente personale per organizzare la giornata con semplicità e leggerezza
              </p>
              <Button 
                onClick={() => setShowPanel(true)} 
                size="lg" 
                className="gap-2 shadow-md h-12 sm:h-14 px-6 sm:px-8 rounded-xl lumi-button text-base"
              >
                <Sparkles className="h-5 w-5" />
                Iniziamo a chiacchierare
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
