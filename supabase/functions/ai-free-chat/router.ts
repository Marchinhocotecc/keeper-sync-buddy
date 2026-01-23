/**
 * Router Module - Deterministic Pattern Matching
 */

import { 
  AIIntent, 
  RouterResult, 
  CANCEL_PATTERNS_STANDALONE, 
  CANCEL_PREFIX_PATTERNS,
  ADVICE_PATTERNS 
} from "./types.ts";
import { 
  parseDateTime, 
  parseExpense, 
  parseRecurring,
  normalizeTitle, 
  isForbiddenTitle, 
  normalizeUserText,
  buildISODateTime,
  formatDateIT,
  isPureTime,
  isPureDate
} from "./parser.ts";

// ============================================================================
// CANCEL/CONFIRM DETECTION
// ============================================================================

export function isCancel(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return CANCEL_PATTERNS_STANDALONE.some(p => lower === p);
}

export function detectCancelWithContinuation(message: string): { isCancel: boolean; continuation: string | null } {
  const lower = message.toLowerCase().trim();
  
  if (CANCEL_PATTERNS_STANDALONE.some(p => lower === p)) {
    return { isCancel: true, continuation: null };
  }
  
  for (const pattern of CANCEL_PREFIX_PATTERNS) {
    const match = message.match(pattern);
    if (match && match[1] && match[1].trim().length > 2) {
      return { isCancel: true, continuation: match[1].trim() };
    }
  }
  
  return { isCancel: false, continuation: null };
}

export function isAdviceRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return ADVICE_PATTERNS.some(p => p.test(lower));
}

export function isConfirm(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return ["sì", "si", "yes", "ok", "confermo", "conferma", "va bene", "procedi", "fatto", "perfetto", "certo", "dai"].includes(lower);
}

// ============================================================================
// GREETINGS
// ============================================================================

export function randomGreeting(): string {
  const greetings = [
    "Ciao! Come posso aiutarti?",
    "Ehi! Dimmi pure.",
    "Buongiorno! Cosa posso fare per te?",
    "Ciao! Pronto ad organizzare la giornata?"
  ];
  return greetings[Math.floor(Math.random() * greetings.length)];
}

// ============================================================================
// DETERMINISTIC ROUTER
// ============================================================================

