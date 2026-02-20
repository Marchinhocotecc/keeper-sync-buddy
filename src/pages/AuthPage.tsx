import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { isNativePlatform } from '@/lib/capacitorStorage';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Zap } from 'lucide-react';

export default function AuthPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        checkTermsAcceptance(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        checkTermsAcceptance(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const checkTermsAcceptance = (user: any) => {
    const termsAccepted = user?.user_metadata?.terms_accepted;
    if (termsAccepted) {
      navigate('/');
    } else {
      navigate('/accept-terms');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!termsAccepted) {
      toast({
        title: 'Terms required',
        description: 'Please accept the Terms and Conditions to continue.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      // On native APK use custom URL scheme; on web use origin
      const redirectTo = isNativePlatform()
        ? 'io.ayro.app://auth-callback'
        : `${window.location.origin}/`;

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            terms_accepted: true,
            terms_accepted_at: new Date().toISOString(),
          },
        },
      });

      if (error) throw error;

      toast({
        title: 'Check your email',
        description: 'We sent you a confirmation link.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const termsAccepted = data.user?.user_metadata?.terms_accepted;
      if (!termsAccepted) {
        navigate('/accept-terms');
      } else {
        navigate('/');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-xl border-border bg-card">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center shadow-ayro">
              <Zap className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-semibold text-foreground tracking-tight">
            Ayro
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Intelligent productivity for ambitious minds
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 rounded-lg bg-muted p-1">
              <TabsTrigger value="signin" className="rounded-md text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-md text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email-signin" className="text-sm">Email</Label>
                  <Input
                    id="email-signin"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="h-10 rounded-lg bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-signin" className="text-sm">Password</Label>
                  <Input
                    id="password-signin"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="h-10 rounded-lg bg-muted border-border"
                  />
                </div>
                <Button type="submit" className="w-full h-10 rounded-lg font-medium" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email-signup" className="text-sm">Email</Label>
                  <Input
                    id="email-signup"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="h-10 rounded-lg bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-signup" className="text-sm">Password</Label>
                  <Input
                    id="password-signup"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    minLength={6}
                    className="h-10 rounded-lg bg-muted border-border"
                  />
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                    disabled={loading}
                    className="mt-0.5"
                  />
                  <Label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer text-muted-foreground">
                    I accept the{' '}
                    <Link
                      to="/terms-and-conditions"
                      className="text-primary hover:underline font-medium"
                      target="_blank"
                    >
                      Terms and Conditions
                    </Link>
                  </Label>
                </div>
                <Button type="submit" className="w-full h-10 rounded-lg font-medium" disabled={loading || !termsAccepted}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
