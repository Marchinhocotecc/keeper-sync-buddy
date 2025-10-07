import React from 'react';
import { useTranslation } from 'react-i18next';
import AssistantPanel from '@/components/AssistantPanel';

export default function AssistantPage() {
  const { t } = useTranslation();

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t('assistant.title')}</h1>
      <AssistantPanel />
    </main>
  );
}
