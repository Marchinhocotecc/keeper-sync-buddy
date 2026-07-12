import React from 'react';
import { motion } from 'framer-motion';
import { SHOULD_DISABLE_ANIMATIONS } from '@/utils/platform';

/**
 * Native-feeling page transition.
 * - Web / iOS: subtle horizontal slide (iOS push feel)
 * - Native Android: pass-through (no motion component at all)
 *
 * On Android the GL compositor OOMs with even small transforms multiplied
 * across pages + FAB + bottom sheets, so we skip motion entirely.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  if (SHOULD_DISABLE_ANIMATIONS) {
    return <>{children}</>;
  }
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
