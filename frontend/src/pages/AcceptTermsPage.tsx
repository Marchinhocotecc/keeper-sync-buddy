import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ScrollText, Sparkles } from 'lucide-react';

export default function AcceptTermsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAcceptTerms = async () => {
    if (!accepted) {
      toast({
        title: t('common.error'),
        description: t('auth.termsRequired'),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
        },
      });

      if (error) throw error;

      toast({
        title: t('acceptTerms.welcomeTitle'),
        description: t('acceptTerms.welcomeDesc'),
      });

      navigate('/');
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md rounded-2xl shadow-lg border-border/50">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
              <Sparkles className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">{t('acceptTerms.title')} 🎉</CardTitle>
          <CardDescription>
            {t('acceptTerms.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 rounded-xl bg-muted/50 border border-border/50">
            <div className="flex items-start gap-3">
              <ScrollText className="h-5 w-5 text-primary mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="mb-2 font-medium text-foreground">
                  {t('acceptTerms.byUsing')}
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>{t('acceptTerms.rule1')}</li>
                  <li>{t('acceptTerms.rule2')}</li>
                  <li>{t('acceptTerms.rule3')}</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
            <Checkbox
              id="accept-terms"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
              disabled={loading}
              className="mt-0.5"
            />
            <Label htmlFor="accept-terms" className="text-sm leading-relaxed cursor-pointer">
              {t('auth.acceptTerms')}{' '}
              <Link
                to="/terms-and-conditions"
                className="text-primary hover:underline font-medium"
              >
                {t('auth.termsLink')}
              </Link>
            </Label>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleAcceptTerms}
              className="w-full rounded-xl ayvro-button"
              disabled={!accepted || loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('acceptTerms.continue')} ✨
            </Button>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full text-muted-foreground rounded-xl"
              disabled={loading}
            >
              {t('acceptTerms.logout')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
