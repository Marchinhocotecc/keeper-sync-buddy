/**
 * Parser Module - Date/Time, Expense, and Text Parsing
 */

import { FORBIDDEN_TITLES, RecurringRule } from "./types.ts";

// ============================================================================
// TEXT NORMALIZATION
// ============================================================================

export function normalizeUserText(input: string): string {
  return input.replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');
}

export function normalizeTitle(raw: string): string {
  let title = raw.trim();
  const removePatterns = [
    /^(crea|aggiungi|nuovo|nuova|inserisci|registra|fai|fare|creare|aggiungere|segna|metti)\s+/i,
    /^(un|una|il|la|lo|l'|i|gli|le)\s+/i,
    /^(task|evento|spesa|promemoria|appuntamento)\s*/i,
  ];
  for (const pattern of removePatterns) {
    title = title.replace(pattern, "");
  }
  title = title.trim();
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  return title;
}

export function isForbiddenTitle(title: string): boolean {
  const lower = title.toLowerCase().trim();
  return FORBIDDEN_TITLES.includes(lower) || lower.length < 2;
}

// ============================================================================
// DATE/TIME PARSING
// ============================================================================

export function parseDateTime(text: string): { date: string | null; time: string | null } {
  const lower = text.toLowerCase()
    .replace(/[ìí]/g, 'i')
    .replace(/[àá]/g, 'a')
    .replace(/[èé]/g, 'e')
    .replace(/[òó]/g, 'o')
    .replace(/[ùú]/g, 'u');
    
  const now = new Date();
  let date: string | null = null;
  let time: string | null = null;
  
  // Parse date references
  if (lower.includes("oggi") || lower.includes("stasera") || lower.includes("stamattina")) {
    date = now.toISOString().split("T")[0];
  } else if (lower.includes("domani") || lower.includes("domai")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    date = tomorrow.toISOString().split("T")[0];
  } else if (lower.includes("dopodomani")) {
    const dayAfter = new Date(now);
    dayAfter.setDate(dayAfter.getDate() + 2);
    date = dayAfter.toISOString().split("T")[0];
  } else {
    const days: Record<string, number> = {
      'domenica': 0, 'lunedi': 1, 'martedi': 2, 'mercoledi': 3,
      'giovedi': 4, 'venerdi': 5, 'sabato': 6,
      'dom': 0, 'lun': 1, 'mar': 2, 'mer': 3, 'gio': 4, 'ven': 5, 'sab': 6
    };
    
    for (const [dayName, dayNum] of Object.entries(days)) {
      const regex = new RegExp(`\\b${dayName}\\b`, 'i');
      if (regex.test(lower)) {
        const currentDay = now.getDay();
        let daysUntil = dayNum - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysUntil);
        date = targetDate.toISOString().split("T")[0];
        break;
      }
    }
  }
  
  // Parse time
  const timePatterns = [
    /(?:alle|ore)\s*(\d{1,2})(?::(\d{2}))?/i,
    /\b(\d{1,2}):(\d{2})\b/,
    /\b(\d{1,2})\.(\d{2})\b/,
    /\b(\d{1,2})(?:\s*(?:di sera|pm))/i,
    /\b(\d{1,2})(?:\s*(?:di mattina|am))/i
  ];
  
  for (const pattern of timePatterns) {
    const match = lower.match(pattern);
    if (match) {
      let hour = parseInt(match[1], 10);
      const minute = match[2] ? parseInt(match[2], 10) : 0;
      
      if ((lower.includes("sera") || lower.includes("pm")) && hour < 12 && hour > 0) {
        hour += 12;
      }
      
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        break;
      }
    }
  }
  
  // Special time words
  if (!time) {
    if (lower.includes("mattina") || lower.includes("stamattina")) {
      time = "09:00";
    } else if (lower.includes("pranzo") || lower.includes("mezzogiorno")) {
      time = "12:30";
    } else if (lower.includes("pomeriggio")) {
      time = "15:00";
    } else if (lower.includes("sera") || lower.includes("stasera")) {
      time = "20:00";
    } else if (lower.includes("cena")) {
      time = "20:00";
    }
  }
  
  return { date, time };
}

export function isPureTime(text: string): string | null {
  const lower = text.toLowerCase().trim();
  
  const hourOnly = lower.match(/^(\d{1,2})$/);
  if (hourOnly) {
    const hour = parseInt(hourOnly[1], 10);
    if (hour >= 0 && hour <= 23) {
      return `${hour.toString().padStart(2, "0")}:00`;
    }
  }
  
  const timeMatch = lower.match(/^(\d{1,2})[:\.](\d{2})$/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    }
  }
  
  const alleMatch = lower.match(/^(?:alle?|ore)\s*(\d{1,2})(?::(\d{2}))?$/);
  if (alleMatch) {
    const hour = parseInt(alleMatch[1], 10);
    const minute = alleMatch[2] ? parseInt(alleMatch[2], 10) : 0;
    if (hour >= 0 && hour <= 23) {
      return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    }
  }
  
  return null;
}

export function isPureDate(text: string): string | null {
  const lower = text.toLowerCase().trim()
    .replace(/[ìí]/g, 'i')
    .replace(/[àá]/g, 'a');
  const now = new Date();
  
  if (/^domani?$/.test(lower)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }
  
  if (lower === "oggi") {
    return now.toISOString().split("T")[0];
  }
  
  const days: Record<string, number> = {
    'domenica': 0, 'lunedi': 1, 'martedi': 2, 'mercoledi': 3,
    'giovedi': 4, 'venerdi': 5, 'sabato': 6
  };
  
  for (const [dayName, dayNum] of Object.entries(days)) {
    if (lower === dayName || lower === dayName.substring(0, 3)) {
      const currentDay = now.getDay();
      let daysUntil = dayNum - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      return targetDate.toISOString().split("T")[0];
    }
  }
  
  return null;
}

