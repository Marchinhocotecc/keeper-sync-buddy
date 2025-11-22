/**
 * Advanced DateTime Parser - Parsing avanzato di date e orari dal linguaggio naturale
 */

import { addDays, addHours, addMinutes, addWeeks, setHours, setMinutes, startOfDay, endOfDay, nextMonday, nextTuesday, nextWednesday, nextThursday, nextFriday, nextSaturday, nextSunday, parse } from 'date-fns';

export interface ParsedDateTime {
  date: Date;
  hasSpecificTime: boolean;
  timeOfDay?: 'mattina' | 'pomeriggio' | 'sera' | 'notte';
  isAllDay?: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export function parseDateTime(text: string, contextDate?: Date): ParsedDateTime | null {
  const lowerText = text.toLowerCase().trim();
  const now = contextDate || new Date();

  // 1. Date relative precise con orario
  const relativeWithTime = parseRelativeWithTime(lowerText, now);
  if (relativeWithTime) return relativeWithTime;

  // 2. Weekdays con momento del giorno
  const weekdayWithTime = parseWeekdayWithTime(lowerText, now);
  if (weekdayWithTime) return weekdayWithTime;

  // 3. Date relative semplici
  const relativeDate = parseRelativeDate(lowerText, now);
  if (relativeDate) return relativeDate;

  // 4. Orari assoluti (oggi)
  const absoluteTime = parseAbsoluteTime(lowerText, now);
  if (absoluteTime) return absoluteTime;

  // 5. Momenti del giorno (oggi)
  const timeOfDay = parseTimeOfDay(lowerText, now);
  if (timeOfDay) return timeOfDay;

  // 6. Date calendario esplicite
  const calendarDate = parseCalendarDate(lowerText, now);
  if (calendarDate) return calendarDate;

  return null;
}

function parseRelativeWithTime(text: string, now: Date): ParsedDateTime | null {
  // "tra 2 ore", "fra 30 minuti", "tra poco"
  const traOreMatch = text.match(/(?:tra|fra)\s+(\d+)\s+or[ea]/i);
  if (traOreMatch) {
    const hours = parseInt(traOreMatch[1]);
    return {
      date: addHours(now, hours),
      hasSpecificTime: true,
      confidence: 'high'
    };
  }

  const traMinutiMatch = text.match(/(?:tra|fra)\s+(\d+)\s+minut[oi]/i);
  if (traMinutiMatch) {
    const minutes = parseInt(traMinutiMatch[1]);
    return {
      date: addMinutes(now, minutes),
      hasSpecificTime: true,
      confidence: 'high'
    };
  }

  if (/(?:tra|fra)\s+poco/i.test(text)) {
    return {
      date: addHours(now, 1),
      hasSpecificTime: true,
      confidence: 'medium'
    };
  }

  // "domani alle 15", "dopodomani alle 9:30"
  const domaniAlleMatch = text.match(/domani\s+alle?\s+(\d{1,2})(?:[:.](\d{2}))?/i);
  if (domaniAlleMatch) {
    const hour = parseInt(domaniAlleMatch[1]);
    const minute = domaniAlleMatch[2] ? parseInt(domaniAlleMatch[2]) : 0;
    const tomorrow = addDays(now, 1);
    return {
      date: setMinutes(setHours(tomorrow, hour), minute),
      hasSpecificTime: true,
      confidence: 'high'
    };
  }

  const dopodomaniAlleMatch = text.match(/dopodomani\s+alle?\s+(\d{1,2})(?:[:.](\d{2}))?/i);
  if (dopodomaniAlleMatch) {
    const hour = parseInt(dopodomaniAlleMatch[1]);
    const minute = dopodomaniAlleMatch[2] ? parseInt(dopodomaniAlleMatch[2]) : 0;
    const dayAfterTomorrow = addDays(now, 2);
    return {
      date: setMinutes(setHours(dayAfterTomorrow, hour), minute),
      hasSpecificTime: true,
      confidence: 'high'
    };
  }

  return null;
}

function parseWeekdayWithTime(text: string, now: Date): ParsedDateTime | null {
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
    if (text.includes(day)) {
      const targetDate = fn(now);
      
      // Check for specific time
      const timeMatch = text.match(/alle?\s+(\d{1,2})(?:[:.](\d{2}))?/i);
      if (timeMatch) {
        const hour = parseInt(timeMatch[1]);
        const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        return {
          date: setMinutes(setHours(targetDate, hour), minute),
          hasSpecificTime: true,
          confidence: 'high'
        };
      }

      // Check for time of day
      if (/mattina/i.test(text)) {
        return {
          date: setHours(targetDate, 9),
          hasSpecificTime: false,
          timeOfDay: 'mattina',
          confidence: 'high'
        };
      }
      if (/pomeriggio/i.test(text)) {
        return {
          date: setHours(targetDate, 15),
          hasSpecificTime: false,
          timeOfDay: 'pomeriggio',
          confidence: 'high'
        };
      }
      if (/sera/i.test(text)) {
        return {
          date: setHours(targetDate, 20),
          hasSpecificTime: false,
          timeOfDay: 'sera',
          confidence: 'high'
        };
      }
      if (/notte/i.test(text)) {
        return {
          date: setHours(targetDate, 23),
          hasSpecificTime: false,
          timeOfDay: 'notte',
          confidence: 'high'
        };
      }

      // Default to 9:00 for weekday
      return {
        date: setHours(targetDate, 9),
        hasSpecificTime: false,
        confidence: 'medium'
      };
    }
  }

