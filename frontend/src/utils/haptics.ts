/**
 * Cross-platform haptic feedback helper.
 * No-op on web, native feedback on Capacitor (Android/iOS).
 */
import { Capacitor } from '@capacitor/core';

type Style = 'light' | 'medium' | 'heavy';

export async function hapticImpact(style: Style = 'light'): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    const map: Record<Style, any> = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    };
    await Haptics.impact({ style: map[style] });
  } catch {
    // silently ignore
  }
}

export async function hapticSuccess(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // ignore
  }
}
