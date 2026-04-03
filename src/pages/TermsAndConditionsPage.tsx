import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ScrollText } from 'lucide-react';

export default function TermsAndConditionsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const sections = [
    { title: t('terms.section1Title'), content: t('terms.section1Content') },
    { title: t('terms.section2Title'), content: t('terms.section2Content') },
    { title: t('terms.section3Title'), content: t('terms.section3Content') },
    { title: t('terms.section4Title'), content: t('terms.section4Content') },
    { title: t('terms.section5Title'), content: t('terms.section5Content') },
  ];

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Button>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="border-b border-border/50">
            <div className="flex items-center gap-3">
              <ScrollText className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">{t('terms.title')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6 max-h-[60vh] overflow-y-auto">
            {sections.map((section, i) => (
              <section key={i}>
                <h2 className="text-lg font-semibold mb-3">{section.title}</h2>
                <p className="text-muted-foreground leading-relaxed">{section.content}</p>
              </section>
            ))}

            <p className="text-sm text-muted-foreground pt-4 border-t border-border/50">
              {t('terms.lastUpdated')}: December 2024
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
