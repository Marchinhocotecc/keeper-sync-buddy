/**
 * Settings Service - Centralized settings management
 * 
 * GARANTISCE che ogni utente abbia SEMPRE una riga in settings.
 * Elimina errori 406 usando .maybeSingle() e auto-creazione.
 */

import { supabase } from '@/integrations/supabase/client';

export interface UserSettings {
  id?: string;
  user_id: string;
  theme: string;
  language: string;
  notifications_enabled: boolean;
  notify_tasks: boolean;
  notify_calendar: boolean;
  notify_daily_focus: boolean;
  notify_wellbeing: boolean;
  notify_focus_time: string;
  notify_wellbeing_time: string;
  notify_task_before_minutes: number;
  created_at?: string;
  updated_at?: string;
}

// Default settings per nuovi utenti
const DEFAULT_SETTINGS: Omit<UserSettings, 'user_id' | 'id' | 'created_at' | 'updated_at'> = {
  theme: 'light',
  language: 'it',
  notifications_enabled: true,
  notify_tasks: true,
  notify_calendar: true,
  notify_daily_focus: true,
  notify_wellbeing: false,
  notify_focus_time: '08:30',
  notify_wellbeing_time: '20:30',
  notify_task_before_minutes: 60
};

/**
 * FUNZIONE CENTRALE: Garantisce che l'utente abbia una riga in settings
 * 
 * - Cerca la riga esistente con .maybeSingle() (NO 406)
 * - Se non esiste, la crea con valori default
 * - Ritorna SEMPRE un oggetto UserSettings valido
 * - NON lancia errori, gestisce tutto internamente
 */
export async function ensureUserSettings(userId: string): Promise<UserSettings> {
  if (!userId) {
    console.warn('[SettingsService] ensureUserSettings chiamato senza userId');
    return { user_id: '', ...DEFAULT_SETTINGS };
  }

  try {
    // Step 1: Cerca riga esistente con maybeSingle (NON single!)
    const { data: existing, error: selectError } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (selectError) {
      console.error('[SettingsService] Errore select settings:', selectError);
      // Fallback: ritorna defaults senza crash
      return { user_id: userId, ...DEFAULT_SETTINGS };
    }

    // Step 2: Se esiste, ritornala
    if (existing) {
      return existing as UserSettings;
    }

    // Step 3: Se non esiste, creala con defaults
    console.log('[SettingsService] Creo settings per utente:', userId);
    
    const newSettings = {
      user_id: userId,
      ...DEFAULT_SETTINGS,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: inserted, error: insertError } = await supabase
      .from('settings')
      .insert(newSettings)
      .select()
      .maybeSingle();

    if (insertError) {
      console.error('[SettingsService] Errore creazione settings:', insertError);
      // Fallback: ritorna oggetto costruito localmente
      return newSettings as UserSettings;
    }

    return (inserted || newSettings) as UserSettings;

  } catch (error) {
    console.error('[SettingsService] Errore inatteso in ensureUserSettings:', error);
    return { user_id: userId, ...DEFAULT_SETTINGS };
  }
}

/**
 * Aggiorna settings esistenti (partial update)
 * Chiama automaticamente ensureUserSettings prima
 */
export async function updateUserSettings(
  userId: string, 
  updates: Partial<Omit<UserSettings, 'user_id' | 'id' | 'created_at'>>
): Promise<UserSettings> {
  if (!userId) {
    throw new Error('userId richiesto per updateUserSettings');
  }

  // Assicura che la riga esista prima di aggiornare
  await ensureUserSettings(userId);

  const { data, error } = await supabase
    .from('settings')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('[SettingsService] Errore update settings:', error);
    throw error;
  }

  return data as UserSettings;
}

/**
 * Ottiene solo le preferenze base (lingua, tema, notifiche)
 * Usa ensureUserSettings internamente
 */
export async function getUserPreferences(userId: string): Promise<{
  language: string;
  theme: string;
  notificationsEnabled: boolean;
}> {
  const settings = await ensureUserSettings(userId);
  
  return {
    language: settings.language || 'it',
    theme: settings.theme || 'light',
    notificationsEnabled: settings.notifications_enabled ?? true
  };
}
