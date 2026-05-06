import React from 'react';
import { useTranslation } from 'react-i18next';
import AssistantPanel from '@/components/AssistantPanel';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export default function AssistantPage() {
  const { t } = useTranslation();

  return (
    <main className="min-h-screen bg-background flex flex-col safe-area-bottom">
      {/* Sticky compact header (visible on mobile) */}
      <div className="sticky top-0 z-30 bg-glass border-b border-border/60 sm:border-b-0">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="compact-title leading-tight truncate">{t('assistant.title')}</h1>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">
              {t('assistant.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Full-bleed chat area
          On mobile: stretches to fill below header & above tab bar
          On desktop: keeps a comfortable max-width and a card-like container */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="flex-1 flex flex-col sm:py-6 sm:px-6"
      >
        <div className="flex-1 flex flex-col sm:max-w-3xl sm:mx-auto sm:w-full sm:card-ios sm:overflow-hidden"
             style={{ minHeight: 'calc(100vh - 56px - var(--tab-bar-h))' }}>
          <AssistantPanel />
        </div>
      </motion.div>

      {/* Bottom spacer for mobile tab bar */}
      <div className="h-[60px] sm:hidden" aria-hidden />
    </main>
  );
}
