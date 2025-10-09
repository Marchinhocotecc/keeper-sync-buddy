import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
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
          <CardTitle className="text-3xl">{t('terms.title')}</CardTitle>
        </CardHeader>
        <CardContent className="prose dark:prose-invert max-w-none">
          <p className="text-muted-foreground">{t('terms.lastUpdated')}: October 9, 2025</p>

          <h2>{t('terms.section1Title')}</h2>
          <p>{t('terms.section1Content')}</p>

          <h2>{t('terms.section2Title')}</h2>
          <p>{t('terms.section2Content')}</p>

          <h2>{t('terms.section3Title')}</h2>
          <p>{t('terms.section3Content')}</p>

          <h2>{t('terms.section4Title')}</h2>
          <p>{t('terms.section4Content')}</p>

          <h2>{t('terms.section5Title')}</h2>
          <p>{t('terms.section5Content')}</p>
        </CardContent>
      </Card>
    </main>
  );
}