export function buildISODateTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

export function formatDateIT(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

// ============================================================================
// EXPENSE PARSING
// ============================================================================

export function parseExpense(text: string): { amount: number | null; category: string | null; description: string | null } {
  const normalized = normalizeUserText(text);
  const lower = normalized.toLowerCase();
  const original = normalized;
  
  let amount: number | null = null;
  const amountPatterns = [
    /€\s*(\d+(?:\.\d{1,2})?)/,
    /(\d+(?:\.\d{1,2})?)\s*€/,
    /(\d+(?:\.\d{1,2})?)\s*euro/i,
    /(\d+(?:\.\d{1,2})?)\s*eur\b/i
  ];
  
  for (const pattern of amountPatterns) {
    const match = lower.match(pattern);
    if (match) {
      amount = parseFloat(match[1]);
      break;
    }
  }
  
  if (!amount) {
    const numWordMatch = original.match(/^(\d+(?:\.\d{1,2})?)\s+([a-zA-ZàèéìòùÀÈÉÌÒÙ\s]+)$/i);
    const wordNumMatch = original.match(/^([a-zA-ZàèéìòùÀÈÉÌÒÙ\s]+?)\s+(\d+(?:\.\d{1,2})?)$/i);
    
    if (numWordMatch) {
      amount = parseFloat(numWordMatch[1]);
    } else if (wordNumMatch) {
      amount = parseFloat(wordNumMatch[2]);
    }
  }
  
  let category: string | null = null;
  const categoryMap: Record<string, string[]> = {
    "cibo": ["pranzo", "cena", "colazione", "ristorante", "pizza", "sushi", "caffè", "caffe", "bar", "spesa", "supermercato", "alimentari", "pasto", "mangiare", "mangiar"],
    "trasporti": ["benzina", "treno", "bus", "metro", "taxi", "uber", "parcheggio", "autostrada", "pedaggio", "carburante", "gasolio"],
    "shopping": ["vestiti", "scarpe", "abbigliamento", "amazon", "shopping", "acquisti", "negozio"],
    "salute": ["farmacia", "medico", "dottore", "medicine", "ospedale", "dentista", "visita"],
    "svago": ["cinema", "teatro", "concerto", "netflix", "spotify", "giochi", "videogiochi", "abbonamento"],
    "casa": ["affitto", "bollette", "luce", "gas", "acqua", "internet", "telefono", "pulizie"],
    "vizi": ["sigarette", "alcol", "birra", "vino", "cocktail", "fumo", "tabacco"]
  };
  
  for (const [cat, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(k => lower.includes(k))) {
      category = cat;
      break;
    }
  }
  
  let description: string | null = null;
  const cleanText = original
    .replace(/€\s*\d+(?:[.,]\d{1,2})?/g, '')
    .replace(/\d+(?:[.,]\d{1,2})?\s*€/g, '')
    .replace(/\d+(?:[.,]\d{1,2})?\s*euro/gi, '')
    .replace(/\d+(?:[.,]\d{1,2})?/g, '')
    .trim();
  
  if (cleanText.length > 1) {
    description = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
    if (!category) {
      category = cleanText.toLowerCase();
    }
  }
  
  return { amount, category: category || "altro", description };
}

// ============================================================================
// RECURRING TASK PARSING
// ============================================================================

export function parseRecurring(text: string): RecurringRule | null {
  const lower = text.toLowerCase()
    .replace(/[ìí]/g, 'i')
    .replace(/[àá]/g, 'a');
  
  if (/\b(ogni\s+giorno|quotidian|tutti\s+i\s+giorni|ogni\s+mattina|ogni\s+sera)\b/.test(lower)) {
    const { time } = parseDateTime(text);
    const rule: RecurringRule = { freq: 'DAILY' };
    if (time) {
      const [h, m] = time.split(':').map(Number);
      rule.byHour = h;
      rule.byMinute = m;
    }
    return rule;
  }
  
  const weeklyMatch = lower.match(/\bogni\s+(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/);
  if (weeklyMatch) {
    const dayMap: Record<string, string> = {
      'lunedi': 'MO', 'martedi': 'TU', 'mercoledi': 'WE',
      'giovedi': 'TH', 'venerdi': 'FR', 'sabato': 'SA', 'domenica': 'SU'
    };
    const { time } = parseDateTime(text);
    const rule: RecurringRule = { freq: 'WEEKLY', byDay: [dayMap[weeklyMatch[1]]] };
    if (time) {
      const [h, m] = time.split(':').map(Number);
      rule.byHour = h;
      rule.byMinute = m;
    }
    return rule;
  }
  
  if (/\b(settimanale|ogni\s+settimana)\b/.test(lower)) {
    const { time } = parseDateTime(text);
    const rule: RecurringRule = { freq: 'WEEKLY' };
    if (time) {
      const [h, m] = time.split(':').map(Number);
      rule.byHour = h;
      rule.byMinute = m;
    }
    return rule;
  }
  
  if (/\b(ogni\s+mese|mensile)\b/.test(lower)) {
    const { time } = parseDateTime(text);
    const rule: RecurringRule = { freq: 'MONTHLY' };
    if (time) {
      const [h, m] = time.split(':').map(Number);
      rule.byHour = h;
      rule.byMinute = m;
    }
    return rule;
  }
  
  return null;
}
