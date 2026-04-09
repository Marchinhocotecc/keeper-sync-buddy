import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Wallet, MessageSquare, ChevronRight } from 'lucide-react';
import ayvroLogo from '@/assets/ayvro-logo.png';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { APP_NAME } from '@/config/brand';

interface Slide { icon: React.ReactNode; titleKey: string; descKey: string; exampleKey: string; }

const slides: Slide[] = [
  { icon: <CheckCircle2 className="h-12 w-12 text-success" />, titleKey: 'onboarding.taskTitle', descKey: 'onboarding.taskDesc', exampleKey: 'onboarding.taskExample' },
  { icon: <Wallet className="h-12 w-12 text-warning" />, titleKey: 'onboarding.expenseTitle', descKey: 'onboarding.expenseDesc', exampleKey: 'onboarding.expenseExample' },
  { icon: <MessageSquare className="h-12 w-12 text-primary" />, titleKey: 'onboarding.assistantTitle', descKey: 'onboarding.assistantDesc', exampleKey: 'onboarding.assistantExample' }
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleNext = () => { if (currentSlide < slides.length - 1) setCurrentSlide(currentSlide + 1); else handleComplete(); };
  const handleSkip = () => handleComplete();
  const handleComplete = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.auth.updateUser({ data: { onboarding_completed: true } });
      localStorage.setItem(`onboarding_completed_${user.id}`, 'true');
    }
    navigate('/');
  };

  const slide = slides[currentSlide];

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-center gap-2">
        <img src={ayvroLogo} alt="Ayvro" className="w-10 h-10 rounded-xl" />
        <span className="text-xl font-bold text-foreground">{APP_NAME}</span>
      </motion.div>

      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div key={currentSlide} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.3 }} className="text-center">
            <div className="mb-6 flex justify-center">
              <div className="w-24 h-24 rounded-2xl bg-card border border-border flex items-center justify-center shadow-ayvro-card">{slide.icon}</div>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-3">{t(slide.titleKey)}</h1>
            <p className="text-muted-foreground mb-6 leading-relaxed">{t(slide.descKey)}</p>
            <div className="bg-muted/50 rounded-xl p-4 border border-border">
              <p className="text-sm text-muted-foreground mb-1">{t('onboarding.trySaying')}</p>
              <p className="text-foreground font-medium">{t(slide.exampleKey)}</p>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex justify-center gap-2 mt-8">
          {slides.map((_, index) => (
            <button key={index} onClick={() => setCurrentSlide(index)} className={`w-2 h-2 rounded-full transition-all ${index === currentSlide ? 'w-6 bg-primary' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'}`} />
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Button onClick={handleNext} className="w-full gap-2" size="lg">
            {currentSlide < slides.length - 1 ? (<>{t('onboarding.next')}<ChevronRight className="h-4 w-4" /></>) : t('onboarding.start')}
          </Button>
          {currentSlide < slides.length - 1 && (<Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">{t('onboarding.skip')}</Button>)}
        </div>
      </div>
    </main>
  );
}
