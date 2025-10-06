import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Calendar, DollarSign, MessageSquare, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Navigation() {
  const { t } = useTranslation();
  const location = useLocation();

  const links = [
    { to: '/', icon: Home, label: t('nav.home') },
    { to: '/calendar', icon: Calendar, label: t('nav.calendar') },
    { to: '/expenses', icon: DollarSign, label: t('nav.expenses') },
    { to: '/assistant', icon: MessageSquare, label: t('nav.assistant') },
    { to: '/settings', icon: Settings, label: t('nav.settings') },
  ];

  return (
    <nav className="border-b bg-card">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Daily Sync Keeper
          </h1>
          <div className="flex gap-1">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
