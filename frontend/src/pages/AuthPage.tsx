import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { isNativePlatform } from '@/lib/capacitorStorage';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight } from 'lucide-react';
import ayvroLogo from '@/assets/ayvro-logo.png';
import { hapticImpact } from '@/utils/haptics';

type Mode = 'signin' | 'signup';

function FloatField({
  id, type = 'text', label, value, onChange, disabled, autoComplete, minLength, required,
}: {
  id: string; type?: string; label: string; value: string;
  onChange: (v: string) => void; disabled?: boolean;
  autoComplete?: string; minLength?: number; required?: boolean;
}) {
  return (
    <div className="float-field">
      <input
        id={id}
        type={type}
        value={value}
        placeholder=" "
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        inputMode={type === 'email' ? 'email' : undefined}
      />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('signin');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) checkTermsAcceptance(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) checkTermsAcceptance(session.user);
    });
    return () => subscription.unsubscribe();
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkTermsAcceptance = (user: any) => {
    if (user?.user_metadata?.terms_accepted) navigate('/');
    else navigate('/accept-terms');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup' && !termsAccepted) {
      toast({ title: t('common.error'), description: t('auth.termsRequired'), variant: 'destructive' });
      return;
    }
    hapticImpact('light');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const redirectTo = isNativePlatform() ? 'com.ayvro.app://auth-callback' : `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: redirectTo, data: { terms_accepted: true, terms_accepted_at: new Date().toISOString() } },
        });
        if (error) throw error;
        toast({ title: t('auth.checkEmail'), description: t('auth.checkEmailDesc') });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.user?.user_metadata?.terms_accepted) navigate('/accept-terms');
        else navigate('/');
      }
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col safe-area-top safe-area-bottom relative overflow-hidden">
      {/* Brand gradient backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 20% -10%, hsl(var(--primary) / 0.18), transparent 55%), radial-gradient(circle at 90% 0%, hsl(var(--primary) / 0.10), transparent 60%), linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute -top-32 -right-24 w-[420px] h-[420px] rounded-full -z-10 opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.25), transparent 70%)' }}
      />

      <main className="flex-1 flex flex-col px-6 pt-12 sm:pt-20 pb-8 max-w-md mx-auto w-full">
        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center text-center mb-8 sm:mb-10"
        >
          <img
            src={ayvroLogo}
            alt="Ayvro"
            className="w-20 h-20 rounded-3xl shadow-[0_10px_30px_rgba(15,61,62,0.25)] mb-5"
          />
          <h1 className="large-title">Ayvro</h1>
          <p className="text-[15px] text-muted-foreground mt-1.5">{t('home.subtitle')}</p>
        </motion.div>

        {/* Segmented control */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="flex justify-center mb-6"
        >
          <div className="segmented w-full max-w-xs grid grid-cols-2">
            <button
              type="button"
              data-active={mode === 'signin'}
              onClick={() => { hapticImpact('light'); setMode('signin'); }}
              className="segmented-item text-center"
            >
              {t('auth.signIn')}
            </button>
            <button
              type="button"
              data-active={mode === 'signup'}
              onClick={() => { hapticImpact('light'); setMode('signup'); }}
              className="segmented-item text-center"
            >
              {t('auth.signUp')}
            </button>
          </div>
        </motion.div>

        {/* Form */}
        <motion.form
          key={mode}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          onSubmit={handleSubmit}
          className="space-y-3"
        >
          <FloatField
            id="email"
            type="email"
            label={t('auth.email')}
            value={email}
            onChange={setEmail}
            disabled={loading}
            autoComplete="email"
            required
          />
          <FloatField
            id="password"
            type="password"
            label={t('auth.password')}
            value={password}
            onChange={setPassword}
            disabled={loading}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={mode === 'signup' ? 6 : undefined}
            required
          />

          <AnimatePresence initial={false}>
            {mode === 'signup' && (
              <motion.div
                key="terms"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-muted/60 border border-border/60 mt-2">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                    disabled={loading}
                    className="mt-0.5"
                  />
                  <label htmlFor="terms" className="text-[13px] leading-relaxed cursor-pointer text-muted-foreground">
                    {t('auth.acceptTerms')}{' '}
                    <Link to="/terms-and-conditions" className="text-primary hover:underline font-semibold" target="_blank">
                      {t('auth.termsLink')}
                    </Link>
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            type="submit"
            disabled={loading || (mode === 'signup' && !termsAccepted)}
            className="w-full h-14 rounded-2xl text-[15px] font-semibold mt-3 ayvro-button group"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <span>{mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}</span>
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>

          {mode === 'signin' && (
            <div className="text-center pt-1">
              <Link
                to="/reset-password"
                className="text-[13px] text-muted-foreground hover:text-primary transition-colors"
              >
                {t('auth.forgotPassword')}
              </Link>
            </div>
          )}
        </motion.form>

        <div className="mt-auto pt-10 text-center">
          <p className="text-[12px] text-muted-foreground">
            {mode === 'signin' ? t('auth.dontHaveAccount', { defaultValue: "Non hai un account?" }) : t('auth.alreadyHaveAccount', { defaultValue: 'Hai già un account?' })}{' '}
            <button
              type="button"
              onClick={() => { hapticImpact('light'); setMode(mode === 'signin' ? 'signup' : 'signin'); }}
              className="text-primary font-semibold hover:underline"
            >
              {mode === 'signin' ? t('auth.signUp') : t('auth.signIn')}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
