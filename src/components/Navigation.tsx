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
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 max-w-screen-xl">
        <div className="flex items-center justify-between h-14 sm:h-16">
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent hidden sm:block">
              LUMI
            </h1>
          </Link>
          
          <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 md:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all shrink-0',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              );
            })}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="ml-1 sm:ml-2 h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-foreground shrink-0 rounded-xl"
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
