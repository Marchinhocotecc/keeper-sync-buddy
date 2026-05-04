/**
 * Native lifecycle hook — initialises Capacitor plugins on native platforms.
 * - Splash screen hide
 * - Status bar style
 * - Keyboard resize
 * - Hardware back button (Android)
 * - Deep link handling (com.ayvro.app://...)
 * - App resume → invalidate queries
 * - Online/offline detection mirrored to window events
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';

export function useNativeApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: Array<() => void> = [];

    (async () => {
      try {
        // Status bar
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: Style.Dark });
        try {
          await StatusBar.setBackgroundColor({ color: '#0F3D3E' });
        } catch {
          // iOS doesn't support setBackgroundColor
        }
      } catch {}

      try {
        // Splash screen
        const { SplashScreen } = await import('@capacitor/splash-screen');
        await SplashScreen.hide({ fadeOutDuration: 400 });
      } catch {}

      try {
        // Keyboard
        const { Keyboard } = await import('@capacitor/keyboard');
        const showSub = await Keyboard.addListener('keyboardWillShow', () => {
          document.body.classList.add('keyboard-open');
        });
        const hideSub = await Keyboard.addListener('keyboardWillHide', () => {
          document.body.classList.remove('keyboard-open');
        });
        cleanup.push(() => { showSub.remove(); hideSub.remove(); });
      } catch {}

      try {
        // App lifecycle, back button, deep links
        const { App } = await import('@capacitor/app');

        const back = await App.addListener('backButton', ({ canGoBack }) => {
          // Close any open dialogs first
          const openDialog = document.querySelector('[role="dialog"][data-state="open"]');
          if (openDialog) {
            const closeBtn = openDialog.querySelector('[data-dismiss], [aria-label="Close"]') as HTMLElement | null;
            if (closeBtn) { closeBtn.click(); return; }
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            return;
          }

          // Exit on home, otherwise go back
          if (window.location.pathname === '/' || !canGoBack) {
            App.exitApp();
          } else {
            window.history.back();
          }
        });
        cleanup.push(() => back.remove());

        const url = await App.addListener('appUrlOpen', (event) => {
          try {
            const u = new URL(event.url);
            // com.ayvro.app://auth-callback → route to /auth and let supabase parse
            const path = (u.host || '') + (u.pathname || '');
            if (path.includes('auth-callback')) {
              navigate('/auth' + (u.search || '') + (u.hash || ''));
            }
          } catch {}
        });
        cleanup.push(() => url.remove());

        const state = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            // Refresh data when returning to foreground
            queryClient.invalidateQueries();
          }
        });
        cleanup.push(() => state.remove());
      } catch {}

      try {
        // Network → mirror to window events so OfflineBanner stays simple
        const { Network } = await import('@capacitor/network');
        const sub = await Network.addListener('networkStatusChange', (status) => {
          window.dispatchEvent(new Event(status.connected ? 'online' : 'offline'));
        });
        cleanup.push(() => sub.remove());

        const status = await Network.getStatus();
        if (!status.connected) window.dispatchEvent(new Event('offline'));
      } catch {}
    })();

    return () => {
      cleanup.forEach((fn) => { try { fn(); } catch {} });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No return — pure side-effect hook
  void location;
}
