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
import { useAuth } from '@/contexts/AuthContext';
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
  const { user, isLoading: isAuthLoading } = useAuth();

  // User state
  const [userProfile, setUserProfile] = useState<UserProfile>({
    email: '',
    name: '',
    avatarUrl: ''
  });

  // Settings from hook
  const { settings, isLoading: isLoadingSettings, updateSettings } = useSettings(user?.id);

  // Local state for settings
  const [assistantMemory, setAssistantMemory] = useState(true);

  // Modals
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showResetMemoryModal, setShowResetMemoryModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  
  // Form state
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingMemory, setIsResettingMemory] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Sync user profile from auth context
  useEffect(() => {
    if (user) {
      setUserProfile({
        email: user.email || '',
        name: user.user_metadata?.full_name || user.user_metadata?.name || '',
        avatarUrl: user.user_metadata?.avatar_url || ''
      });
      setProfileName(user.user_metadata?.full_name || user.user_metadata?.name || '');
      setProfileEmail(user.email || '');
    }
  }, [user]);

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
        toast({ title: checked ? t('settings.assistantMemoryEnabled') : t('settings.assistantMemoryDisabled') });
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
        
        toast({ title: t('settings.resetMemorySuccess') });
        setShowResetMemoryModal(false);
      }
    } catch (error) {
      toast({ title: t('settings.resetMemoryError'), variant: 'destructive' });
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

        toast({ title: t('settings.profileUpdated') });
      }
      
      setShowProfileModal(false);
    } catch (error: any) {
      toast({ title: t('settings.profileUpdateError'), description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  // Delete account permanently
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'ELIMINA' && deleteConfirmText !== 'DELETE') return;
    setIsDeletingAccount(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      await supabase.auth.signOut();
      toast({ title: t('settings.deleteAccountSuccess') });
      navigate('/auth');
    } catch (e: any) {
      toast({ title: t('common.error'), description: e?.message ?? '', variant: 'destructive' });
    } finally {
      setIsDeletingAccount(false);
      setShowDeleteAccountModal(false);
      setDeleteConfirmText('');
    }
  };

  const getInitials = (name: string, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  if (isAuthLoading) {
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
                      {userProfile.name || t('common.user')}
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
                    {t('settings.editProfile')}
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
                    <Label className="text-sm sm:text-base font-medium">{t('settings.assistant')}</Label>
                    <p className="text-xs sm:text-sm text-muted-foreground">{t('settings.assistantDesc')}</p>
                  </div>
                </div>
                
                <Separator className="my-2" />
                
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-foreground">{t('settings.assistantMemory')}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{t('settings.assistantMemoryDesc')}</p>
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
                  {t('settings.resetMemory')}
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
                    <Label className="text-sm sm:text-base font-medium">{t('settings.support')}</Label>
                    <p className="text-xs sm:text-sm text-muted-foreground">{t('settings.supportDesc')}</p>
                  </div>
                </div>
                
                <a 
                  href="mailto:support@ayvro.app"
                  className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                    <span className="text-xs sm:text-sm font-medium">{t('settings.contactUs')}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                </a>
                
                <a 
                  href="/privacy"
                  className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                    <span className="text-xs sm:text-sm font-medium">{t('settings.privacyTerms')}</span>
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

          {/* Delete Account (GDPR + App Store / Play Store compliance) */}
          <motion.div variants={itemVariants}>
            <Button
              variant="ghost"
              className="w-full h-10 sm:h-12 text-xs sm:text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteAccountModal(true)}
            >
              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-2" />
              {t('settings.deleteAccount')}
            </Button>
          </motion.div>
        </motion.div>

        {/* Profile Edit Modal */}
        <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
          <DialogContent className="max-w-sm mx-4">
            <DialogHeader>
              <DialogTitle>{t('settings.editProfileTitle')}</DialogTitle>
              <DialogDescription>{t('settings.editProfileDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('settings.name')}</Label>
                <Input
                  id="name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder={t('settings.namePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('settings.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  placeholder={t('settings.emailPlaceholder')}
                />
              </div>
              <a 
                href="#" 
                className="text-sm text-primary hover:underline block"
                onClick={(e) => {
                  e.preventDefault();
                  toast({ title: t('settings.changePasswordSoon') });
                }}
              >
                {t('settings.changePassword')}
              </a>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowProfileModal(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleSaveProfile} disabled={isSaving}>
                {isSaving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('common.saving')}</>) : t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Memory Confirmation Modal */}
        <Dialog open={showResetMemoryModal} onOpenChange={setShowResetMemoryModal}>
          <DialogContent className="max-w-sm mx-4">
            <DialogHeader>
              <DialogTitle>{t('settings.resetMemoryTitle')}</DialogTitle>
              <DialogDescription>{t('settings.resetMemoryDesc')}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowResetMemoryModal(false)}>{t('common.cancel')}</Button>
              <Button 
                variant="destructive" 
                onClick={handleResetMemory}
                disabled={isResettingMemory}
              >
                {isResettingMemory ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('settings.resetting')}</>) : t('settings.resetConfirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Account Modal */}
        <Dialog open={showDeleteAccountModal} onOpenChange={(o) => { setShowDeleteAccountModal(o); if (!o) setDeleteConfirmText(''); }}>
          <DialogContent className="max-w-sm mx-4">
            <DialogHeader>
              <DialogTitle className="text-destructive">{t('settings.deleteAccountTitle')}</DialogTitle>
              <DialogDescription>{t('settings.deleteAccountDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="del-confirm" className="text-xs">{t('settings.deleteAccountConfirmLabel')}</Label>
              <Input
                id="del-confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="ELIMINA"
                autoComplete="off"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowDeleteAccountModal(false)}>{t('common.cancel')}</Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount || (deleteConfirmText !== 'ELIMINA' && deleteConfirmText !== 'DELETE')}
              >
                {isDeletingAccount ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('common.loading')}</>) : t('settings.deleteAccountConfirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
