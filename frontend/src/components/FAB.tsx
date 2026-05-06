import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { hapticImpact } from '@/utils/haptics';

interface FABProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  icon: React.ReactNode;
  onClick?: () => void;
  ariaLabel: string;
  /** Optional label shown beside the icon (extended FAB) */
  label?: string;
  /** Hide the FAB on desktop (default: true — desktop uses inline buttons) */
  mobileOnly?: boolean;
}

/**
 * Material/iOS-inspired floating action button.
 * Spring-animated, haptic on press, sits above the bottom tab bar.
 */
export function FAB({
  icon,
  onClick,
  ariaLabel,
  label,
  mobileOnly = true,
  className,
  ...rest
}: FABProps) {
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      initial={{ opacity: 0, scale: 0.6, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.1 }}
      whileTap={{ scale: 0.92 }}
      onClick={() => {
        hapticImpact('medium');
        onClick?.();
      }}
      className={cn(
        'fab-container flex items-center gap-2 rounded-full bg-primary text-primary-foreground',
        'shadow-[0_8px_24px_rgba(15,61,62,0.35)] active:shadow-[0_4px_12px_rgba(15,61,62,0.4)]',
        'transition-shadow',
        label ? 'pl-4 pr-5 h-14' : 'h-14 w-14 justify-center',
        mobileOnly && 'sm:hidden',
        className
      )}
      {...rest}
    >
      <span className="flex items-center justify-center">{icon}</span>
      {label && <span className="font-semibold text-[15px]">{label}</span>}
    </motion.button>
  );
}

export default FAB;
