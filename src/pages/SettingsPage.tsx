import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from 'next-themes';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

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
            <CardDescription>{t('settings.languageDesc')}</CardDescription>
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
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="pt">Português</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
                <SelectItem value="ru">Русский</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="hi">हिन्दी</SelectItem>
                <SelectItem value="sv">Svenska</SelectItem>
                <SelectItem value="no">Norsk</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.theme')}</CardTitle>
            <CardDescription>{t('settings.themeDesc')}</CardDescription>
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

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.legal')}</CardTitle>
            <CardDescription>{t('settings.legalDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/terms">
              <Button variant="outline" className="w-full justify-start">
                {t('settings.terms')}
              </Button>
            </Link>
            <Link to="/privacy">
              <Button variant="outline" className="w-full justify-start">
                {t('settings.privacy')}
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.contact')}</CardTitle>
            <CardDescription>{t('settings.contactDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">{t('settings.contactEmail')}</p>
            <p className="text-sm font-medium">support@dailysynckeeper.com</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}