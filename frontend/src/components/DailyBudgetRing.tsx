import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useDailyBudget, DailyBudgetStatus } from '@/hooks/useDailyBudget';
import { formatCurrency } from '@/utils/currency';
import { Wallet, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DailyBudgetRingProps {
  userId?: string;
  onSetBudget?: () => void;
  onRingTap?: () => void;
  className?: string;
}

const RING_COLORS: Record<DailyBudgetStatus, string> = {
  good: 'hsl(var(--success))',
  warning: '#F59E0B',
  over: 'hsl(var(--destructive))',
  no_budget: 'hsl(var(--muted-foreground))',
};

const RADIUS = 76;
const STROKE = 12;
const CIRC = 2 * Math.PI * RADIUS;
const SIZE = (RADIUS + STROKE) * 2;

/**
 * Big circular gauge in Home that answers "posso spendere oggi?" in 1 second.
 *
 * - Center: today's remaining daily budget (bold)
 * - Ring: progress = today's spend / dailyBudget, color-coded
 * - Below: micro "speso oggi: X · medio: Y"
 * - When no budget set, shows a CTA to set one.
 */
export function DailyBudgetRing({ userId, onSetBudget, onRingTap, className }: DailyBudgetRingProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const b = useDailyBudget(userId);

  const ringColor = RING_COLORS[b.status];

  // Stroke length proportional to today's progress (capped at 1.5 for visuals)
  const progress = Math.min(1, b.todayProgress);
  const dashOffset = CIRC * (1 - progress);

  const monthLabel = new Date().toLocaleDateString(lang || 'it-IT', { month: 'long' });
  const status = b.status;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className={cn('card-ios p-5 sm:p-6', className)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold">
            {t('home.dailyBudget', { defaultValue: 'Budget di oggi' })}
          </p>
          <p className="text-[12px] text-muted-foreground capitalize mt-0.5">{monthLabel}</p>
        </div>
        {b.monthlyBudget > 0 && (
          <button
            onClick={onSetBudget}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 pressable"
            aria-label={t('expenses.editBudget', { defaultValue: 'Modifica budget' })}
          >
            {formatCurrency(b.monthlyBudget, lang, 0)}
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-center relative">
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="hsl(var(--muted))"
            strokeWidth={STROKE}
            fill="none"
          />
          {/* Progress */}
          {b.monthlyBudget > 0 && (
            <motion.circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={ringColor}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              initial={{ strokeDashoffset: CIRC }}
              animate={{ strokeDashoffset: dashOffset }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          )}
        </svg>

        {/* Center label */}
        <button
          type="button"
          onClick={onRingTap}
          className="absolute inset-0 flex flex-col items-center justify-center text-center pressable rounded-full"
          aria-label={t('home.dailyBudgetTap', { defaultValue: 'Dettaglio budget' })}
        >
          {b.isLoading ? (
            <span className="text-[14px] text-muted-foreground">…</span>
          ) : status === 'no_budget' ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSetBudget?.(); }}
              className="flex flex-col items-center gap-1 px-4 py-2 pressable"
            >
              <Wallet className="h-6 w-6 text-muted-foreground" />
              <span className="text-[13px] font-semibold text-foreground leading-tight">
                {t('home.setBudget', { defaultValue: 'Imposta budget' })}
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                {t('home.setBudgetCta', { defaultValue: 'Per attivare il ring' })}
              </span>
            </button>
          ) : (
            <>
              <span
                className={cn(
                  'text-[28px] sm:text-[32px] font-bold tabular-nums leading-none tracking-tight',
                  status === 'over' && 'text-destructive',
                  status === 'warning' && 'text-warning',
                  status === 'good' && 'text-foreground'
                )}
              >
                {b.dailyBudget < 0 ? '−' : ''}{formatCurrency(Math.abs(b.dailyBudget), lang)}
              </span>
              <span className="text-[11px] text-muted-foreground mt-1">
                {t('home.perDayLeft', { defaultValue: 'al giorno' })}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Micro stats under ring */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="py-1">
          <p className="text-[11px] text-muted-foreground/80 uppercase tracking-wider font-semibold">
            {t('home.spentToday', { defaultValue: 'Speso oggi' })}
          </p>
          <p className="text-[15px] font-semibold text-foreground tabular-nums mt-0.5">
            {formatCurrency(b.todaySpent, lang)}
          </p>
        </div>
        <div className="py-1 border-l border-border/60">
          <p className="text-[11px] text-muted-foreground/80 uppercase tracking-wider font-semibold">
            {t('home.dailyAverage', { defaultValue: 'Media giornaliera' })}
          </p>
          <p className="text-[15px] font-semibold text-foreground tabular-nums mt-0.5">
            {formatCurrency(b.averageDailySpend, lang)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export default DailyBudgetRing;