export function deterministicRouter(message: string, state?: any): RouterResult {
  const lower = message.toLowerCase().trim()
    .replace(/[ìí]/g, 'i')
    .replace(/[àá]/g, 'a');
  const { date, time } = parseDateTime(message);
  
  // === EXPENSE DETECTION (HIGHEST PRIORITY) ===
  const normalizedMessage = normalizeUserText(message);
  const expensePatterns = [
    /€\s*\d+/,
    /\d+(?:\.\d{1,2})?\s*€/,
    /\d+(?:\.\d{1,2})?\s*euro/i,
    /\d+(?:\.\d{1,2})?\s*eur\b/i,
    /^\d+(?:\.\d{1,2})?\s+[a-zA-ZàèéìòùÀÈÉÌÒÙ]+/i,
    /^[a-zA-ZàèéìòùÀÈÉÌÒÙ]+\s+\d+(?:\.\d{1,2})?$/i,
  ];
  
  if (expensePatterns.some(p => p.test(normalizedMessage))) {
    const { amount, category } = parseExpense(message);
    if (amount && amount > 0) {
      return {
        matched: true,
        intent: "RECORD_EXPENSE",
        action: {
          type: "RECORD_EXPENSE",
          amount,
          category: category || 'altro'
        },
        reply: `Registro €${amount.toFixed(2)} (${category || 'altro'})?`,
        needsConfirmation: true,
        confirmationQuestion: `Registro €${amount.toFixed(2)} in ${category || 'altro'}?`
      };
    }
  }
  
  // === BULK DELETE PATTERNS ===
  if (/(?:elimina|cancella|rimuovi)\s+(?:tutt[eio]|tutti)\s+(?:i\s+)?task/i.test(lower)) {
    return {
      matched: true,
      intent: "DELETE_TASKS",
      action: { type: "DELETE_ALL_TASKS" },
      reply: "Elimino tutti i task?",
      needsConfirmation: true,
      confirmationQuestion: "Elimino tutti i task?"
    };
  }
  
  if (/(?:elimina|cancella|rimuovi)\s+(?:tutt[eio]|tutti)\s+(?:gli\s+)?eventi/i.test(lower)) {
    return {
      matched: true,
      intent: "DELETE_EVENTS",
      action: { type: "DELETE_ALL_EVENTS" },
      reply: "Elimino tutti gli eventi?",
      needsConfirmation: true,
      confirmationQuestion: "Elimino tutti gli eventi?"
    };
  }
  
  if (/(?:elimina|cancella|rimuovi)\s+(?:tutt[eio]|tutte)\s+(?:le\s+)?spese/i.test(lower)) {
    return {
      matched: true,
      intent: "DELETE_EXPENSES",
      action: { type: "DELETE_ALL_EXPENSES" },
      reply: "Elimino tutte le spese?",
      needsConfirmation: true,
      confirmationQuestion: "Elimino tutte le spese?"
    };
  }
  
  // === EVENT CREATION WITH DATE/TIME ===
  const eventDatePatterns = [
    /\b(oggi|domani|domai|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/i,
  ];
  
  const hasDatePattern = eventDatePatterns.some(p => p.test(lower));
  const hasTimePattern = /(?:alle|ore)\s*\d+|\d+[:\.]?\d*/.test(lower);
  
  if (hasDatePattern || (hasTimePattern && date)) {
    let title = message;
    title = title.replace(/\b(oggi|domani|domai|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/gi, "");
    title = title.replace(/\b(alle|ore)\s*\d{1,2}(:\d{2})?\b/gi, "");
    title = title.replace(/\b\d{1,2}:\d{2}\b/g, "");
    title = title.replace(/\b\d{1,2}\.\d{2}\b/g, "");
    title = title.replace(/\b(di sera|di mattina|pomeriggio|stasera|stamattina)\b/gi, "");
    title = normalizeTitle(title);
    
    if (title && !isForbiddenTitle(title)) {
      if (date && time) {
        const start_at = buildISODateTime(date, time);
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: { type: "CREATE_EVENT", title, start_at },
          reply: `Creo "${title}" per ${formatDateIT(date)} alle ${time}?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo "${title}" per ${formatDateIT(date)} alle ${time}?`
        };
      } else if (date && !time) {
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: { type: "NONE", title },
          missingFields: ["time"],
          reply: `A che ora "${title}"?`,
          needsConfirmation: true,
          confirmationQuestion: `A che ora "${title}"?`
        };
      } else if (time && !date) {
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: { type: "NONE", title },
          missingFields: ["date"],
          reply: `Che giorno "${title}"?`,
          needsConfirmation: true,
          confirmationQuestion: `Che giorno "${title}"?`
        };
      }
    }
  }
  
  // === RECURRING TASK DETECTION ===
  const recurring = parseRecurring(message);
  if (recurring && /\b(crea|aggiungi|nuovo|nuova|ricorda|promemoria|task)\b/i.test(lower)) {
    let title = message;
    title = title.replace(/\b(ogni\s+giorno|quotidian|tutti\s+i\s+giorni|ogni\s+mattina|ogni\s+sera|settimanale|ogni\s+settimana|ogni\s+mese|mensile)\b/gi, "");
    title = title.replace(/\b(ogni\s+(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica))\b/gi, "");
    title = title.replace(/\b(alle|ore)\s*\d{1,2}(:\d{2})?\b/gi, "");
    title = normalizeTitle(title);
    
    if (title && !isForbiddenTitle(title)) {
      return {
        matched: true,
        intent: "CREATE_TASK",
        action: { type: "CREATE_TASK", title, recurring },
        reply: `Creo task ricorrente "${title}"?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo task ricorrente "${title}"?`
      };
    }
  }
  
  // === EXPLICIT CREATE COMMANDS ===
  const createTaskMatch = lower.match(/^(crea|aggiungi|nuovo|nuova|fai|inserisci)\s+(task|attivita|promemoria|to-?do)\s+(.+)/i);
  if (createTaskMatch) {
    const title = normalizeTitle(createTaskMatch[3]);
    if (title && !isForbiddenTitle(title)) {
      return {
        matched: true,
        intent: "CREATE_TASK",
        action: { type: "CREATE_TASK", title },
        reply: `Creo "${title}"?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo "${title}"?`
      };
    }
  }
  
  const createEventMatch = lower.match(/^(crea|aggiungi|nuovo|nuova)\s+(evento|appuntamento|meeting)\s+(.+)/i);
  if (createEventMatch) {
    const rawTitle = createEventMatch[3];
    const { date: parsedDate, time: parsedTime } = parseDateTime(rawTitle);
    let title = normalizeTitle(rawTitle);
    
    if (parsedDate || parsedTime) {
      title = rawTitle;
      title = title.replace(/\b(oggi|domani|domai|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/gi, "");
      title = title.replace(/\b(alle|ore)\s*\d{1,2}(:\d{2})?\b/gi, "");
      title = title.replace(/\b\d{1,2}:\d{2}\b/g, "");
      title = normalizeTitle(title);
    }
    
    if (title && !isForbiddenTitle(title)) {
      if (parsedDate && parsedTime) {
        const start_at = buildISODateTime(parsedDate, parsedTime);
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: { type: "CREATE_EVENT", title, start_at },
          reply: `Creo "${title}" per ${formatDateIT(parsedDate)} alle ${parsedTime}?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo "${title}"?`
        };
      }
      
      const missing: string[] = [];
      if (!parsedDate) missing.push('date');
      if (!parsedTime) missing.push('time');
      
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "NONE", title },
        missingFields: missing,
        reply: missing.includes('date') && missing.includes('time') ? `Quando "${title}"?` : 
               missing.includes('date') ? `Che giorno "${title}"?` : `A che ora "${title}"?`,
        needsConfirmation: true,
        confirmationQuestion: `Quando "${title}"?`
      };
    }
  }
  
  // === AMBIGUOUS CREATE ===
  const ambiguousCreateMatch = lower.match(/^(crea|aggiungi|nuovo|nuova|fai)\s+(.+)/i);
  if (ambiguousCreateMatch) {
    const content = ambiguousCreateMatch[2];
    const title = normalizeTitle(content);
    
    if (title && !isForbiddenTitle(title) && 
        !/\b(task|evento|appuntamento|promemoria|attivita)\b/i.test(content)) {
      return {
        matched: true,
        intent: "NONE",
        action: { type: "NONE", title },
        missingFields: ["type"],
        reply: `"${title}": task o evento?`,
        needsConfirmation: true,
        confirmationQuestion: `"${title}": task o evento?`,
        suggestions: ["Task", "Evento"]
      };
    }
  }
  
  // === INCOMPLETE CREATE COMMANDS ===
  if (/^(crea|aggiungi|nuovo|nuova)\s+(un\s+)?(task|attivita|promemoria|to-?do)\s*$/i.test(lower)) {
    return {
      matched: true,
      intent: "CREATE_TASK",
      action: { type: "NONE" },
      missingFields: ["title"],
      reply: "Cosa?",
      needsConfirmation: true,
      confirmationQuestion: "Cosa?"
    };
  }
  
  if (/^(crea|aggiungi|nuovo|nuova)\s+(un\s+)?(evento|appuntamento|meeting)\s*$/i.test(lower)) {
    return {
      matched: true,
      intent: "CREATE_EVENT",
      action: { type: "NONE" },
      missingFields: ["title", "date", "time"],
      reply: "Che evento?",
      needsConfirmation: true,
      confirmationQuestion: "Che evento?"
    };
  }
  
  // === QUERY COMMANDS ===
  if (/\b(mostra|vedi|lista|elenco|quali|quanti)\s*(i\s+)?(miei\s+)?(task|attivita|cose da fare|to-?do)/i.test(lower)) {
    return { matched: true, intent: "QUERY_TASKS", action: { type: "QUERY_TASKS" } };
  }
  
  if (/\b(mostra|vedi|lista|elenco|quali|quanti)\s*(i\s+)?(miei\s+)?(eventi|appuntamenti|impegni)/i.test(lower)) {
    return { matched: true, intent: "QUERY_EVENTS", action: { type: "QUERY_EVENTS" } };
  }
  
  if (/\b(mostra|vedi|quanto|quante|budget|spese|speso)\s*/i.test(lower) && 
      /\b(spese|budget|speso|soldi|euro|€)/i.test(lower)) {
    return { matched: true, intent: "QUERY_BUDGET", action: { type: "QUERY_BUDGET" } };
  }
  
  // === GREETINGS & SMALL TALK ===
  const greetings = ["ciao", "salve", "buongiorno", "buonasera", "hey", "ehi", "come va", "come stai", "tutto bene"];
  if (greetings.some(g => lower.startsWith(g) || lower === g)) {
    return {
      matched: true,
      intent: "SMALL_TALK",
      reply: randomGreeting()
    };
  }
  
  // === HELP/CAPABILITIES ===
  if (/\b(cosa puoi fare|aiut|help|come funzion|cosa sai fare)\b/i.test(lower)) {
    return {
      matched: true,
      intent: "ADVICE",
      reply: "Posso aiutarti a gestire task, eventi e spese. Prova: \"padel domani alle 20\" o \"sigarette €5\".",
      suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
    };
  }
  
  return { matched: false };
}

