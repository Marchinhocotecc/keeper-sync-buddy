import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import { 
  User, 
  Globe, 
  Moon, 
  Sun, 
  Monitor, 
  Brain, 
  HelpCircle, 
  LogOut, 
  Mail, 
  ChevronRight,
  Loader2,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useSettings } from '@/hooks/useSettings';
import { useNavigate } from 'react-router-dom';
import NotificationSettings from '@/components/NotificationSettings';

interface UserProfile {
  email: string;
  name: string;
  avatarUrl: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.3 }
  }
} as const;

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();

  // User state
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile>({
    email: '',
    name: '',
    avatarUrl: ''
  });
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  // Settings from hook
  const { settings, isLoading: isLoadingSettings, updateSettings } = useSettings(user?.id);

  // Local state for settings
  const [assistantMemory, setAssistantMemory] = useState(true);

  // Modals
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showResetMemoryModal, setShowResetMemoryModal] = useState(false);
  
  // Form state
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingMemory, setIsResettingMemory] = useState(false);

  // Load user on mount
  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        setUserProfile({
          email: user.email || '',
          name: user.user_metadata?.full_name || user.user_metadata?.name || '',
          avatarUrl: user.user_metadata?.avatar_url || ''
        });
        setProfileName(user.user_metadata?.full_name || user.user_metadata?.name || '');
        setProfileEmail(user.email || '');
      }
      setIsLoadingUser(false);
    };
    loadUser();
  }, []);

  // Sync settings to local state (for assistant memory)
  useEffect(() => {
    // assistant_memory handled separately
  }, [settings]);

  // Handle language change
  const handleLanguageChange = async (value: string) => {
    i18n.changeLanguage(value);
    if (user?.id) {
      await updateSettings.mutateAsync({ language: value });
    }
  };

  // Handle theme change
  const handleThemeChange = async (value: string) => {
    setTheme(value);
    if (user?.id) {
      await updateSettings.mutateAsync({ theme: value });
    }
  };

  // Handle assistant memory toggle
  const handleAssistantMemoryChange = async (checked: boolean) => {
    setAssistantMemory(checked);
    // Store in assistant_state (consolidated table)
    if (user?.id) {
      try {
        // Get current state
        const { data: currentState } = await supabase
          .from('assistant_state')
          .select('intent_payload')
          .eq('user_id', user.id)
          .maybeSingle();

        const currentPayload = (currentState?.intent_payload as Record<string, any>) || {};

        await supabase
          .from('assistant_state')
          .upsert({
            user_id: user.id,
            intent_payload: {
              ...currentPayload,
              memory_enabled: checked
            },
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
        toast({ title: checked ? 'Memoria assistente attivata' : 'Memoria assistente disattivata' });
      } catch (error) {
        console.error('Error updating assistant memory:', error);
      }
    }
  };

  // Reset assistant memory
  const handleResetMemory = async () => {
    setIsResettingMemory(true);
    try {
      if (user?.id) {
        // Reset messages and intent in assistant_state
        await supabase
          .from('assistant_state')
          .update({ 
            messages: [],
            active_intent: 'NONE',
            intent_payload: {},
            awaiting_confirmation: false,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);
        
        toast({ title: 'Memoria assistente resettata con successo' });
        setShowResetMemoryModal(false);
      }
    } catch (error) {
      toast({ 
        title: 'Errore durante il reset della memoria',
        variant: 'destructive'
      });
    } finally {
      setIsResettingMemory(false);
    }
  };

  // Save profile
  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const updates: any = {};
      
      if (profileName !== userProfile.name) {
        updates.data = { full_name: profileName };
      }
      
      if (profileEmail !== userProfile.email) {
        updates.email = profileEmail;
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.auth.updateUser(updates);
        if (error) throw error;

        setUserProfile(prev => ({
          ...prev,
          name: profileName,
          email: profileEmail
        }));

        toast({ title: 'Profilo aggiornato con successo' });
      }
      
      setShowProfileModal(false);
    } catch (error: any) {
      toast({ 
        title: 'Errore durante l\'aggiornamento del profilo',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const getInitials = (name: string, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  if (isLoadingUser) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-20 sm:pb-24">
      <div className="container mx-auto px-4 py-6 max-w-lg">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 sm:mb-6"
        >
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">{t('settings.title')}</h1>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-3 sm:space-y-4"
        >
          {/* Profile Section */}
          <motion.div variants={itemVariants}>
            <Card className="app-card overflow-hidden">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-border shrink-0">
                    <AvatarImage src={userProfile.avatarUrl} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm sm:text-lg font-medium">
                      {getInitials(userProfile.name, userProfile.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base font-medium text-foreground truncate">
                      {userProfile.name || 'Utente'}
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      {userProfile.email}
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowProfileModal(true)}
                    className="text-primary text-xs sm:text-sm shrink-0"
                  >
                    Modifica
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Language Section */}
          <motion.div variants={itemVariants}>
            <Card className="app-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-3 mb-2 sm:mb-3">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <Globe className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-sm sm:text-base font-medium">{t('settings.language')}</Label>
                    <p className="text-xs sm:text-sm text-muted-foreground">{t('settings.languageDesc')}</p>
                  </div>
                </div>
                <Select value={i18n.language} onValueChange={handleLanguageChange}>
                  <SelectTrigger className="h-10 sm:h-11 mt-2 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="it">🇮🇹 Italiano</SelectItem>
                    <SelectItem value="en">🇬🇧 English</SelectItem>
                    <SelectItem value="es">🇪🇸 Español</SelectItem>
                    <SelectItem value="fr">🇫🇷 Français</SelectItem>
                    <SelectItem value="de">🇩🇪 Deutsch</SelectItem>
                    <SelectItem value="pt">🇵🇹 Português</SelectItem>
                    <SelectItem value="ru">🇷🇺 Русский</SelectItem>
                    <SelectItem value="zh">🇨🇳 中文</SelectItem>
                    <SelectItem value="ja">🇯🇵 日本語</SelectItem>
                    <SelectItem value="ko">🇰🇷 한국어</SelectItem>
                    <SelectItem value="hi">🇮🇳 हिन्दी</SelectItem>
                    <SelectItem value="nl">🇳🇱 Nederlands</SelectItem>
                    <SelectItem value="pl">🇵🇱 Polski</SelectItem>
                    <SelectItem value="sv">🇸🇪 Svenska</SelectItem>
                    <SelectItem value="no">🇳🇴 Norsk</SelectItem>
                    <SelectItem value="da">🇩🇰 Dansk</SelectItem>
                    <SelectItem value="ro">🇷🇴 Română</SelectItem>
                    <SelectItem value="hr">🇭🇷 Hrvatski</SelectItem>
                    <SelectItem value="sq">🇦🇱 Shqip</SelectItem>
                    <SelectItem value="lt">🇱🇹 Lietuvių</SelectItem>
                    <SelectItem value="lv">🇱🇻 Latviešu</SelectItem>
                    <SelectItem value="et">🇪🇪 Eesti</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </motion.div>

          {/* Theme Section */}
          <motion.div variants={itemVariants}>
          {/* Theme Section */}
          <motion.div variants={itemVariants}>
            <Card className="app-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-3 mb-2 sm:mb-3">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <Moon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-sm sm:text-base font-medium">{t('settings.theme')}</Label>
                    <p className="text-xs sm:text-sm text-muted-foreground">{t('settings.themeDesc')}</p>
                  </div>
                </div>
                <div className="flex gap-1.5 sm:gap-2 mt-2">
                  {[
                    { value: 'light', icon: Sun, label: t('settings.light') },
                    { value: 'dark', icon: Moon, label: t('settings.dark') },
                    { value: 'system', icon: Monitor, label: t('settings.system') }
                  ].map(({ value, icon: Icon, label }) => (
                    <Button
                      key={value}
                      variant={theme === value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleThemeChange(value)}
                      className="flex-1 gap-1 sm:gap-2 text-xs sm:text-sm h-9 sm:h-10"
                    >
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">{label}</span>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Notifications Section - New Component */}
          <motion.div variants={itemVariants}>
            <NotificationSettings userId={user?.id} />
          </motion.div>

          {/* Assistant Section */}
          <motion.div variants={itemVariants}>
            <Card className="app-card">
              <CardContent className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-sm sm:text-base font-medium">Assistente</Label>
                    <p className="text-xs sm:text-sm text-muted-foreground">Configura il tuo coach personale</p>
                  </div>
                </div>
                
                <Separator className="my-2" />
                
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-foreground">Memoria assistente</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">L'assistente ricorda le tue preferenze</p>
                  </div>
                  <Switch
                    checked={assistantMemory}
                    onCheckedChange={handleAssistantMemoryChange}
                    className="shrink-0"
                  />
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 text-xs sm:text-sm h-9 sm:h-10"
                  onClick={() => setShowResetMemoryModal(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2" />
                  Reset memoria assistente
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Support Section */}
          <motion.div variants={itemVariants}>
            <Card className="app-card">
              <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                <div className="flex items-center gap-3 mb-1 sm:mb-2">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-sm sm:text-base font-medium">Supporto</Label>
                    <p className="text-xs sm:text-sm text-muted-foreground">Assistenza e informazioni</p>
                  </div>
                </div>
                
                <a 
                  href="mailto:support@ayvro.app"
                  className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                    <span className="text-xs sm:text-sm font-medium">Scrivici</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                </a>
                
                <a 
                  href="/privacy"
                  className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                    <span className="text-xs sm:text-sm font-medium">Privacy & Termini</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                </a>
              </CardContent>
            </Card>
          </motion.div>

          {/* Logout Button */}
          <motion.div variants={itemVariants}>
            <Button 
              variant="outline" 
              className="w-full h-10 sm:h-12 text-xs sm:text-sm text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              onClick={handleLogout}
            >
              <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2" />
              {t('nav.logout')}
            </Button>
          </motion.div>
        </motion.div>

        {/* Profile Edit Modal */}
        <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
          <DialogContent className="max-w-sm mx-4">
            <DialogHeader>
              <DialogTitle>Modifica Profilo</DialogTitle>
              <DialogDescription>
                Aggiorna le tue informazioni personali
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Il tuo nome"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  placeholder="La tua email"
                />
              </div>
              <a 
                href="#" 
                className="text-sm text-primary hover:underline block"
                onClick={(e) => {
                  e.preventDefault();
                  toast({ title: 'Funzionalità in arrivo', description: 'Il cambio password sarà disponibile presto.' });
                }}
              >
                Cambia password
              </a>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowProfileModal(false)}>
                Annulla
              </Button>
              <Button onClick={handleSaveProfile} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvataggio...
                  </>
                ) : 'Salva'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </motion.div>

        {/* Reset Memory Confirmation Modal */}
        <Dialog open={showResetMemoryModal} onOpenChange={setShowResetMemoryModal}>
          <DialogContent className="max-w-sm mx-4">
            <DialogHeader>
              <DialogTitle>Reset Memoria Assistente</DialogTitle>
              <DialogDescription>
                Sei sicuro di voler resettare la memoria dell'assistente? Tutte le preferenze salvate verranno eliminate.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowResetMemoryModal(false)}>
                Annulla
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleResetMemory}
                disabled={isResettingMemory}
              >
                {isResettingMemory ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Reset in corso...
                  </>
                ) : 'Conferma Reset'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
