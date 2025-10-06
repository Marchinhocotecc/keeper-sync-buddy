import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from 'next-themes';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t('settings.title')}</h1>
      
      <div className="grid gap-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.language')}</CardTitle>
            <CardDescription>Choose your preferred language</CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="language">{t('settings.language')}</Label>
            <Select value={i18n.language} onValueChange={(value) => i18n.changeLanguage(value)}>
              <SelectTrigger id="language" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="it">Italiano</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.theme')}</CardTitle>
            <CardDescription>Customize the app appearance</CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="theme">{t('settings.theme')}</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger id="theme" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">{t('settings.light')}</SelectItem>
                <SelectItem value="dark">{t('settings.dark')}</SelectItem>
                <SelectItem value="system">{t('settings.system')}</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
