/**
 * Capacitor-compatible storage adapter for Supabase auth.
 * Uses @capacitor/preferences on native (Android/iOS) for persistent storage,
 * and falls back to localStorage on web/browser.
 */

import { Capacitor } from '@capacitor/core';

/** Returns true when running inside a native Capacitor app (Android/iOS) */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** localStorage-compatible adapter backed by @capacitor/preferences */
const capacitorStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key });
      return value;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key, value });
    } catch {
      // silently fail
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key });
    } catch {
      // silently fail
    }
  },
};

/**
 * Unified storage: uses native Capacitor Preferences on device,
 * plain localStorage in browser.
 */
export const supabaseStorage = isNativePlatform()
  ? capacitorStorageAdapter
  : localStorage;
