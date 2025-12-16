/**
 * Local Notification Service
 * Handles scheduling, displaying, and managing notifications
 * Works offline, uses Web Notifications API
 */

import { supabase } from '@/integrations/supabase/client';
import { format, addMinutes, subMinutes, isAfter, isBefore, parseISO, setHours, setMinutes } from 'date-fns';

// Types
export interface NotificationPreferences {
  enabled: boolean;
  tasks: boolean;
  calendar: boolean;
  dailyFocus: boolean;
  wellbeing: boolean;
  focusTime: string; // HH:mm
  wellbeingTime: string; // HH:mm
  taskBeforeMinutes: number;
}

export interface ScheduledNotification {
  id?: string;
  user_id: string;
  type: 'task' | 'event' | 'daily_focus' | 'wellbeing';
  reference_id: string | null;
  scheduled_time: string;
  title: string;
  body: string;
  shown?: boolean;
}

// Constants
const MAX_NOTIFICATIONS_PER_DAY = 5;
const NOTIFICATION_CHECK_INTERVAL = 60000; // 1 minute
const STORAGE_KEY = 'notification_state';

// Permission state
let notificationPermission: NotificationPermission = 'default';
let checkInterval: NodeJS.Timeout | null = null;
let dailyNotificationCount = 0;
let lastCountResetDate = '';

/**
 * Initialize the notification service
 */
export async function initNotificationService(): Promise<boolean> {
  // Check if notifications are supported
  if (!('Notification' in window)) {
    console.warn('Notifications not supported in this browser');
    return false;
  }

  // Load state from localStorage
  loadState();

  // Get current permission
  notificationPermission = Notification.permission;

  // Start checking for pending notifications
  startNotificationChecker();

  return notificationPermission === 'granted';
}

/**
 * Request notification permission (call only when user explicitly enables)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    notificationPermission = permission;
    return permission === 'granted';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
}

/**
 * Check if notifications are available
 */
export function canShowNotifications(): boolean {
  return 'Notification' in window && notificationPermission === 'granted';
}

/**
 * Get current permission status
 */
export function getPermissionStatus(): NotificationPermission {
  return notificationPermission;
}

/**
 * Show a notification immediately
 */
