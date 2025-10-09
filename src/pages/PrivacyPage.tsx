import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <Link to="/settings">
        <Button variant="ghost" className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">{t('privacy.title')}</CardTitle>
        </CardHeader>
        <CardContent className="prose dark:prose-invert max-w-none">
          <p className="text-muted-foreground">{t('privacy.lastUpdated')}: October 9, 2025</p>

          <h2>{t('privacy.section1Title')}</h2>
          <p>{t('privacy.section1Content')}</p>

          <h2>{t('privacy.section2Title')}</h2>
          <p>{t('privacy.section2Content')}</p>

          <h2>{t('privacy.section3Title')}</h2>
          <p>{t('privacy.section3Content')}</p>

          <h2>{t('privacy.section4Title')}</h2>
          <p>{t('privacy.section4Content')}</p>

          <h2>{t('privacy.section5Title')}</h2>
          <p>{t('privacy.section5Content')}</p>
        </CardContent>
      </Card>
    </main>
  );
}