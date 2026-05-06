/**
 * Hook for managing notifications
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  initNotificationService,
  requestNotificationPermission,
  canShowNotifications,
  getPermissionStatus,
  rescheduleDailyNotifications,
  scheduleTaskNotification,
  scheduleEventNotification,
  cancelNotificationsForItem,
  getNotificationPreferencesFromSettings,
  type NotificationPreferences
} from '@/services/notificationService';
import { useSettings } from '@/hooks/useSettings';

export function useNotifications(userId?: string) {
  const { toast } = useToast();
  const { settings, updateSettings } = useSettings(userId);
  const [isInitialized, setIsInitialized] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    enabled: true,
    tasks: true,
    calendar: true,
    dailyFocus: true,
    wellbeing: false,
    focusTime: '08:30',
    wellbeingTime: '20:30',
    taskBeforeMinutes: 60
  });

  // Initialize notification service
  useEffect(() => {
    const init = async () => {
      await initNotificationService();
      setPermissionStatus(getPermissionStatus());
      setIsInitialized(true);
    };
    init();
  }, []);

  // Sync preferences from settings
  useEffect(() => {
    if (settings) {
      const prefs = getNotificationPreferencesFromSettings(settings);
      setPreferences(prefs);
    }
  }, [settings]);

  // Request permission
  const requestPermission = useCallback(async () => {
    const granted = await requestNotificationPermission();
    setPermissionStatus(getPermissionStatus());
    
    if (granted) {
      toast({
        title: '🔔 Notifiche attivate',
        description: 'Riceverai promemoria per task, eventi e altro.'
      });
      
      // Schedule daily notifications
      if (userId && preferences.enabled) {
        await rescheduleDailyNotifications(userId, preferences);
      }
    } else {
      toast({
        title: 'Notifiche non attivate',
        description: 'Puoi attivarle dalle impostazioni del browser.',
        variant: 'default'
      });
    }
    
    return granted;
  }, [userId, preferences, toast]);

  // Update a preference
  const updatePreference = useCallback(async <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => {
    if (!userId) return;

    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);

    // Map to database fields
    const dbUpdate: Record<string, any> = {};
    switch (key) {
      case 'enabled':
        dbUpdate.notifications_enabled = value;
        break;
      case 'tasks':
        dbUpdate.notify_tasks = value;
        break;
      case 'calendar':
        dbUpdate.notify_calendar = value;
        break;
      case 'dailyFocus':
        dbUpdate.notify_daily_focus = value;
        break;
      case 'wellbeing':
        dbUpdate.notify_wellbeing = value;
        break;
      case 'focusTime':
        dbUpdate.notify_focus_time = value;
        break;
      case 'wellbeingTime':
        dbUpdate.notify_wellbeing_time = value;
        break;
      case 'taskBeforeMinutes':
        dbUpdate.notify_task_before_minutes = value;
        break;
    }

    try {
      await updateSettings.mutateAsync(dbUpdate);
      
      // Reschedule daily notifications if relevant settings changed
      if (['enabled', 'dailyFocus', 'wellbeing', 'focusTime', 'wellbeingTime'].includes(key)) {
        await rescheduleDailyNotifications(userId, newPrefs);
      }
    } catch (error) {
      console.error('Error updating notification preference:', error);
    }
  }, [userId, preferences, updateSettings]);

  // Schedule task notification
  const scheduleForTask = useCallback(async (
    taskId: string,
    title: string,
    dueDate: string | null
  ) => {
    if (!userId || !preferences.enabled || !preferences.tasks) return false;
    return scheduleTaskNotification(userId, taskId, title, dueDate, preferences.taskBeforeMinutes);
  }, [userId, preferences]);

  // Schedule event notification
  const scheduleForEvent = useCallback(async (
    eventId: string,
    title: string,
    startTime: string
  ) => {
    if (!userId || !preferences.enabled || !preferences.calendar) return false;
    return scheduleEventNotification(userId, eventId, title, startTime);
  }, [userId, preferences]);

  // Cancel notifications for an item
  const cancelForItem = useCallback(async (itemId: string) => {
    if (!userId) return false;
    return cancelNotificationsForItem(userId, itemId);
  }, [userId]);

  return {
    isInitialized,
    permissionStatus,
    canShow: canShowNotifications(),
    preferences,
    requestPermission,
    updatePreference,
    scheduleForTask,
    scheduleForEvent,
    cancelForItem
  };
}
