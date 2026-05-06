import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional right-side action button (e.g. icon button) */
  action?: React.ReactNode;
  /** Hide the inline (large) title and only show the sticky compact bar */
  compactOnly?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * iOS-style large title that collapses into a sticky compact header on scroll.
 * - Mobile: large title (32px) inline + sticky compact bar that fades in once scrolled past it.
 * - Desktop (>=sm): regular page header (large title shown inline, no collapse).
 */
export function MobilePageHeader({ title, subtitle, action, compactOnly, className, children }: MobilePageHeaderProps) {
  const [collapsed, setCollapsed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (compactOnly) {
      setCollapsed(true);
      return;
    }
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const obs = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-44px 0px 0px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [compactOnly]);

  return (
    <>
      {/* Sticky compact bar — appears when large title scrolls out of view */}
      <div
        className={cn(
          'sticky top-0 z-30 -mx-4 px-4 sm:-mx-6 sm:px-6 transition-[opacity,transform,backdrop-filter] duration-200 ease-out',
          collapsed ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none'
        )}
        aria-hidden={!collapsed}
      >
        <div className="bg-glass border-b border-border/60 -mx-4 sm:-mx-6 px-4 sm:px-6">
          <div className="flex items-center justify-between h-12">
            <h2 className="compact-title truncate">{title}</h2>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        </div>
      </div>

      {/* Large title (visible until scrolled past) */}
      {!compactOnly && (
        <div className={cn('pt-2 pb-3 sm:pt-4 sm:pb-4', className)}>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="large-title truncate">{title}</h1>
              {subtitle && (
                <p className="mt-1 text-[14px] text-muted-foreground leading-relaxed line-clamp-2">
                  {subtitle}
                </p>
              )}
            </div>
            {action ? <div className="shrink-0 pb-1">{action}</div> : null}
          </div>
          {children}
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />
        </div>
      )}
    </>
  );
}

export default MobilePageHeader;
