import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';

export default function AssistantPage() {
  const { t } = useTranslation();

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t('assistant.title')}</h1>
      <Card className="p-6">
        <p className="text-muted-foreground">AI Assistant chat coming soon...</p>
      </Card>
    </main>
  );
}