  return null;
}

function parseRelativeDate(text: string, now: Date): ParsedDateTime | null {
  // "oggi", "domani", "dopodomani"
  if (/\boggi\b/i.test(text)) {
    return applyTimeContext(text, now, 'high');
  }

  if (/\bdomani\b/i.test(text)) {
    return applyTimeContext(text, addDays(now, 1), 'high');
  }

  if (/\bdopodomani\b/i.test(text)) {
    return applyTimeContext(text, addDays(now, 2), 'high');
  }

  // "stasera", "domattina", "stamattina"
  if (/\bstasera\b/i.test(text)) {
    return {
      date: setHours(now, 21),
      hasSpecificTime: false,
      timeOfDay: 'sera',
      confidence: 'high'
    };
  }

  if (/\b(?:do)?mattina\b/i.test(text) && /domani|doma/i.test(text)) {
    return {
      date: setHours(addDays(now, 1), 9),
      hasSpecificTime: false,
      timeOfDay: 'mattina',
      confidence: 'high'
    };
  }

  if (/\bstamattina\b/i.test(text)) {
    return {
      date: setHours(now, 9),
      hasSpecificTime: false,
      timeOfDay: 'mattina',
      confidence: 'high'
    };
  }

  // "tra X giorni", "fra una settimana"
  const traGiorniMatch = text.match(/(?:tra|fra)\s+(\d+)\s+giorn[oi]/i);
  if (traGiorniMatch) {
    const days = parseInt(traGiorniMatch[1]);
    return applyTimeContext(text, addDays(now, days), 'high');
  }

  const traSettimaneMatch = text.match(/(?:tra|fra)\s+(?:una|1)\s+settimana/i);
  if (traSettimaneMatch) {
    return applyTimeContext(text, addWeeks(now, 1), 'medium');
  }

  return null;
}

function parseAbsoluteTime(text: string, now: Date): ParsedDateTime | null {
  // "alle 15", "alle 9:30", "9:00", "15.30"
  const timePatterns = [
    /\balle?\s+(\d{1,2})(?:[:.](\d{2}))?\b/i,
    /\b(\d{1,2})[:.](\d{2})\b/,
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      const hour = parseInt(match[1]);
      const minute = match[2] ? parseInt(match[2]) : 0;
      
      if (hour >= 0 && hour <= 23) {
        return {
          date: setMinutes(setHours(now, hour), minute),
          hasSpecificTime: true,
          confidence: 'high'
        };
      }
    }
  }

  return null;
}