export function showNotification(title: string, body: string, options?: {
  icon?: string;
  tag?: string;
  data?: any;
}): boolean {
  // Check daily limit
  checkDailyLimit();
  if (dailyNotificationCount >= MAX_NOTIFICATIONS_PER_DAY) {
    console.log('Daily notification limit reached');
    return false;
  }

  if (!canShowNotifications()) {
    console.warn('Cannot show notifications - permission not granted');
    return false;
  }

  try {
    const notification = new Notification(title, {
      body,
      icon: options?.icon || '/favicon.ico',
      tag: options?.tag,
      data: options?.data,
      requireInteraction: false,
      silent: false
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);

    dailyNotificationCount++;
    saveState();
    return true;
  } catch (error) {
    console.error('Error showing notification:', error);
    return false;
  }
}

/**
 * Schedule a notification for a task
 */
export async function scheduleTaskNotification(
  userId: string,
  taskId: string,
  title: string,
  dueDate: string | null,
  beforeMinutes: number = 60
): Promise<boolean> {
  if (!dueDate) {
    // No due date - schedule for 09:00 today or tomorrow
    const now = new Date();
    let scheduledTime = setHours(setMinutes(now, 0), 9);
    
    if (isAfter(now, scheduledTime)) {
      // Already past 9am, schedule for tomorrow
      scheduledTime = addMinutes(scheduledTime, 24 * 60);
    }
    
    return scheduleNotification({
      user_id: userId,
      type: 'task',
      reference_id: taskId,
      scheduled_time: scheduledTime.toISOString(),
      title: '📋 Task da completare',
      body: title
    });
  }

  // Schedule notification before due time
  const dueTime = parseISO(dueDate);
  const notifyTime = subMinutes(dueTime, beforeMinutes);

  // Don't schedule if the notify time is in the past
  if (isBefore(notifyTime, new Date())) {
    return false;
  }

  return scheduleNotification({
    user_id: userId,
    type: 'task',
    reference_id: taskId,
    scheduled_time: notifyTime.toISOString(),
    title: '⏰ Promemoria task',
    body: `"${title}" scade tra ${beforeMinutes} minuti`
  });
}

/**
 * Schedule a notification for a calendar event
 */
export async function scheduleEventNotification(
  userId: string,
  eventId: string,
  title: string,
  startTime: string,
  beforeMinutes: number = 30
): Promise<boolean> {
  const eventTime = parseISO(startTime);
  const notifyTime = subMinutes(eventTime, beforeMinutes);

  // Don't schedule if the notify time is in the past
  if (isBefore(notifyTime, new Date())) {
    return false;
  }

  return scheduleNotification({
    user_id: userId,
    type: 'event',
    reference_id: eventId,
    scheduled_time: notifyTime.toISOString(),
    title: '📅 Evento imminente',
    body: `"${title}" inizia tra ${beforeMinutes} minuti`
  });
}

/**
 * Schedule the daily focus notification
 */
export async function scheduleDailyFocusNotification(
  userId: string,
  focusTime: string = '08:30'
): Promise<boolean> {
  const now = new Date();
  const [hours, minutes] = focusTime.split(':').map(Number);
  let scheduledTime = setHours(setMinutes(now, minutes), hours);

  // If time has passed today, schedule for tomorrow
  if (isAfter(now, scheduledTime)) {
    scheduledTime = addMinutes(scheduledTime, 24 * 60);
  }

  return scheduleNotification({
    user_id: userId,
    type: 'daily_focus',
    reference_id: null,
    scheduled_time: scheduledTime.toISOString(),
    title: '🎯 Focus del giorno',
    body: 'Oggi concentrati su una cosa sola. Apri l\'app per scoprirla.'
  });
}

/**
 * Schedule the wellbeing reminder notification
 */
export async function scheduleWellbeingNotification(
  userId: string,
  wellbeingTime: string = '20:30'
): Promise<boolean> {
  const now = new Date();
  const [hours, minutes] = wellbeingTime.split(':').map(Number);
  let scheduledTime = setHours(setMinutes(now, minutes), hours);

  // If time has passed today, schedule for tomorrow
  if (isAfter(now, scheduledTime)) {
    scheduledTime = addMinutes(scheduledTime, 24 * 60);
  }

  return scheduleNotification({
    user_id: userId,
    type: 'wellbeing',
    reference_id: null,
    scheduled_time: scheduledTime.toISOString(),
    title: '💚 Come stai oggi?',
    body: 'Prenditi un momento per registrare il tuo benessere.'
  });
}

/**
 * Cancel a scheduled notification
 */
export async function cancelNotification(
  userId: string,
  type: string,
  referenceId: string | null
): Promise<boolean> {
  try {
    const query = supabase
      .from('scheduled_notifications')
      .delete()
      .eq('user_id', userId)
      .eq('type', type);

    if (referenceId) {
      query.eq('reference_id', referenceId);
    }

    const { error } = await query;
    return !error;
  } catch (error) {
    console.error('Error canceling notification:', error);
    return false;
  }
}

/**
 * Cancel all notifications for a task or event
 */
export async function cancelNotificationsForItem(
  userId: string,
  itemId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('user_id', userId)
      .eq('reference_id', itemId);

    return !error;
  } catch (error) {
    console.error('Error canceling notifications:', error);
    return false;
  }
}

/**
 * Schedule a notification in the database
 */
