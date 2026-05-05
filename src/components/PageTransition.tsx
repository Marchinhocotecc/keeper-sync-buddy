import React from 'react';
import { motion } from 'framer-motion';

/**
 * Native-feeling page transition.
 * - Mobile/touch: subtle horizontal slide (iOS push)
 * - Reduced motion: simple fade
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
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
