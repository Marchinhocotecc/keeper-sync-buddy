import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { hapticImpact } from '@/utils/haptics';
import { SAMPLE_EXPENSE_TAG } from '@/pages/OnboardingPage';

interface SampleExpenseBannerProps {
  userId?: string;
  expenses: Array<{ id: string; description?: string }>;
}

/**
 * Onboarding tutorial banner (Block C).
 * Shows when:
 *  - localStorage flag `onboarding_sample_pending_${userId}` is set ('1')
 *  - AND there's still a sample expense (description starts with [Esempio]) in the list
 *
 * Dismissible. Tap CTA → /expenses (so user can delete or edit it).
 */
export function SampleExpenseBanner({ userId, expenses }: SampleExpenseBannerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const flagKey = userId ? `onboarding_sample_pending_${userId}` : '';

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (!flagKey) return true;
    return localStorage.getItem(flagKey) !== '1';
  });

  const hasSample = useMemo(
    () => expenses.some((e) => (e.description ?? '').startsWith(SAMPLE_EXPENSE_TAG)),
    [expenses]
  );

  if (!userId || dismissed || !hasSample) return null;

  const handleDismiss = () => {
    hapticImpact('light');
    if (flagKey) localStorage.removeItem(flagKey);
    setDismissed(true);
  };

  const handleCta = () => {
    hapticImpact('light');
    if (flagKey) localStorage.removeItem(flagKey);
    setDismissed(true);
    navigate('/expenses');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
        className="mb-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 to-primary/4 p-3.5 relative overflow-hidden"
        data-testid="sample-expense-banner"
      >
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t('common.close', { defaultValue: 'Chiudi' })}
          data-testid="sample-banner-dismiss"
          className="absolute top-2 right-2 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/60 pressable"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-foreground leading-tight mb-0.5">
              {t('onboarding.banner_title', { defaultValue: 'Hai una spesa di esempio' })}
            </p>
            <p className="text-[12.5px] text-muted-foreground leading-snug">
              {t('onboarding.banner_desc', { defaultValue: 'L\'abbiamo aggiunta per mostrarti come funziona. Eliminala quando vuoi.' })}
            </p>
            <button
              type="button"
              onClick={handleCta}
              data-testid="sample-banner-cta"
              className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline pressable"
            >
              {t('onboarding.banner_cta', { defaultValue: 'Vai alle spese' })}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default SampleExpenseBanner;
