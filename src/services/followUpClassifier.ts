/**
 * Follow-up Classifier - Deterministic classification for conversational follow-ups
 * NO AI - Pure pattern matching
 * 
 * FIXES:
 * - Italian accent normalization (venerdì → venerdi)
 * - Proper DATETIME detection (venerdì 8:30)
 * - Day-of-month (1-31) recognized as DATE, not TIME
 */

export type FollowUpType =
  | 'CONFIRM_YES'       // sì, ok, va bene
  | 'CONFIRM_NO'        // no, annulla, stop
  | 'CHOOSE_TASK'       // task
  | 'CHOOSE_EVENT'      // evento
  | 'DELETE_THESE'      // elimina, cancella, rimuovi
  | 'COMPLETE_THESE'    // completa, fatto, segna
  | 'PROVIDE_DATETIME'  // venerdì 8:30, domani alle 9
  | 'PROVIDE_DATE'      // domani, venerdì, 26
  | 'PROVIDE_TIME'      // 8:30, alle 9, alle 14:00
  | 'OTHER';            // Anything else

/**
 * Normalize Italian text for matching
 * - lowercase
 * - replace accented chars for matching
 */
function normalizeItalian(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[ìí]/g, 'i')
    .replace(/[àá]/g, 'a')
    .replace(/[èé]/g, 'e')
    .replace(/[òó]/g, 'o')
    .replace(/[ùú]/g, 'u');
}

// Patterns for each type
const CONFIRM_YES_PATTERNS = [
  /^(si|ok|va bene|perfetto|certo|esatto|proprio|procedi|conferma|dai|fallo|fai|fai pure|sicuro|assolutamente)$/i,
  /^(si,?\s*grazie|ok,?\s*grazie|va bene,?\s*grazie)$/i
];

const CONFIRM_NO_PATTERNS = [
  /^(no|niente|annulla|lascia|stop|ferma|cancella|nope|non|non voglio|lascia stare|lascia perdere|dimentica)$/i,
  /^(no,?\s*grazie|non serve|non importa)$/i
];

const CHOOSE_TASK_PATTERNS = [
  /^(task|un task|il task|crea task|fai task|come task)$/i,
  /\btask\b/i
];

