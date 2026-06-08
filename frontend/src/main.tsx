import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";

createRoot(document.getElementById("root")!).render(<App />);

// Hide boot splash once React has mounted (next frame to avoid flash)
requestAnimationFrame(() => {
  const splash = document.getElementById("boot-splash");
  if (splash) {
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 300);
  }
});

/**
 * Native SplashScreen safety-net (Capacitor).
 * The OS auto-hides the splash after launchShowDuration (2s) per capacitor.config.ts,
 * and useNativeApp() calls SplashScreen.hide() on first paint. This is a third
 * line of defense: every 5s try calling hide() again, up to 6 times (30s total).
 * SplashScreen.hide() is idempotent, so calling it when already hidden is a no-op.
 */
if (Capacitor.isNativePlatform()) {
  let attempts = 0;
  const MAX_ATTEMPTS = 6;
  const INTERVAL_MS = 5000;

  const tryHide = async () => {
    attempts += 1;
    try {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      await SplashScreen.hide();
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log(`[main] Splash hide() fallback attempt #${attempts}`);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(`[main] Splash hide() fallback failed (attempt #${attempts})`, err);
      }
    }
    if (attempts >= MAX_ATTEMPTS) {
      clearInterval(interval);
    }
  };

  const interval = setInterval(tryHide, INTERVAL_MS);
  // First fallback attempt at 5s, then every 5s up to 30s.
}