function parseTimeOfDay(text: string, now: Date): ParsedDateTime | null {
  if (/\bmattina\b/i.test(text)) {
    return {
      date: setHours(now, 9),
      hasSpecificTime: false,
      timeOfDay: 'mattina',
      confidence: 'medium'
    };
  }

  if (/\bpranzo\b/i.test(text)) {
    return {
      date: setHours(now, 13),
      hasSpecificTime: false,
      timeOfDay: 'pomeriggio',
      confidence: 'medium'
    };
  }

  if (/\bpomeriggio\b/i.test(text)) {
    return {
      date: setHours(now, 15),
      hasSpecificTime: false,
      timeOfDay: 'pomeriggio',
      confidence: 'medium'
    };
  }

  if (/\bsera\b/i.test(text)) {
    return {
      date: setHours(now, 20),
      hasSpecificTime: false,
      timeOfDay: 'sera',
      confidence: 'medium'
    };
  }

  if (/\bnotte\b/i.test(text)) {
    return {
      date: setHours(now, 23),
      hasSpecificTime: false,
      timeOfDay: 'notte',
      confidence: 'medium'
    };
  }

  return null;
}

function parseCalendarDate(text: string, now: Date): ParsedDateTime | null {
  // "il 14 dicembre", "14/12", "14-12-2024"
  const monthNames = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 
                      'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  // "il 14 dicembre"
  const namedDateMatch = text.match(/\bil\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/i);
  if (namedDateMatch) {
    const day = parseInt(namedDateMatch[1]);
    const monthIndex = monthNames.indexOf(namedDateMatch[2].toLowerCase());
    const year = now.getFullYear();
    const targetDate = new Date(year, monthIndex, day);
    return applyTimeContext(text, targetDate, 'high');
  }

  // "14/12" or "14-12" or "14/12/2024"
  const numericDateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (numericDateMatch) {
    const day = parseInt(numericDateMatch[1]);
    const month = parseInt(numericDateMatch[2]) - 1;
    let year = numericDateMatch[3] ? parseInt(numericDateMatch[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    
    const targetDate = new Date(year, month, day);
    return applyTimeContext(text, targetDate, 'high');
  }

  return null;
}

function applyTimeContext(text: string, baseDate: Date, confidence: 'high' | 'medium' | 'low'): ParsedDateTime {
  // Check for specific time first
  const timeMatch = text.match(/alle?\s+(\d{1,2})(?:[:.](\d{2}))?/i);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1]);
    const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    return {
      date: setMinutes(setHours(baseDate, hour), minute),
      hasSpecificTime: true,
      confidence
    };
  }

  // Check for time of day
  if (/mattina/i.test(text)) {
    return {
      date: setHours(baseDate, 9),
      hasSpecificTime: false,
      timeOfDay: 'mattina',
      confidence
    };
  }
  if (/pranzo/i.test(text)) {
    return {
      date: setHours(baseDate, 13),
      hasSpecificTime: false,
      timeOfDay: 'pomeriggio',
      confidence
    };
  }
  if (/pomeriggio/i.test(text)) {
    return {
      date: setHours(baseDate, 15),
      hasSpecificTime: false,
      timeOfDay: 'pomeriggio',
      confidence
    };
  }
  if (/sera/i.test(text)) {
    return {
      date: setHours(baseDate, 20),
      hasSpecificTime: false,
      timeOfDay: 'sera',
      confidence
    };
  }
  if (/notte/i.test(text)) {
    return {
      date: setHours(baseDate, 23),
      hasSpecificTime: false,
      timeOfDay: 'notte',
      confidence
    };
  }

  // Check for all-day keywords
  const allDayKeywords = ['compleanno', 'festa', 'anniversario', 'ricorrenza', 'ferie', 'vacanza'];
  if (allDayKeywords.some(kw => text.includes(kw))) {
    return {
      date: startOfDay(baseDate),
      hasSpecificTime: false,
      isAllDay: true,
      confidence
    };
  }

  // Default: 9:00 AM
  return {
    date: setHours(baseDate, 9),
    hasSpecificTime: false,
    confidence: confidence === 'high' ? 'medium' : 'low'
  };
}

export function calculateEndTime(startTime: Date, isAllDay: boolean = false, durationHours: number = 1): Date {
  if (isAllDay) {
    return endOfDay(startTime);
  }
  return addHours(startTime, durationHours);
}

export function formatDateForDisplay(date: Date): string {
  const days = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const months = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 
                  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  
  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];
  
  return `${dayName} ${day} ${month}`;
}

export function formatTimeForDisplay(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
