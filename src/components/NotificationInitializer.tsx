/**
 * Notification Initializer Component
 * Initializes the notification service and schedules daily notifications
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  initNotificationService, 
  rescheduleDailyNotifications,
  getNotificationPreferencesFromSettings
} from '@/services/notificationService';

export function NotificationInitializer() {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      // Initialize notification service
      await initNotificationService();

      // Get current user and schedule daily notifications
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user settings
      const { data: settings } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (settings) {
        const prefs = getNotificationPreferencesFromSettings(settings);
        if (prefs.enabled) {
          await rescheduleDailyNotifications(user.id, prefs);
        }
      }
    };

    init();
  }, []);

  return null;
}
