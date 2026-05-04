import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Capacitor } from '@capacitor/core';

export function OfflineBanner() {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Native: bootstrap from Network plugin
    let cleanup: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      (async () => {
        try {
          const { Network } = await import('@capacitor/network');
          const status = await Network.getStatus();
          setIsOffline(!status.connected);
        } catch {}
      })();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      cleanup?.();
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-warning text-warning-foreground text-center text-xs font-medium py-1.5 px-4 flex items-center justify-center gap-2 z-50"
        >
          <WifiOff className="h-3.5 w-3.5" />
          <span>{t('common.offline')}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
