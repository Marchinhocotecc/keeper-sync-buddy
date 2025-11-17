import { addDays, setHours, setMinutes, startOfDay, endOfDay, nextMonday, nextTuesday, nextWednesday, nextThursday, nextFriday, nextSaturday, nextSunday } from 'date-fns';

export interface ParsedEventDate {
  date: Date;
  hasSpecificTime: boolean;
  timeOfDay?: 'mattina' | 'pomeriggio' | 'sera' | 'notte';
  isAllDay?: boolean;
}

export function parseNaturalDate(text: string): ParsedEventDate | null {
  const lowerText = text.toLowerCase().trim();
  const now = new Date();

  // Relative days
  if (lowerText.includes('oggi')) {
    return extractTimeContext(lowerText, now);
  }
  if (lowerText.includes('domani')) {
    return extractTimeContext(lowerText, addDays(now, 1));
  }
  if (lowerText.includes('dopodomani')) {
    return extractTimeContext(lowerText, addDays(now, 2));
  }

  // "Tra X giorni"
  const traMatch = lowerText.match(/tra\s+(\d+)\s+giorn[oi]/);
  if (traMatch) {
    const days = parseInt(traMatch[1]);
    return extractTimeContext(lowerText, addDays(now, days));
  }

  // Weekday names
  const weekdayMap: { [key: string]: (date: Date) => Date } = {
    'lunedì': nextMonday,
    'lunedi': nextMonday,
    'martedì': nextTuesday,
    'martedi': nextTuesday,
    'mercoledì': nextWednesday,
    'mercoledi': nextWednesday,
    'giovedì': nextThursday,
    'giovedi': nextThursday,
    'venerdì': nextFriday,
    'venerdi': nextFriday,
    'sabato': nextSaturday,
    'domenica': nextSunday,
  };

  for (const [day, fn] of Object.entries(weekdayMap)) {
    if (lowerText.includes(day)) {
      const targetDate = fn(now);
      return extractTimeContext(lowerText, targetDate);
    }
  }

  // Calendar date patterns: "il 14 dicembre", "14/12", "14-12"
  const datePatterns = [
    /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/,
    /il\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/i
  ];

  for (const pattern of datePatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      let day: number, month: number, year: number;
      
      if (match[0].includes('il')) {
        // "il 14 dicembre"
        day = parseInt(match[1]);
        const monthNames = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 
                           'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
        month = monthNames.indexOf(match[2].toLowerCase()) + 1;
        year = now.getFullYear();
      } else {
        // "14/12" or "14-12"
        day = parseInt(match[1]);
        month = parseInt(match[2]);
        year = match[3] ? parseInt(match[3]) : now.getFullYear();
        if (year < 100) year += 2000;
      }

      const targetDate = new Date(year, month - 1, day);
      return extractTimeContext(lowerText, targetDate);
    }
  }

  return null;
}

function extractTimeContext(text: string, baseDate: Date): ParsedEventDate {
  const lowerText = text.toLowerCase();

  // Specific time patterns: "alle 9", "alle 14:30", "9:00", "15.30"
  const timePatterns = [
    /alle?\s+(\d{1,2})(?:[:.](\d{2}))?/,
    /(\d{1,2})[:.](\d{2})/,
  ];

  for (const pattern of timePatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      const hour = parseInt(match[1]);
      const minute = match[2] ? parseInt(match[2]) : 0;
      const dateWithTime = setMinutes(setHours(baseDate, hour), minute);
      return {
        date: dateWithTime,
        hasSpecificTime: true,
      };
    }
  }

  // Time of day keywords
  if (lowerText.includes('mattina')) {
    return {
      date: setHours(baseDate, 9),
      hasSpecificTime: false,
      timeOfDay: 'mattina',
    };
  }
  if (lowerText.includes('pomeriggio')) {
    return {
      date: setHours(baseDate, 15),
      hasSpecificTime: false,
      timeOfDay: 'pomeriggio',
    };
  }
  if (lowerText.includes('sera')) {
    return {
      date: setHours(baseDate, 20),
      hasSpecificTime: false,
      timeOfDay: 'sera',
    };
  }
  if (lowerText.includes('notte')) {
    return {
      date: setHours(baseDate, 23),
      hasSpecificTime: false,
      timeOfDay: 'notte',
    };
  }

  // All-day events: compleanno, festa, anniversario
  const allDayKeywords = ['compleanno', 'festa', 'anniversario', 'ricorrenza'];
  if (allDayKeywords.some(kw => lowerText.includes(kw))) {
    return {
      date: startOfDay(baseDate),
      hasSpecificTime: false,
      isAllDay: true,
    };
  }

  // Default: 9:00 AM
  return {
    date: setHours(baseDate, 9),
    hasSpecificTime: false,
  };
}

export function calculateEndTime(startTime: Date, isAllDay: boolean = false): Date {
  if (isAllDay) {
    return endOfDay(startTime);
  }
  // Default duration: 1 hour
  const endTime = new Date(startTime);
  endTime.setHours(startTime.getHours() + 1);
  return endTime;
}

export function formatEventDate(date: Date): string {
  const days = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const months = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 
                  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  
  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];
  
  return `${dayName} ${day} ${month}`;
}

export function formatEventTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
