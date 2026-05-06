import React from 'react';
import { useTranslation } from 'react-i18next';
import AssistantPanel from '@/components/AssistantPanel';
import { motion } from 'framer-motion';

export default function AssistantPage() {
  const { t } = useTranslation();

  return (
    <main className="min-h-screen bg-background pb-20 sm:pb-0">
      <div className="page-container">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="page-header">
          <h1 className="page-title">{t('assistant.title')}</h1>
          <p className="page-subtitle">{t('assistant.subtitle')}</p>
        </motion.div>
        
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <AssistantPanel />
        </motion.div>
      </div>
    </main>
  );
}
