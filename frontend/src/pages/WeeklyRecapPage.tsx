import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { ArrowRight, X, TrendingUp, TrendingDown, Wallet, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { generateWeeklySummary, WeeklySummaryData } from '@/services/weeklySummaryService';
import { formatCurrency } from '@/utils/currency';
import { hapticImpact } from '@/utils/haptics';
import { CATEGORY_ICON, CATEGORY_TINT } from '@/components/CategoryChips';
import { cn } from '@/lib/utils';

interface SlideContent {
  bg: string;
  render: (data: WeeklySummaryData, lang: string) => React.ReactNode;
}

const SLIDES: SlideContent[] = [
  // Slide 1 — Total spent + delta vs previous week
  {
    bg: 'from-teal-500 via-teal-600 to-teal-700',
    render: (data, lang) => {
      const positiveChange = data.variance > 0;
      return (
        <div className="text-white text-center px-6">
          <p className="text-[13px] uppercase tracking-[0.2em] font-semibold opacity-80 mb-3">
            Hai speso
          </p>
          <h1 className="text-[56px] sm:text-[64px] font-bold leading-none tracking-tight tabular-nums mb-2">
            {formatCurrency(data.totalSpent, lang, 0)}
          </h1>
          <p className="text-[15px] opacity-90">questa settimana</p>
          {Number.isFinite(data.variance) && data.variance !== 0 && (
            <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm">
              {positiveChange ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span className="text-[14px] font-semibold">
                {positiveChange ? '+' : ''}{Math.round(data.variance)}% vs scorsa settimana
              </span>
            </div>
          )}
        </div>
      );
    },
  },
  // Slide 2 — Top category
  {
    bg: 'from-amber-400 via-orange-500 to-rose-500',
    render: (data, lang) => {
      const cat = data.dominantCategory || 'other';
      const Icon = CATEGORY_ICON[cat] || Wallet;
      const tint = CATEGORY_TINT[cat] || '';
      return (
        <div className="text-white text-center px-6">
          <p className="text-[13px] uppercase tracking-[0.2em] font-semibold opacity-80 mb-5">
            Top categoria
          </p>
          <div className={cn('mx-auto w-32 h-32 rounded-[36px] flex items-center justify-center mb-6 shadow-2xl', tint)}>
            <Icon className="h-14 w-14" strokeWidth={2} />
          </div>
          <h1 className="text-[40px] font-bold leading-tight tracking-tight capitalize mb-2">
            {cat}
          </h1>
          <p className="text-[15px] opacity-90">
            è dove sono finiti i tuoi soldi
          </p>
          {data.criticalDays && data.criticalDays.length > 0 && (
            <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm">
              <span className="text-[14px] font-semibold">
                {data.criticalDays.length} {data.criticalDays.length === 1 ? 'giornata più spendacciona' : 'giornate spendaccione'}
              </span>
            </div>
          )}
        </div>
      );
    },
  },
  // Slide 3 — AI strategic action
  {
    bg: 'from-indigo-500 via-purple-600 to-pink-600',
    render: (data) => (
      <div className="text-white text-center px-6">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-5">
          <Sparkles className="h-8 w-8" />
        </div>
        <p className="text-[13px] uppercase tracking-[0.2em] font-semibold opacity-80 mb-3">
          Consiglio di Ayvro
        </p>
        <p className="text-[20px] sm:text-[22px] font-semibold leading-snug px-2">
          “{data.strategicAction}”
        </p>
      </div>
    ),
  },
];

export default function WeeklyRecapPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id;
  const lang = i18n.language;

  const [data, setData] = useState<WeeklySummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [slideIdx, setSlideIdx] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    generateWeeklySummary(userId).then((d) => {
      if (cancelled) return;
      setData(d);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const goTo = (idx: number) => {
    if (idx === slideIdx) return;
    if (idx < 0 || idx >= SLIDES.length) return;
    hapticImpact('light');
    setDirection(idx > slideIdx ? 1 : -1);
    setSlideIdx(idx);
  };

  const handleNext = () => {
    if (slideIdx < SLIDES.length - 1) goTo(slideIdx + 1);
    else handleClose();
  };

  const handleClose = () => {
    hapticImpact('medium');
    navigate('/');
  };

  const handleSetBudget = () => {
    hapticImpact('medium');
    navigate('/expenses');
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 60;
    if (info.offset.x < -threshold && slideIdx < SLIDES.length - 1) goTo(slideIdx + 1);
    else if (info.offset.x > threshold && slideIdx > 0) goTo(slideIdx - 1);
  };

  const isLast = slideIdx === SLIDES.length - 1;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <p className="text-muted-foreground mb-4">Nessun dato per il recap settimanale.</p>
        <Button onClick={handleClose}>Torna alla Home</Button>
      </div>
    );
  }

  const slide = SLIDES[slideIdx];

  return (
    <main className="fixed inset-0 z-50 flex flex-col safe-area-top safe-area-bottom">
      {/* Animated gradient backdrop — changes per slide */}
      <AnimatePresence mode="wait">
        <motion.div
          key={slideIdx}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className={cn('absolute inset-0 bg-gradient-to-br', slide.bg)}
        />
      </AnimatePresence>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-3">
        <div className="flex gap-1.5">
          {SLIDES.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'h-1 rounded-full transition-all duration-300 bg-white/30',
                idx === slideIdx ? 'w-8 bg-white' : 'w-4'
              )}
            />
          ))}
        </div>
        <button
          onClick={handleClose}
          aria-label="Close"
          className="h-9 w-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white pressable"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Slide content */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={slideIdx}
            custom={direction}
            initial={{ opacity: 0, x: direction * 60, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -direction * 60, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            className="cursor-grab active:cursor-grabbing w-full"
          >
            {slide.render(data, lang)}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom CTA */}
      <div className="relative z-10 px-6 pb-8">
        {isLast ? (
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSetBudget}
              className="w-full h-12 rounded-2xl bg-white text-foreground hover:bg-white/95 font-semibold text-[15px]"
            >
              Imposta budget settimana prossima
            </Button>
            <Button
              onClick={handleClose}
              variant="ghost"
              className="w-full h-11 rounded-2xl text-white hover:bg-white/15 hover:text-white font-medium"
            >
              Chiudi
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleNext}
            className="w-full h-12 rounded-2xl bg-white text-foreground hover:bg-white/95 font-semibold text-[15px]"
          >
            Continua
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </main>
  );
}