const CHOOSE_EVENT_PATTERNS = [
  /^(evento|un evento|l'evento|crea evento|fai evento|come evento|appuntamento)$/i,
  /\bevento\b/i,
  /\bappuntamento\b/i
];

const DELETE_PATTERNS = [
  /^(elimina|cancella|rimuovi|togli|toglili|eliminali|cancellali|rimuovili)$/i,
  /\b(elimina|cancella|rimuovi|togli)\b.*\b(tutti|tutte|questi|queste|quelli|quelle)\b/i,
  /\b(tutti|tutte|questi|queste)\b.*\b(elimina|cancella|rimuovi)\b/i
];

const COMPLETE_PATTERNS = [
  /^(completa|completali|fatto|fatti|segna|segnali|chiudi|chiudili|spunta|spuntali)$/i,
  /\b(completa|segna|chiudi|spunta)\b.*\b(tutti|tutte|questi|queste)\b/i
];

// Italian weekdays (normalized, no accents)
const ITALIAN_WEEKDAYS = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'];

// Italian relative days
const ITALIAN_RELATIVE_DAYS = ['oggi', 'domani', 'dopodomani'];

// Italian months
const ITALIAN_MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 
                        'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/**
 * Check if message matches any pattern in the list
 */
function matchesAny(message: string, patterns: RegExp[]): boolean {
  const normalized = message.trim();
  return patterns.some(pattern => pattern.test(normalized));
}

/**
 * Check if normalized text contains a weekday
 */
function hasWeekday(normalized: string): boolean {
  return ITALIAN_WEEKDAYS.some(day => normalized.includes(day));
}

/**
 * Check if normalized text contains a relative day
 */
function hasRelativeDay(normalized: string): boolean {
  return ITALIAN_RELATIVE_DAYS.some(day => {
    const regex = new RegExp(`\\b${day}\\b`);
    return regex.test(normalized);
  });
}

/**
 * Check if text contains a date in format dd/mm or dd-mm or dd.mm
 */
function hasDateFormat(text: string): boolean {
  return /\b\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?\b/.test(text);
}

/**
 * Check if text contains a day with month name (26 dicembre)
 */
function hasDayWithMonth(normalized: string): boolean {
  for (const month of ITALIAN_MONTHS) {
    const regex = new RegExp(`\\b\\d{1,2}\\s+${month}\\b`);
    if (regex.test(normalized)) return true;
  }
  return false;
}

/**
 * Check if text contains an explicit time (8:30, 14.30, alle 9:00)
 */
function hasExplicitTime(text: string): boolean {
  // Time with minutes: 8:30, 14.30
  if (/\b\d{1,2}[:\.](\d{2})\b/.test(text)) {
    return true;
  }
  // "alle X" pattern where X is a valid hour (0-23)
  const alleMatch = text.match(/\balle?\s+(\d{1,2})(?:\s|$|,|[:\.])/i);
  if (alleMatch) {
    const hour = parseInt(alleMatch[1], 10);
    if (hour >= 0 && hour <= 23) return true;
  }
  return false;
}

/**
 * Check if text is ONLY a number between 1-31 (day of month)
 */
function isOnlyDayOfMonth(normalized: string): boolean {
  const trimmed = normalized.replace(/^il\s+/, '').trim();
  const num = parseInt(trimmed, 10);
  return /^\d{1,2}$/.test(trimmed) && num >= 1 && num <= 31;
}

/**
 * Check if text is ONLY a valid hour (0-23) without minutes
 */
function isOnlyHour(normalized: string): boolean {
  const trimmed = normalized.replace(/^alle?\s+/, '').trim();
  const num = parseInt(trimmed, 10);
  return /^\d{1,2}$/.test(trimmed) && num >= 0 && num <= 23;
}

/**
 * Check if text contains any date indicator
 */
function hasDateIndicator(normalized: string, original: string): boolean {
  return hasWeekday(normalized) ||
         hasRelativeDay(normalized) ||
         hasDateFormat(original) ||
         hasDayWithMonth(normalized);
}

/**
 * Main classification function
 * Returns the type of follow-up based on the message content
 */
export function classifyFollowUp(message: string, context?: { missingDate?: boolean; missingTime?: boolean }): FollowUpType {
  const original = message.trim();
  const normalized = normalizeItalian(message);
  
  // Empty message
  if (!normalized) {
    return 'OTHER';
  }

  // Check for confirmations first (short responses)
  if (matchesAny(normalized, CONFIRM_YES_PATTERNS)) {
    return 'CONFIRM_YES';
  }

  if (matchesAny(normalized, CONFIRM_NO_PATTERNS)) {
    return 'CONFIRM_NO';
  }

  // Check for explicit task/event choice
  if (matchesAny(normalized, CHOOSE_TASK_PATTERNS)) {
    return 'CHOOSE_TASK';
  }

  if (matchesAny(normalized, CHOOSE_EVENT_PATTERNS)) {
    return 'CHOOSE_EVENT';
  }

  // Check for delete/complete actions
  if (matchesAny(normalized, DELETE_PATTERNS)) {
    return 'DELETE_THESE';
  }

  if (matchesAny(normalized, COMPLETE_PATTERNS)) {
    return 'COMPLETE_THESE';
  }

  // ===== DATE/TIME CLASSIFICATION =====
  const hasDate = hasDateIndicator(normalized, original);
  const hasTime = hasExplicitTime(original);
  
  // DATETIME: both date and time present
  if (hasDate && hasTime) {
    return 'PROVIDE_DATETIME';
  }
  
  // DATE only (weekday, relative day, date format)
  if (hasDate) {
    return 'PROVIDE_DATE';
  }
  
  // TIME only (explicit time pattern)
  if (hasTime) {
    return 'PROVIDE_TIME';
  }
  
  // ===== SINGLE NUMBER DISAMBIGUATION =====
  // If it's just a number, decide based on context and value
  if (isOnlyDayOfMonth(normalized)) {
    const num = parseInt(normalized.replace(/^il\s+/, '').trim(), 10);
    
    // Numbers > 23 can ONLY be days (not valid hours)
    if (num > 23) {
      return 'PROVIDE_DATE';
    }
    
    // Numbers 1-23 are ambiguous, use context
    // If context says we need a date, treat as date
    // If context says we need a time, treat as time
    // Default: prefer DATE for CREATE_EVENT context (more common to ask "che giorno?")
    if (context?.missingDate && !context?.missingTime) {
      return 'PROVIDE_DATE';
    }
    if (context?.missingTime && !context?.missingDate) {
      return 'PROVIDE_TIME';
    }
    
    // Default: numbers <= 12 could be hours, > 12 more likely days
    // But for event creation, asking "che giorno?" is more common first
    // So default to DATE for numbers in typical day range
    return 'PROVIDE_DATE';
  }
  
  // Check for "alle X" which is always time
  if (/^alle?\s+\d{1,2}$/i.test(normalized)) {
    return 'PROVIDE_TIME';
  }

  return 'OTHER';
}

/**
 * Extract date from message (returns ISO date string or null)
 */
export function extractDate(message: string): string | null {
  const original = message.trim();
  const normalized = normalizeItalian(message);
  const now = new Date();
  
  // Today
  if (/\boggi\b/.test(normalized)) {
    return now.toISOString().split('T')[0];
  }
  
  // Tomorrow
  if (/\bdomani\b/.test(normalized)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  
  // Day after tomorrow
  if (/\bdopodomani\b/.test(normalized)) {
    const dayAfter = new Date(now);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return dayAfter.toISOString().split('T')[0];
  }
  
  // Weekday names (normalized, no accents)
  const weekdays: Record<string, number> = {
    'domenica': 0, 'lunedi': 1, 'martedi': 2, 'mercoledi': 3,
    'giovedi': 4, 'venerdi': 5, 'sabato': 6
  };
  
  for (const [dayName, dayNum] of Object.entries(weekdays)) {
    const regex = new RegExp(`\\b${dayName}\\b`, 'i');
    if (regex.test(normalized)) {
      const today = now.getDay();
      let daysUntil = dayNum - today;
      if (daysUntil <= 0) daysUntil += 7; // Next week
      
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      return targetDate.toISOString().split('T')[0];
    }
  }
  
  // Explicit date format (dd/mm or dd/mm/yyyy)
  const dateMatch = original.match(/(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : now.getFullYear();
    if (year < 100) year += 2000;
    
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  // Day with month name (26 dicembre)
  const monthNames = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
                      'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  for (let i = 0; i < monthNames.length; i++) {
    const regex = new RegExp(`(\\d{1,2})\\s+${monthNames[i]}`, 'i');
    const match = normalized.match(regex);
    if (match) {
      const day = parseInt(match[1], 10);
      const date = new Date(now.getFullYear(), i, day);
      // If date is in the past, assume next year
      if (date < now) {
        date.setFullYear(now.getFullYear() + 1);
      }
      return date.toISOString().split('T')[0];
    }
  }
  
  // Single number (day of current month)
  const singleNum = normalized.replace(/^il\s+/, '').trim();
  if (/^\d{1,2}$/.test(singleNum)) {
    const day = parseInt(singleNum, 10);
    if (day >= 1 && day <= 31) {
      let targetDate = new Date(now.getFullYear(), now.getMonth(), day);
      // If day already passed this month, use next month
      if (targetDate < now) {
        targetDate = new Date(now.getFullYear(), now.getMonth() + 1, day);
      }
      if (!isNaN(targetDate.getTime()) && targetDate.getDate() === day) {
        return targetDate.toISOString().split('T')[0];
      }
    }
  }
  
  return null;
}

/**
 * Extract time from message (returns HH:mm string or null)
 */
export function extractTime(message: string): string | null {
  const normalized = normalizeItalian(message);
  const original = message.trim();
  
  // Explicit time with minutes (8:30, 14.30)
  const timeMatch = original.match(/(\d{1,2})[:\.](\d{2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }
  
  // "alle X" pattern (alle 9, alle 14)
  const alleMatch = normalized.match(/\balle?\s+(\d{1,2})(?:\s|$|,)/);
  if (alleMatch && !timeMatch) {
    let hours = parseInt(alleMatch[1], 10);
    
    // Adjust for "di sera/pomeriggio" if hour < 12
    if (hours < 12 && /\b(sera|pomeriggio)\b/.test(normalized)) {
      hours += 12;
    }
    
    if (hours >= 0 && hours <= 23) {
      return `${hours.toString().padStart(2, '0')}:00`;
    }
  }
  
  // Generic time references (fallback)
  if (/\bmattina\b/.test(normalized) && !timeMatch && !alleMatch) {
    return '09:00';
  }
  if (/\bpomeriggio\b/.test(normalized) && !timeMatch && !alleMatch) {
    return '15:00';
  }
  if (/\bsera\b/.test(normalized) && !timeMatch && !alleMatch) {
    return '20:00';
  }
  
  return null;
}

/**
 * Build full ISO datetime from date and time
 */
export function buildDateTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

/**
 * Extract both date and time from a single message
 * Used for PROVIDE_DATETIME cases
 */
export function extractDateTime(message: string): { date: string | null; time: string | null } {
  return {
    date: extractDate(message),
    time: extractTime(message)
  };
}
