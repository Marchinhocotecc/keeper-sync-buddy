import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default function CalendarPage() {
  const { t } = useTranslation();
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t('calendar.title')}</h1>
      <div className="grid gap-6 md:grid-cols-[1fr,300px]">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">{t('calendar.events')}</h2>
          {date ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">{format(date, 'MMMM d, yyyy')}</h3>
                <Badge variant="secondary">Today</Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                No events scheduled for this day.
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">Select a date to view events</p>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">{t('calendar.filters')}</h2>
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            className="rounded-md border"
          />
        </Card>
      </div>
    </main>
  );
}
