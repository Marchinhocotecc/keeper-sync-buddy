import React, { useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { CheckCircle2, Wallet, MessageSquare, ChevronRight } from 'lucide-react';
import ayvroLogo from '@/assets/ayvro-logo.png';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { APP_NAME } from '@/config/brand';
import { hapticImpact } from '@/utils/haptics';

interface Slide {
  icon: React.ReactNode;
  iconBg: string;
  titleKey: string;
  descKey: string;
  exampleKey: string;
}

const slides: Slide[] = [
  {
    icon: <CheckCircle2 className="h-14 w-14 text-success" />,
    iconBg: 'from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-900/10',
    titleKey: 'onboarding.taskTitle',
    descKey: 'onboarding.taskDesc',
    exampleKey: 'onboarding.taskExample',
  },
  {
    icon: <Wallet className="h-14 w-14 text-warning" />,
    iconBg: 'from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-900/10',
    titleKey: 'onboarding.expenseTitle',
    descKey: 'onboarding.expenseDesc',
    exampleKey: 'onboarding.expenseExample',
  },
  {
    icon: <MessageSquare className="h-14 w-14 text-primary" />,
    iconBg: 'from-teal-100 to-teal-50 dark:from-teal-900/40 dark:to-teal-900/10',
    titleKey: 'onboarding.assistantTitle',
    descKey: 'onboarding.assistantDesc',
    exampleKey: 'onboarding.assistantExample',
  },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(1);

  const goTo = (index: number) => {
    if (index === currentSlide) return;
    hapticImpact('light');
    setDirection(index > currentSlide ? 1 : -1);
    setCurrentSlide(index);
  };

  const handleNext = () => {
    if (currentSlide < slides.length - 1) goTo(currentSlide + 1);
    else handleComplete();
  };

  const handleSkip = () => handleComplete();

  const handleComplete = async () => {
    hapticImpact('medium');
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.auth.updateUser({ data: { onboarding_completed: true } });
      localStorage.setItem(`onboarding_completed_${user.id}`, 'true');
    }
    navigate('/');
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    const swipeThreshold = 60;
    if (info.offset.x < -swipeThreshold && currentSlide < slides.length - 1) {
      goTo(currentSlide + 1);
    } else if (info.offset.x > swipeThreshold && currentSlide > 0) {
      goTo(currentSlide - 1);
    }
  };

  const slide = slides[currentSlide];
  const isLast = currentSlide === slides.length - 1;

  return (
    <main className="min-h-screen w-full flex flex-col safe-area-top safe-area-bottom relative overflow-hidden">
      {/* Soft gradient backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 80% 0%, hsl(var(--primary) / 0.12), transparent 55%), linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%)',
        }}
      />

      {/* Top bar: brand + skip */}
      <div className="flex items-center justify-between px-6 pt-4">
        <div className="flex items-center gap-2">
          <img src={ayvroLogo} alt="Ayvro" className="w-8 h-8 rounded-xl" />
          <span className="text-[15px] font-semibold text-foreground">{APP_NAME}</span>
        </div>
        {!isLast && (
          <button
            onClick={handleSkip}
            className="text-[14px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
          >
            {t('onboarding.skip')}
          </button>
        )}
      </div>

      {/* Slide stage */}
      <div className="flex-1 flex flex-col justify-center px-6 max-w-md mx-auto w-full">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentSlide}
            custom={direction}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -direction * 40 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            className="text-center cursor-grab active:cursor-grabbing"
          >
            <div className="mb-8 flex justify-center">
              <div
                className={`w-32 h-32 rounded-[36px] bg-gradient-to-br ${slide.iconBg} flex items-center justify-center shadow-[0_12px_30px_rgba(0,0,0,0.08)]`}
              >
                {slide.icon}
              </div>
            </div>
            <h1 className="large-title mb-3">{t(slide.titleKey)}</h1>
            <p className="text-[15px] text-muted-foreground leading-relaxed mb-8 px-2">
              {t(slide.descKey)}
            </p>
            <div className="card-ios p-4 text-left">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-semibold mb-1.5">
                {t('onboarding.trySaying')}
              </p>
              <p className="text-[15px] text-foreground font-medium leading-snug">
                "{t(slide.exampleKey)}"
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Dots indicator */}
        <div className="flex justify-center gap-2 mt-10">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goTo(index)}
              aria-label={`Slide ${index + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentSlide ? 'w-8 bg-primary' : 'w-2 bg-muted-foreground/25 hover:bg-muted-foreground/40'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Sticky CTA */}
      <div className="px-6 pb-8 pt-4 max-w-md mx-auto w-full">
        <Button
          onClick={handleNext}
          className="w-full h-14 rounded-2xl text-[15px] font-semibold gap-2 ayvro-button"
        >
          {isLast ? t('onboarding.start') : (
            <>
              {t('onboarding.next')}
              <ChevronRight className="h-5 w-5" />
            </>
          )}
        </Button>
      </div>
    </main>
  );
}
