import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from 'next-themes';
import { Globe, Moon } from 'lucide-react';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-6 py-8 max-w-screen-xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{t('settings.title')}</h1>
          <p className="text-muted-foreground">Personalizza la tua esperienza</p>
        </div>
        
        <div className="grid gap-6 max-w-2xl">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="border-b border-border/50">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>{t('settings.language')}</CardTitle>
                  <CardDescription className="mt-1">{t('settings.languageDesc')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="language">Seleziona lingua</Label>
                <Select value={i18n.language} onValueChange={(value) => i18n.changeLanguage(value)}>
                  <SelectTrigger id="language" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="border-b border-border/50">
              <div className="flex items-center gap-2">
                <Moon className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>{t('settings.theme')}</CardTitle>
                  <CardDescription className="mt-1">{t('settings.themeDesc')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="theme">Seleziona tema</Label>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger id="theme" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t('settings.light')}</SelectItem>
                    <SelectItem value="dark">{t('settings.dark')}</SelectItem>
                    <SelectItem value="system">{t('settings.system')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
