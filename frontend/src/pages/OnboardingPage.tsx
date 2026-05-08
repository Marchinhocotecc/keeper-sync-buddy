import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  UtensilsCrossed,
  Coffee,
  ShoppingBag,
  Zap,
} from 'lucide-react';
import ayvroLogo from '@/assets/ayvro-logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { APP_NAME } from '@/config/brand';
import { hapticImpact, hapticNotification } from '@/utils/haptics';
import { upsertMonthlyBudget } from '@/services/budgetService';
import { getCurrencySymbol, formatCurrency } from '@/utils/currency';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

/** Sample expense marker — used by Home banner to detect tutorial expense */
export const SAMPLE_EXPENSE_TAG = '[Esempio]';

interface LocaleOption {
  code: string;
  flag: string;
  label: string;
  currency: string;
}

const LOCALE_OPTIONS: LocaleOption[] = [
  { code: 'it', flag: '🇮🇹', label: 'Italiano', currency: 'EUR' },
  { code: 'en', flag: '🇺🇸', label: 'English', currency: 'USD' },
  { code: 'es', flag: '🇪🇸', label: 'Español', currency: 'EUR' },
  { code: 'fr', flag: '🇫🇷', label: 'Français', currency: 'EUR' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch', currency: 'EUR' },
  { code: 'pt', flag: '🇵🇹', label: 'Português', currency: 'EUR' },
];

const BUDGET_PRESETS = [500, 1000, 1500, 2000, 3000];

interface SampleExpense {
  amount: number;
  category: string;
  labelKey: string;
  defaultLabel: string;
  icon: React.ComponentType<any>;
}

const SAMPLE_EXPENSES: SampleExpense[] = [
  { amount: 3.5, category: 'food', labelKey: 'onboarding.sample_coffee', defaultLabel: 'Caffè',  icon: Coffee },
  { amount: 12,  category: 'food', labelKey: 'onboarding.sample_lunch',  defaultLabel: 'Pranzo', icon: UtensilsCrossed },
  { amount: 45,  category: 'shopping', labelKey: 'onboarding.sample_shopping', defaultLabel: 'Spesa', icon: ShoppingBag },
  { amount: 9.99, category: 'bills', labelKey: 'onboarding.sample_subscription', defaultLabel: 'Abbonamento', icon: Zap },
];

type Step = 0 | 1 | 2;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(0);
  const [direction, setDirection] = useState(1);
  const [locale, setLocale] = useState<string>(i18n.language || 'it');
  const [budget, setBudget] = useState<number | ''>('');
  const [selectedSample, setSelectedSample] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentSymbol = useMemo(() => getCurrencySymbol(locale), [locale]);

  // ---- Step transitions
  const goTo = (s: Step) => {
    if (s === step) return;
    hapticImpact('light');
    setDirection(s > step ? 1 : -1);
    setStep(s);
  };

  const handleBack = () => {
    if (step > 0) goTo((step - 1) as Step);
  };

  // ---- Step validation
  const canAdvance = (): boolean => {
    if (step === 0) return !!locale;
    if (step === 1) return typeof budget === 'number' && budget > 0;
    if (step === 2) return selectedSample !== null;
    return false;
  };

  // ---- Locale picker — also switches i18n live so subsequent steps use new currency
  const handleLocale = (code: string) => {
    hapticImpact('light');
    setLocale(code);
    i18n.changeLanguage(code);
  };

  // ---- Budget input
  const handleBudgetPreset = (val: number) => {
    hapticImpact('light');
    setBudget(val);
  };

  const handleBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
    if (raw === '') return setBudget('');
    const num = Math.round(Number(raw));
    if (!Number.isNaN(num) && num >= 0) setBudget(num);
  };

  // ---- Sample picker
  const handleSamplePick = (idx: number) => {
    hapticImpact('light');
    setSelectedSample(idx);
  };

  // ---- Final submit (creates real DB rows)
  const handleFinish = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: t('common.error', { defaultValue: 'Errore' }), variant: 'destructive' });
        navigate('/auth');
        return;
      }

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      // 1. Save language to settings
      try {
        await supabase
          .from('settings')
          .upsert({ user_id: user.id, language: locale, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      } catch (err) {
        if (import.meta.env.DEV) console.error('[Onboarding] settings upsert', err);
      }

      // 2. Save monthly budget
      const budgetNum = typeof budget === 'number' ? budget : 0;
      if (budgetNum > 0) {
        await upsertMonthlyBudget(user.id, month, year, budgetNum);
      }

      // 3. Create sample expense (so Home pre-populates with data)
      if (selectedSample !== null) {
        const sample = SAMPLE_EXPENSES[selectedSample];
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const description = `${SAMPLE_EXPENSE_TAG} ${t(sample.labelKey, { defaultValue: sample.defaultLabel })}`;
        try {
          await supabase.from('expenses').insert({
            user_id: user.id,
            amount: sample.amount,
            category: sample.category,
            description,
            date: dateStr,
          });
        } catch (err) {
          if (import.meta.env.DEV) console.error('[Onboarding] sample expense', err);
        }
      }

      // 4. Mark onboarding complete
      try {
        await supabase.auth.updateUser({ data: { onboarding_completed: true } });
      } catch {}
      localStorage.setItem(`onboarding_completed_${user.id}`, 'true');
      // Show sample tutorial banner once on Home
      localStorage.setItem(`onboarding_sample_pending_${user.id}`, '1');

      hapticNotification('success');
      navigate('/');
    } catch (err: any) {
      hapticNotification('error');
      toast({
        title: t('onboarding.error_title', { defaultValue: 'Errore durante il setup' }),
        description: err?.message || '',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (!canAdvance()) return;
    if (step < 2) goTo((step + 1) as Step);
    else handleFinish();
  };

  // ---- Render helpers
  const renderStep0 = () => (
    <div className="text-center">
      <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center mb-5 shadow-[0_8px_24px_rgba(15,61,62,0.10)]">
        <Sparkles className="h-9 w-9 text-primary" />
      </div>
      <h1 className="large-title mb-2">
        {t('onboarding.lang_title', { defaultValue: 'Benvenuto in Ayvro' })}
      </h1>
      <p className="text-[15px] text-muted-foreground mb-7 px-2">
        {t('onboarding.lang_desc', { defaultValue: 'Scegli la lingua e la valuta che usi ogni giorno.' })}
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {LOCALE_OPTIONS.map((opt) => {
          const active = locale === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              data-testid={`onboarding-locale-${opt.code}`}
              onClick={() => handleLocale(opt.code)}
              className={cn(
                'relative flex items-center gap-2.5 h-14 px-4 rounded-2xl border text-left pressable transition-all',
                active
                  ? 'bg-primary/8 border-primary shadow-[0_4px_12px_rgba(15,61,62,0.12)]'
                  : 'bg-card border-border/60 hover:bg-muted/40'
              )}
            >
              <span className="text-[22px] leading-none">{opt.flag}</span>
              <div className="flex-1 min-w-0">
                <p className={cn('text-[14px] font-semibold leading-tight', active ? 'text-primary' : 'text-foreground')}>
                  {opt.label}
                </p>
                <p className="text-[12px] text-muted-foreground tabular-nums">{opt.currency}</p>
              </div>
              {active && <Check className="h-4 w-4 text-primary shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="text-center">
      <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-900/10 flex items-center justify-center mb-5 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
        <Wallet className="h-9 w-9 text-warning" />
      </div>
      <h1 className="large-title mb-2">
        {t('onboarding.budget_title', { defaultValue: 'Quanto vuoi spendere al mese?' })}
      </h1>
      <p className="text-[15px] text-muted-foreground mb-6 px-2">
        {t('onboarding.budget_desc', { defaultValue: 'Lo useremo per il tuo budget giornaliero. Puoi cambiarlo quando vuoi.' })}
      </p>

      {/* Big input with currency symbol */}
      <div className="relative mb-5">
        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[28px] font-semibold text-muted-foreground tabular-nums select-none">
          {currentSymbol}
        </span>
        <Input
          type="text"
          inputMode="numeric"
          data-testid="onboarding-budget-input"
          value={budget === '' ? '' : String(budget)}
          onChange={handleBudgetChange}
          placeholder="0"
          className="h-16 pl-12 pr-4 text-[28px] font-semibold text-center tabular-nums rounded-2xl border-2 focus-visible:border-primary"
        />
      </div>

      {/* Preset chips */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {BUDGET_PRESETS.map((val) => {
          const active = budget === val;
          return (
            <button
              key={val}
              type="button"
              data-testid={`onboarding-budget-preset-${val}`}
              onClick={() => handleBudgetPreset(val)}
              className={cn(
                'h-10 rounded-xl border text-[13px] font-semibold tabular-nums pressable transition-all',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-foreground border-border/60 hover:bg-muted/40'
              )}
            >
              {formatCurrency(val, locale, 0)}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="text-center">
      <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-900/40 dark:to-teal-900/10 flex items-center justify-center mb-5 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
        <Sparkles className="h-9 w-9 text-primary" />
      </div>
      <h1 className="large-title mb-2">
        {t('onboarding.sample_title', { defaultValue: 'Aggiungi la prima spesa' })}
      </h1>
      <p className="text-[15px] text-muted-foreground mb-6 px-2">
        {t('onboarding.sample_desc', { defaultValue: 'Scegline una di esempio: la userai per esplorare l\'app. Eliminala quando vuoi.' })}
      </p>

      <div className="space-y-2.5">
        {SAMPLE_EXPENSES.map((sample, idx) => {
          const active = selectedSample === idx;
          const Icon = sample.icon;
          return (
            <button
              key={idx}
              type="button"
              data-testid={`onboarding-sample-${idx}`}
              onClick={() => handleSamplePick(idx)}
              className={cn(
                'w-full flex items-center gap-3.5 h-14 px-4 rounded-2xl border text-left pressable transition-all',
                active
                  ? 'bg-primary/8 border-primary shadow-[0_4px_12px_rgba(15,61,62,0.12)]'
                  : 'bg-card border-border/60 hover:bg-muted/40'
              )}
            >
              <div className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
                active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
              )}>
                <Icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-[15px] font-semibold leading-tight', active ? 'text-primary' : 'text-foreground')}>
                  {t(sample.labelKey, { defaultValue: sample.defaultLabel })}
                </p>
                <p className="text-[12px] text-muted-foreground capitalize">
                  {t(`expenses.${sample.category}`, { defaultValue: sample.category })}
                </p>
              </div>
              <p className="text-[16px] font-semibold tabular-nums shrink-0">
                {formatCurrency(sample.amount, locale, 2)}
              </p>
              {active && <Check className="h-4 w-4 text-primary shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <main className="min-h-screen w-full flex flex-col safe-area-top safe-area-bottom relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 80% 0%, hsl(var(--primary) / 0.12), transparent 55%), linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%)',
        }}
      />

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 pt-4">
        <button
          onClick={handleBack}
          disabled={step === 0}
          aria-label="Back"
          data-testid="onboarding-back"
          className={cn(
            'h-9 w-9 rounded-full flex items-center justify-center pressable transition-opacity',
            step === 0 ? 'opacity-0 pointer-events-none' : 'bg-muted text-foreground'
          )}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <img src={ayvroLogo} alt="Ayvro" className="w-7 h-7 rounded-lg" />
          <span className="text-[14px] font-semibold text-foreground">{APP_NAME}</span>
        </div>
        <div className="w-9 h-9" />
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 mt-5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 rounded-full transition-all duration-300',
              i === step ? 'w-8 bg-primary' : i < step ? 'w-4 bg-primary/40' : 'w-4 bg-muted-foreground/20'
            )}
          />
        ))}
      </div>

      {/* Slide stage */}
      <div className="flex-1 flex flex-col justify-center px-6 max-w-md mx-auto w-full">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -direction * 32 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          >
            {step === 0 && renderStep0()}
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sticky CTA */}
      <div className="px-6 pb-8 pt-4 max-w-md mx-auto w-full">
        <Button
          onClick={handleNext}
          disabled={!canAdvance() || submitting}
          data-testid="onboarding-next"
          className="w-full h-14 rounded-2xl text-[15px] font-semibold gap-2 ayvro-button"
        >
          {submitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : step === 2 ? (
            <>
              {t('onboarding.finish', { defaultValue: 'Inizia ad usare Ayvro' })}
              <Check className="h-5 w-5" />
            </>
          ) : (
            <>
              {t('onboarding.next', { defaultValue: 'Avanti' })}
              <ChevronRight className="h-5 w-5" />
            </>
          )}
        </Button>
      </div>
    </main>
  );
}