async function scheduleNotification(notification: ScheduledNotification): Promise<boolean> {
  try {
    // Use upsert to prevent duplicates
    const { error } = await supabase
      .from('scheduled_notifications')
      .upsert({
        user_id: notification.user_id,
        type: notification.type,
        reference_id: notification.reference_id,
        scheduled_time: notification.scheduled_time,
        title: notification.title,
        body: notification.body,
        shown: false
      }, {
        onConflict: 'user_id,type,reference_id,scheduled_time'
      });

    if (error) {
      console.error('Error scheduling notification:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error scheduling notification:', error);
    return false;
  }
}

/**
 * Check and show pending notifications
 */
async function checkPendingNotifications(): Promise<void> {
  if (!canShowNotifications()) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  try {
    const now = new Date().toISOString();

    // Get notifications that are due and not shown
    const { data: notifications, error } = await supabase
      .from('scheduled_notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('shown', false)
      .lte('scheduled_time', now)
      .order('scheduled_time', { ascending: true })
      .limit(5);

    if (error || !notifications) return;

    for (const notif of notifications) {
      // Show the notification
      const shown = showNotification(notif.title, notif.body, {
        tag: `${notif.type}-${notif.reference_id || 'general'}`
      });

      if (shown) {
        // Mark as shown
        await supabase
          .from('scheduled_notifications')
          .update({ shown: true })
          .eq('id', notif.id);
      }
    }

    // Clean up old notifications (older than 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('scheduled_notifications')
      .delete()
      .eq('user_id', user.id)
      .eq('shown', true)
      .lt('scheduled_time', yesterday);

  } catch (error) {
    console.error('Error checking pending notifications:', error);
  }
}

/**
 * Start the notification checker interval
 */
function startNotificationChecker(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  // Check immediately
  checkPendingNotifications();

  // Then check every minute
  checkInterval = setInterval(checkPendingNotifications, NOTIFICATION_CHECK_INTERVAL);
}

/**
 * Stop the notification checker
 */
export function stopNotificationChecker(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

/**
 * Check and reset daily notification count
 */
function checkDailyLimit(): void {
  const today = format(new Date(), 'yyyy-MM-dd');
  if (lastCountResetDate !== today) {
    dailyNotificationCount = 0;
    lastCountResetDate = today;
    saveState();
  }
}

/**
 * Save state to localStorage
 */
function saveState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      dailyCount: dailyNotificationCount,
      lastResetDate: lastCountResetDate
    }));
  } catch (error) {
    // localStorage not available
  }
}

/**
 * Load state from localStorage
 */
function loadState(): void {
  try {
    const state = localStorage.getItem(STORAGE_KEY);
    if (state) {
      const parsed = JSON.parse(state);
      dailyNotificationCount = parsed.dailyCount || 0;
      lastCountResetDate = parsed.lastResetDate || '';
    }
  } catch (error) {
    // localStorage not available
  }
}

/**
 * Reschedule daily notifications based on preferences
 */
export async function rescheduleDailyNotifications(
  userId: string,
  preferences: NotificationPreferences
): Promise<void> {
  // Cancel existing daily notifications
  await cancelNotification(userId, 'daily_focus', null);
  await cancelNotification(userId, 'wellbeing', null);

  // Schedule new ones if enabled
  if (preferences.enabled && preferences.dailyFocus) {
    await scheduleDailyFocusNotification(userId, preferences.focusTime);
  }

  if (preferences.enabled && preferences.wellbeing) {
    await scheduleWellbeingNotification(userId, preferences.wellbeingTime);
  }
}

/**
 * Get notification preferences from settings
 */
export function getNotificationPreferencesFromSettings(settings: any): NotificationPreferences {
  return {
    enabled: settings?.notifications_enabled ?? true,
    tasks: settings?.notify_tasks ?? true,
    calendar: settings?.notify_calendar ?? true,
    dailyFocus: settings?.notify_daily_focus ?? true,
    wellbeing: settings?.notify_wellbeing ?? false,
    focusTime: settings?.notify_focus_time ?? '08:30',
    wellbeingTime: settings?.notify_wellbeing_time ?? '20:30',
    taskBeforeMinutes: settings?.notify_task_before_minutes ?? 60
  };
}
