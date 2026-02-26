import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Calendar, DollarSign, MessageSquare, Settings, LogOut } from 'lucide-react';
import ayvroLogo from '@/assets/ayvro-logo.png';
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
      toast({ title: 'Error', description: 'Something went wrong. Try again.', variant: 'destructive' });
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
    <nav className="sticky top-0 z-50 w-full bg-card border-b border-border h-[56px]">
      <div className="container mx-auto px-4 sm:px-6 max-w-screen-xl h-full">
        <div className="flex items-center justify-between h-full">
          <Link to="/" className="flex items-center gap-2 shrink-0 group">
            <img src={ayvroLogo} alt="Ayvro" className="w-8 h-8 rounded-lg shadow-ayvro group-hover:shadow-[0_4px_16px_rgba(15,61,62,0.3)] transition-shadow" />
            <h1 className="text-base sm:text-lg font-semibold text-foreground tracking-tight hidden sm:block">
              Ayvro
            </h1>
          </Link>
          
          <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.to;
              return (
                <Link key={link.to} to={link.to} className={cn(
                  'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-all shrink-0',
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}>
                  <Icon className={cn("h-4 w-4", isActive ? "text-primary-foreground" : "")} />
                  <span className="hidden sm:inline text-[13px]">{link.label}</span>
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
  );
}
