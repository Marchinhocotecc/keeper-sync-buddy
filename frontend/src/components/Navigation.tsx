import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Calendar, DollarSign, MessageSquare, Settings, LogOut } from 'lucide-react';
import ayvroLogo from '@/assets/ayvro-logo.png';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { hapticImpact } from '@/utils/haptics';

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
      toast({ title: t('common.error'), description: t('common.tryAgain'), variant: 'destructive' });
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
    <>
      {/* Desktop top nav */}
      <nav className="sticky top-0 z-50 w-full bg-card border-b border-border h-[56px] hidden sm:block">
        <div className="container mx-auto px-4 sm:px-6 max-w-screen-xl h-full">
          <div className="flex items-center justify-between h-full">
            <Link to="/" className="flex items-center gap-2 shrink-0 group">
              <img src={ayvroLogo} alt="Ayvro" width={32} height={32} className="w-8 h-8 rounded-lg shadow-ayvro group-hover:shadow-[0_4px_16px_rgba(15,61,62,0.3)] transition-shadow" />
              <h1 className="text-base sm:text-lg font-semibold text-foreground tracking-tight">Ayvro</h1>
            </Link>

            <div className="flex items-center gap-1">
              {links.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.to;
                return (
                  <Link key={link.to} to={link.to} className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}>
                    <Icon className={cn('h-4 w-4', isActive ? 'text-primary-foreground' : '')} />
                    <span className="text-[13px]">{link.label}</span>
                  </Link>
                );
              })}
              <Button variant="ghost" size="icon" onClick={handleLogout} className="ml-1 h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 rounded-lg" title={t('nav.logout')}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile bottom tab bar — native feel: blur, pill indicator, haptic */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden safe-area-bottom border-t border-border/40 bg-glass-strong shadow-[0_-1px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-stretch justify-around h-[60px] px-1">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => { if (!isActive) hapticImpact('light'); }}
                className={cn(
                  'relative flex flex-col items-center justify-center flex-1 min-w-0 transition-transform active:scale-[0.92] gap-0.5',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
                aria-current={isActive ? 'page' : undefined}
                aria-label={link.label}
              >
                <Icon
                  className={cn('h-[22px] w-[22px] transition-all', isActive && 'text-primary')}
                  strokeWidth={isActive ? 2.4 : 2}
                />
                <span className={cn(
                  'text-[10px] font-medium tracking-tight transition-all leading-none',
                  isActive ? 'opacity-100' : 'opacity-0 h-0'
                )}>
                  {link.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