// ============================================================================
// SLOT FILLING
// ============================================================================

export function handleSlotFilling(message: string, state: any): RouterResult | null {
  const activeIntent = state.active_intent;
  const payload = state.intent_payload || {};
  
  if (!activeIntent || activeIntent === 'NONE') {
    return null;
  }
  
  console.log(`[AI-FREE] Slot filling: intent=${activeIntent}, message="${message}"`);
  
  if (activeIntent === 'CREATE_EVENT') {
    const title = payload.title || payload.pendingTitle;
    const existingDate = payload.date || payload.pending_date;
    const existingTime = payload.time || payload.pending_time;
    
    const pureTime = isPureTime(message);
    if (pureTime && title && existingDate) {
      const start_at = buildISODateTime(existingDate, pureTime);
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "CREATE_EVENT", title, start_at },
        reply: `Creo "${title}" per ${formatDateIT(existingDate)} alle ${pureTime}?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo "${title}"?`
      };
    }
    
    const pureDate = isPureDate(message);
    if (pureDate && title && !existingDate) {
      if (existingTime) {
        const start_at = buildISODateTime(pureDate, existingTime);
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: { type: "CREATE_EVENT", title, start_at },
          reply: `Creo "${title}" per ${formatDateIT(pureDate)} alle ${existingTime}?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo "${title}"?`
        };
      } else {
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: { type: "NONE", title },
          missingFields: ["time"],
          reply: "A che ora?",
          needsConfirmation: true,
          confirmationQuestion: "A che ora?"
        };
      }
    }
    
    const { date, time } = parseDateTime(message);
    
    if (date && time && title) {
      const start_at = buildISODateTime(date, time);
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "CREATE_EVENT", title, start_at },
        reply: `Creo "${title}" per ${formatDateIT(date)} alle ${time}?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo "${title}"?`
      };
    }
    
    if (date && !time && title) {
      if (existingTime) {
        const start_at = buildISODateTime(date, existingTime);
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: { type: "CREATE_EVENT", title, start_at },
          reply: `Creo "${title}" per ${formatDateIT(date)} alle ${existingTime}?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo "${title}"?`
        };
      }
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "NONE", title },
        missingFields: ["time"],
        reply: "A che ora?",
        needsConfirmation: true,
        confirmationQuestion: "A che ora?"
      };
    }
    
    if (pureTime && title && existingDate) {
      const start_at = buildISODateTime(existingDate, pureTime);
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "CREATE_EVENT", title, start_at },
        reply: `Creo "${title}" per ${formatDateIT(existingDate)} alle ${pureTime}?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo "${title}"?`
      };
    }
  }
  
  if (activeIntent === 'RECORD_EXPENSE') {
    const existingAmount = payload.amount;
    const existingCategory = payload.category;
    
    const numMatch = message.match(/^(\d+(?:[.,]\d{1,2})?)$/);
    if (numMatch && !existingAmount) {
      const amount = parseFloat(numMatch[1].replace(",", "."));
      if (existingCategory) {
        return {
          matched: true,
          intent: "RECORD_EXPENSE",
          action: { type: "RECORD_EXPENSE", amount, category: existingCategory },
          reply: `Registro €${amount.toFixed(2)} (${existingCategory})?`,
          needsConfirmation: true,
          confirmationQuestion: `Registro €${amount.toFixed(2)}?`
        };
      }
      return {
        matched: true,
        intent: "RECORD_EXPENSE",
        action: { type: "NONE", amount } as any,
        missingFields: ["category"],
        reply: "Per cosa?",
        needsConfirmation: true,
        confirmationQuestion: "Per cosa?"
      };
    }
    
    if (existingAmount && !existingCategory) {
      const category = message.trim().toLowerCase();
      if (category.length >= 2 && !category.match(/^\d/)) {
        return {
          matched: true,
          intent: "RECORD_EXPENSE",
          action: { type: "RECORD_EXPENSE", amount: existingAmount, category },
          reply: `Registro €${existingAmount.toFixed(2)} (${category})?`,
          needsConfirmation: true,
          confirmationQuestion: `Registro?`
        };
      }
    }
  }
  
  return null;
}
