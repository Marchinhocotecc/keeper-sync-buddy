/**
 * Notification Settings Component
 * Granular control over notification preferences
 */

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Bell, 
  BellOff, 
  CheckSquare, 
  Calendar, 
  Target, 
  Heart,
  Clock,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useNotifications } from '@/hooks/useNotifications';

interface NotificationSettingsProps {
  userId?: string;
}

const timeOptions = [
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'
];

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } }
};

export default function NotificationSettings({ userId }: NotificationSettingsProps) {
  const {
    isInitialized,
    permissionStatus,
    canShow,
    preferences,
    requestPermission,
    updatePreference
  } = useNotifications(userId);

  if (!isInitialized) {
    return (
      <Card className="app-card">
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-1/3"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const needsPermission = permissionStatus !== 'granted' && preferences.enabled;
  const permissionDenied = permissionStatus === 'denied';

  return (
    <Card className="app-card">
      <CardContent className="p-3 sm:p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <Label className="text-sm sm:text-base font-medium">Notifiche</Label>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Promemoria gentili quando servono
            </p>
          </div>
        </div>

        {/* Permission Alert */}
        {permissionDenied && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Le notifiche sono bloccate. Attivale dalle impostazioni del browser.
            </AlertDescription>
          </Alert>
        )}

        {needsPermission && !permissionDenied && (
          <motion.div variants={itemVariants} initial="hidden" animate="visible">
            <Alert className="py-2 bg-primary/5 border-primary/20">
              <Bell className="h-4 w-4 text-primary" />
              <AlertDescription className="text-xs flex items-center justify-between">
                <span>Attiva le notifiche per ricevere promemoria</span>
                <Button size="sm" variant="default" onClick={requestPermission} className="ml-2 h-7 text-xs">
                  Attiva
                </Button>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        <Separator />

        {/* Master Toggle */}
        <motion.div 
          variants={itemVariants}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3 min-w-0">
            {preferences.enabled ? (
              <Bell className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">Tutte le notifiche</p>
              <p className="text-xs text-muted-foreground">Max 5 al giorno</p>
            </div>
          </div>
          <Switch
            checked={preferences.enabled}
            onCheckedChange={(checked) => updatePreference('enabled', checked)}
          />
        </motion.div>

        {/* Category Toggles */}
        {preferences.enabled && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 pl-2 border-l-2 border-border ml-2"
          >
            {/* Tasks */}
            <div className="flex items-center justify-between pl-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm">Task</p>
                  <p className="text-xs text-muted-foreground">Scadenze e promemoria</p>
                </div>
              </div>
              <Switch
                checked={preferences.tasks}
                onCheckedChange={(checked) => updatePreference('tasks', checked)}
              />
            </div>

            {/* Calendar */}
            <div className="flex items-center justify-between pl-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-sm">Calendario</p>
                  <p className="text-xs text-muted-foreground">30 min prima degli eventi</p>
                </div>
              </div>
              <Switch
                checked={preferences.calendar}
                onCheckedChange={(checked) => updatePreference('calendar', checked)}
              />
            </div>

            {/* Daily Focus */}
            <div className="flex items-center justify-between pl-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-sm">Focus giornaliero</p>
                  <p className="text-xs text-muted-foreground">Una volta al giorno</p>
                </div>
              </div>
              <Switch
                checked={preferences.dailyFocus}
                onCheckedChange={(checked) => updatePreference('dailyFocus', checked)}
              />
            </div>

            {preferences.dailyFocus && (
              <div className="pl-9">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Orario:</span>
                  <Select 
                    value={preferences.focusTime} 
                    onValueChange={(val) => updatePreference('focusTime', val)}
                  >
                    <SelectTrigger className="h-7 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.filter(t => t < '12:00').map(time => (
                        <SelectItem key={time} value={time} className="text-xs">
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Wellbeing */}
            <div className="flex items-center justify-between pl-3">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-red-400" />
                <div>
                  <p className="text-sm">Benessere</p>
                  <p className="text-xs text-muted-foreground">Check-in serale</p>
                </div>
              </div>
              <Switch
                checked={preferences.wellbeing}
                onCheckedChange={(checked) => updatePreference('wellbeing', checked)}
              />
            </div>

            {preferences.wellbeing && (
              <div className="pl-9">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Orario:</span>
                  <Select 
                    value={preferences.wellbeingTime} 
                    onValueChange={(val) => updatePreference('wellbeingTime', val)}
                  >
                    <SelectTrigger className="h-7 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.filter(t => t >= '18:00').map(time => (
                        <SelectItem key={time} value={time} className="text-xs">
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Status indicator */}
        {canShow && preferences.enabled && (
          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Notifiche attive</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
