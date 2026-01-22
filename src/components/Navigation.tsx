import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Calendar, DollarSign, MessageSquare, Settings, LogOut, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function Navigation() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/auth');
    } catch (error: any) {
      toast({
        title: 'Ops!',
        description: 'Qualcosa è andato storto. Riprova.',
        variant: 'destructive',
      });
    }
  };

  const links = [
    { to: '/', icon: Home, label: t('nav.home') },
    { to: '/calendar', icon: Calendar, label: t('nav.calendar') },
    { to: '/expenses', icon: DollarSign, label: t('nav.expenses') },
    { to: '/assistant', icon: MessageSquare, label: t('nav.assistant') },
    { to: '/settings', icon: Settings, label: t('nav.settings') },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full bg-card shadow-lumi-nav h-[72px]">
      <div className="container mx-auto px-4 sm:px-6 max-w-screen-xl h-full">
        <div className="flex items-center justify-between h-full">
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-lumi group-hover:shadow-[0_4px_20px_rgba(140,123,255,0.4)] transition-shadow">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-primary hidden sm:block">
              LUMI
            </h1>
          </Link>
          
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-lumi-glow'
                      : 'text-muted-foreground hover:text-primary hover:bg-muted'
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-primary-foreground" : "text-primary")} />
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              );
            })}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="ml-1 sm:ml-2 h-9 w-9 text-muted-foreground hover:text-primary shrink-0 rounded-xl"
              title={t('nav.logout')}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
