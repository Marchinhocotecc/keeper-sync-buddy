import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Mail, Lock } from 'lucide-react';
import ayvroLogo from '@/assets/ayvro-logo.png';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setIsRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast({ title: t('auth.resetSent'), description: t('auth.resetSentDesc') });
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: t('common.error'), description: t('auth.passwordMismatch'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: t('auth.passwordUpdated') });
      navigate('/');
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-xl border-border bg-card">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <img src={ayvroLogo} alt="Ayvro" className="w-14 h-14 rounded-xl shadow-ayvro" />
          </div>
          <CardTitle className="text-2xl font-semibold text-foreground tracking-tight">
            {t('auth.resetPassword')}
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            {isRecovery ? t('auth.newPassword') : t('auth.resetPasswordDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isRecovery ? (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-sm flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5" />{t('auth.newPassword')}
                </Label>
                <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} disabled={loading} className="h-10 rounded-lg bg-muted border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-sm">{t('auth.confirmNewPassword')}</Label>
                <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} disabled={loading} className="h-10 rounded-lg bg-muted border-border" />
              </div>
              <Button type="submit" className="w-full h-10 rounded-lg font-medium" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('auth.updatePassword')}
              </Button>
            </form>
          ) : sent ? (
            <div className="text-center py-6">
              <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
              <p className="text-sm text-muted-foreground mb-6">{t('auth.resetSentDesc')}</p>
              <Button variant="outline" onClick={() => navigate('/auth')} className="gap-2">
                <ArrowLeft className="h-4 w-4" />{t('auth.backToLogin')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSendReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-sm">{t('auth.email')}</Label>
                <Input id="reset-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} className="h-10 rounded-lg bg-muted border-border" />
              </div>
              <Button type="submit" className="w-full h-10 rounded-lg font-medium" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('auth.resetPassword')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate('/auth')} className="w-full gap-2 text-muted-foreground">
                <ArrowLeft className="h-4 w-4" />{t('auth.backToLogin')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
