import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthenticated(true);
        checkOnboarding(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session);
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkOnboarding = async (userId: string) => {
    const flag = localStorage.getItem(`onboarding_completed_${userId}`);
    if (flag === 'true') {
      setLoading(false);
      return;
    }

    try {
      const [{ count: taskCount }, { data: budget }] = await Promise.all([
        supabase.from('todos').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('budgets').select('id').eq('user_id', userId).limit(1),
      ]);

      if ((taskCount ?? 0) === 0 && (!budget || budget.length === 0)) {
        setNeedsOnboarding(true);
      } else {
        localStorage.setItem(`onboarding_completed_${userId}`, 'true');
      }
    } catch {
      // If check fails, let them through
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
