import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Loader2, Flame, Sparkles } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTodayCheckin, useUpsertCheckin } from '@/hooks/useDailyCheckin';
import { hapticImpact, hapticNotification } from '@/utils/haptics';
import { cn } from '@/lib/utils';

interface Question {
  key: 'expenses_logged' | 'tasks_done' | 'mood_ok';
  labelKey: string;
  defaultLabel: string;
  emoji: string;
}

const QUESTIONS: Question[] = [
  { key: 'expenses_logged', labelKey: 'checkin.q_expenses', defaultLabel: 'Hai registrato le spese di oggi?', emoji: '💰' },
  { key: 'tasks_done',      labelKey: 'checkin.q_tasks',    defaultLabel: 'Hai chiuso i task più importanti?', emoji: '✅' },
  { key: 'mood_ok',         labelKey: 'checkin.q_mood',     defaultLabel: 'Ti senti bene con la giornata?', emoji: '🙌' },
];

interface CheckInSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
  /** Optional: current streak before this check-in (for celebration) */
  currentStreak?: number;
}

/**
 * Evening check-in bottom sheet (Blocco B #3).
 * 3 yes/no questions → saves to daily_checkins, shows streak celebration.
 */
export function CheckInSheet({ open, onOpenChange, onSubmitted, currentStreak = 0 }: CheckInSheetProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id;
  const { data: existing } = useTodayCheckin(userId);
  const upsert = useUpsertCheckin(userId);
  const [step, setStep] = useState<'q' | 'done'>('q');
  const [answers, setAnswers] = useState<Record<string, boolean>>({});

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(existing ? 'done' : 'q');
      setAnswers(existing ? {
        expenses_logged: existing.expenses_logged,
        tasks_done: existing.tasks_done,
        mood_ok: existing.mood_ok,
      } : {});
    }
  }, [open, existing]);

  const allAnswered = QUESTIONS.every((q) => q.key in answers);

  const setAnswer = (key: string, value: boolean) => {
    hapticImpact('light');
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!allAnswered) return;
    try {
      await upsert.mutateAsync({
        expenses_logged: !!answers.expenses_logged,
        tasks_done: !!answers.tasks_done,
        mood_ok: !!answers.mood_ok,
      });
      hapticNotification('success');
      setStep('done');
      onSubmitted?.();
    } catch {
      hapticNotification('error');
    }
  };

  const newStreak = (existing ? currentStreak : currentStreak + 1);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('checkin.title', { defaultValue: 'Chiudi la giornata' })}
      description={step === 'q' ? t('checkin.subtitle', { defaultValue: '10 secondi per riflettere' }) : undefined}
    >
      <AnimatePresence mode="wait">
        {step === 'q' && (
          <motion.div
            key="q"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            {QUESTIONS.map((q) => {
              const value = answers[q.key];
              const set = value === true;
              const unset = value === false;
              return (
                <div key={q.key} className="card-ios p-3">
                  <div className="flex items-start gap-3 mb-2.5">
                    <span className="text-[22px] leading-none">{q.emoji}</span>
                    <p className="text-[15px] font-medium text-foreground leading-snug flex-1">
                      {t(q.labelKey, { defaultValue: q.defaultLabel })}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAnswer(q.key, false)}
                      className={cn(
                        'h-10 rounded-xl border text-[14px] font-medium transition-all pressable',
                        unset
                          ? 'bg-muted text-foreground border-border'
                          : 'bg-card text-muted-foreground border-border/60 hover:bg-muted/40'
                      )}
                    >
                      <span className="inline-flex items-center gap-1"><X className="h-4 w-4" /> {t('checkin.no', { defaultValue: 'No' })}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswer(q.key, true)}
                      className={cn(
                        'h-10 rounded-xl border text-[14px] font-medium transition-all pressable',
                        set
                          ? 'bg-primary text-primary-foreground border-primary shadow-[0_4px_12px_rgba(15,61,62,0.25)]'
                          : 'bg-card text-muted-foreground border-border/60 hover:bg-muted/40'
                      )}
                    >
                      <span className="inline-flex items-center gap-1"><Check className="h-4 w-4" /> {t('checkin.yes', { defaultValue: 'Sì' })}</span>
                    </button>
                  </div>
                </div>
              );
            })}
            <Button
              onClick={handleSubmit}
              disabled={!allAnswered || upsert.isPending}
              className="w-full h-12 rounded-2xl text-[15px] font-semibold mt-2"
            >
              {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('checkin.submit', { defaultValue: 'Conferma' })}
            </Button>
          </motion.div>
        )}

        {step === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
            className="text-center py-2"
          >
            <div className="mx-auto h-20 w-20 rounded-3xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-[0_12px_30px_rgba(15,61,62,0.3)] mb-4">
              <Sparkles className="h-9 w-9 text-primary-foreground" />
            </div>
            <h3 className="text-[20px] font-semibold tracking-tight mb-1">
              {t('checkin.done_title', { defaultValue: 'Fatto!' })}
            </h3>
            <p className="text-[14px] text-muted-foreground mb-5">
              {t('checkin.done_desc', { defaultValue: 'Ci vediamo domani sera.' })}
            </p>
            {newStreak > 0 && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-5 animate-pop-in">
                <Flame className="h-4 w-4" />
                <span className="text-[14px] font-semibold tabular-nums">
                  {newStreak} {t('home.streakDays', { defaultValue: 'giorni' })}
                </span>
              </div>
            )}
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="w-full h-11 rounded-2xl"
            >
              {t('common.close', { defaultValue: 'Chiudi' })}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </BottomSheet>
  );
}

export default CheckInSheet;
