/**
 * Follow-up Classifier - Deterministic classification for conversational follow-ups
 * NO AI - Pure pattern matching
 */

export type FollowUpType =
  | 'CONFIRM_YES'       // sì, ok, va bene
  | 'CONFIRM_NO'        // no, annulla, stop
  | 'CHOOSE_TASK'       // task
  | 'CHOOSE_EVENT'      // evento
  | 'DELETE_THESE'      // elimina, cancella, rimuovi
  | 'COMPLETE_THESE'    // completa, fatto, segna
  | 'PROVIDE_DATETIME'  // venerdì 8:30, domani alle 9
  | 'PROVIDE_DATE'      // domani, venerdì, lunedì
  | 'PROVIDE_TIME'      // 8:30, alle 9, alle 14:00
  | 'OTHER';            // Anything else

// Patterns for each type
const CONFIRM_YES_PATTERNS = [
  /^(s[iì]|ok|va bene|perfetto|certo|esatto|proprio|procedi|conferma|dai|fallo|fai|fai pure|sicuro|assolutamente)$/i,
  /^(s[iì],?\s*grazie|ok,?\s*grazie|va bene,?\s*grazie)$/i
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

// Date patterns (Italian)
const DATE_PATTERNS = [
  /\b(oggi|domani|dopodomani)\b/i,
  /\b(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\b/i,
  /\b(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?\b/,  // 15/3, 15-03-2024
  /\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/i
];

// Time patterns
const TIME_PATTERNS = [
  /\b(alle\s+)?(\d{1,2})[:\.](\d{2})\b/,  // 8:30, alle 14.30
  /\b(alle\s+)?(\d{1,2})\s*(di mattina|di sera|di pomeriggio)?\b/i,  // alle 9, 9 di mattina
  /\bmattina\b/i,
  /\bpomeriggio\b/i,
  /\bsera\b/i
];

/**
 * Check if message matches any pattern in the list
 */
function matchesAny(message: string, patterns: RegExp[]): boolean {
  const normalized = message.trim();
  return patterns.some(pattern => pattern.test(normalized));
}

/**
 * Check if message contains a date reference
 */
function hasDateReference(message: string): boolean {
  return matchesAny(message, DATE_PATTERNS);
}

/**
 * Check if message contains a time reference
 */
function hasTimeReference(message: string): boolean {
  return matchesAny(message, TIME_PATTERNS);
}

/**
 * Main classification function
 * Returns the type of follow-up based on the message content
 */
export function classifyFollowUp(message: string): FollowUpType {
  const normalized = message.toLowerCase().trim();
  
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

  // Check for date/time information
  const hasDate = hasDateReference(normalized);
  const hasTime = hasTimeReference(normalized);

  if (hasDate && hasTime) {
    return 'PROVIDE_DATETIME';
  }

  if (hasDate) {
    return 'PROVIDE_DATE';
  }

  if (hasTime) {
    return 'PROVIDE_TIME';
  }

  return 'OTHER';
}

/**
 * Extract date from message (returns ISO date string or null)
 */
export function extractDate(message: string): string | null {
  const normalized = message.toLowerCase().trim();
  const now = new Date();
  
  // Today
  if (/\boggi\b/i.test(normalized)) {
    return now.toISOString().split('T')[0];
  }
  
  // Tomorrow
  if (/\bdomani\b/i.test(normalized)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  
  // Day after tomorrow
  if (/\bdopodomani\b/i.test(normalized)) {
    const dayAfter = new Date(now);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return dayAfter.toISOString().split('T')[0];
  }
  
  // Weekday names
  const weekdays: Record<string, number> = {
    'domenica': 0, 'lunedi': 1, 'lunedì': 1, 'martedi': 2, 'martedì': 2,
    'mercoledi': 3, 'mercoledì': 3, 'giovedi': 4, 'giovedì': 4,
    'venerdi': 5, 'venerdì': 5, 'sabato': 6
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
  const dateMatch = normalized.match(/(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/);
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
  
  return null;
}

/**
 * Extract time from message (returns HH:mm string or null)
 */
export function extractTime(message: string): string | null {
  const normalized = message.toLowerCase().trim();
  
  // Explicit time (8:30, 14.30, alle 9:00)
  const timeMatch = normalized.match(/(\d{1,2})[:\.](\d{2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }
  
  // Just hour (alle 9, alle 14)
  const hourMatch = normalized.match(/(?:alle?\s+)?(\d{1,2})(?:\s|$|,)/);
  if (hourMatch && !timeMatch) {
    let hours = parseInt(hourMatch[1], 10);
    
    // Adjust for "di sera/pomeriggio" if hour < 12
    if (hours < 12 && /\b(sera|pomeriggio)\b/i.test(normalized)) {
      hours += 12;
    }
    
    if (hours >= 0 && hours <= 23) {
      return `${hours.toString().padStart(2, '0')}:00`;
    }
  }
  
  // Generic time references
  if (/\bmattina\b/i.test(normalized) && !timeMatch && !hourMatch) {
    return '09:00';
  }
  if (/\bpomeriggio\b/i.test(normalized) && !timeMatch && !hourMatch) {
    return '15:00';
  }
  if (/\bsera\b/i.test(normalized) && !timeMatch && !hourMatch) {
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
