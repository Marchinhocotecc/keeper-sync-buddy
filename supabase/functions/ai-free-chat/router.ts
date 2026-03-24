/**
 * Router Module - Deterministic Pattern Matching
 * SCOPE: Entity creation + deletion + expense recording + query fallback
 * Query patterns use centralized terminology from terminology.ts
 */

import { 
  AIIntent, 
  RouterResult, 
  CANCEL_PATTERNS_STANDALONE, 
  CANCEL_PREFIX_PATTERNS,
  ADVICE_PATTERNS 
} from "./types.ts";
import {
  TASK_QUERY_PATTERN, EVENT_QUERY_PATTERN, EXPENSE_QUERY_PATTERN
} from "./terminology.ts";
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
  // CANCEL solo su parole esplicite di annullamento
  // "elimina", "rimuovi", "cancella" NON sono cancel (sono DELETE)
  return CANCEL_PATTERNS_STANDALONE.some(p => lower === p);
}

export function detectCancelWithContinuation(message: string): { isCancel: boolean; continuation: string | null } {
  const lower = message.toLowerCase().trim();
  
  // Non cancellare se contiene parole di azione (elimina, rimuovi, etc.)
  if (/\b(elimina|rimuovi|cancella)\b/i.test(lower)) {
    return { isCancel: false, continuation: null };
  }
  
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
  
  // === BULK DELETE PATTERNS (HIGHEST PRIORITY) ===
  if (/(?:elimina|cancella|rimuovi)\s+(?:tutt[eio]|tutti)\s+(?:i\s+)?(?:task|le\s+task)/i.test(lower)) {
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
  
  // === EXPENSE DETECTION (HIGH PRIORITY) ===
  const normalizedMessage = normalizeUserText(message);
  const expensePatterns = [
    /€\s*\d+/,
    /\d+(?:\.\d{1,2})?\s*€/,
    /\d+(?:\.\d{1,2})?\s*euro/i,
    /\d+(?:\.\d{1,2})?\s*eur\b/i,
    /^\d+(?:\.\d{1,2})?\s+[a-zA-ZàèéìòùÀÈÉÌÒÙ]+/i,
    /^[a-zA-ZàèéìòùÀÈÉÌÒÙ]+\s+\d+(?:\.\d{1,2})?$/i,
  ];
  
  // Solo se NON contiene parole di creazione task/evento
  if (!(/\b(crea|aggiungi|task|evento|ricordami|devo)\b/i.test(lower)) && 
      expensePatterns.some(p => p.test(normalizedMessage))) {
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
        reply: `Registro €${amount.toFixed(2)} in ${category || 'altro'}?`,
        needsConfirmation: true,
        confirmationQuestion: `Registro €${amount.toFixed(2)} in ${category || 'altro'}?`
      };
    }
  }
  
  // === EXPLICIT TASK CREATION (HIGH PRIORITY) ===
  // Pattern: "crea task: X", "crea un task: X", "crea task X"
  const taskWithColonMatch = lower.match(/^(crea|aggiungi|nuovo|nuova|fai|inserisci)\s+(?:un\s+)?(?:task|attivita|promemoria|to-?do)[\s:]+(.+)/i);
  if (taskWithColonMatch) {
    let rawTitle = taskWithColonMatch[2];
    const { date: taskDate } = parseDateTime(rawTitle);
    
    // Rimuovi riferimenti temporali dal titolo
    rawTitle = rawTitle.replace(/\b(oggi|domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/gi, "");
    const title = normalizeTitle(rawTitle);
    
    if (title && !isForbiddenTitle(title)) {
      return {
        matched: true,
        intent: "CREATE_TASK",
        action: { 
          type: "CREATE_TASK", 
          title,
          due_date: taskDate || undefined
        },
        reply: `Creo "${title}"?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo "${title}"?`
      };
    }
  }
  
  // === NATURAL TASK PATTERNS ===
  // "ricordami di X", "devo X", "mi serve X", "non dimenticare X"
  const naturalTaskPatterns = [
    /^ricordami\s+(?:di\s+)?(.+)/i,
    /^devo\s+(.+)/i,
    /^mi\s+serve\s+(.+)/i,
    /^non\s+dimenticare\s+(?:di\s+)?(.+)/i,
    /^da\s+fare[:\s]+(.+)/i,
    /^to-?do[:\s]+(.+)/i,
  ];
  
  for (const pattern of naturalTaskPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      let rawTitle = match[1];
      const { date: taskDate } = parseDateTime(rawTitle);
      
      // Rimuovi date dal titolo
      rawTitle = rawTitle.replace(/\b(oggi|domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/gi, "");
      // NON rimuovere orari dai task (non richiedono orario)
      const title = normalizeTitle(rawTitle);
      
      if (title && !isForbiddenTitle(title)) {
        return {
          matched: true,
          intent: "CREATE_TASK",
          action: { 
            type: "CREATE_TASK", 
            title,
            due_date: taskDate || undefined
          },
          reply: taskDate ? `Creo "${title}" per ${formatDateIT(taskDate)}?` : `Creo "${title}"?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo "${title}"?`
        };
      }
    }
  }
  
  // === EVENT CREATION (ONLY WITH EXPLICIT EVENT KEYWORDS) ===
  // Richiede: "evento", "appuntamento", "meeting", "riunione", "calendario"
  const eventKeywords = /\b(evento|appuntamento|meeting|riunione|calendario|prenotazione)\b/i;
  
  // Pattern: "crea evento X" con possibili date/orari
  const createEventMatch = lower.match(/^(crea|aggiungi|nuovo|nuova)\s+(?:un\s+)?(?:evento|appuntamento|meeting|riunione)(?:\s*:\s*|\s+)(.+)/i);
  if (createEventMatch) {
    const rawContent = createEventMatch[2];
    const { date: parsedDate, time: parsedTime } = parseDateTime(rawContent);
    
    // Estrai titolo rimuovendo date/orari
    let title = rawContent;
    title = title.replace(/\b(oggi|domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/gi, "");
    title = title.replace(/\b(alle|ore)\s*\d{1,2}(:\d{2})?\b/gi, "");
    title = title.replace(/\b\d{1,2}:\d{2}\b/g, "");
    title = title.replace(/\b\d{1,2}\.\d{2}\b/g, "");
    title = title.replace(/\b(di sera|di mattina|pomeriggio|stasera|stamattina)\b/gi, "");
    title = normalizeTitle(title);
    
    if (title && !isForbiddenTitle(title)) {
      if (parsedDate && parsedTime) {
        const start_at = buildISODateTime(parsedDate, parsedTime);
        return {
          matched: true,
          intent: "CREATE_EVENT",
          action: { type: "CREATE_EVENT", title, start_at },
          reply: `Creo "${title}" per ${formatDateIT(parsedDate)} alle ${parsedTime}?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo "${title}" per ${formatDateIT(parsedDate)} alle ${parsedTime}?`
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
        reply: missing.length === 2 ? `Quando "${title}"?` : 
               missing.includes('date') ? `Che giorno "${title}"?` : `A che ora "${title}"?`,
        needsConfirmation: true,
        confirmationQuestion: `Quando "${title}"?`
      };
    }
  }
  
  // Pattern: "[titolo] domani alle 20" SOLO se contiene keyword evento O "alle/ore"
  const hasTimeWithAlle = /\b(alle|ore)\s*\d+/i.test(lower);
  const hasEventKeyword = eventKeywords.test(lower);
  
  if ((hasEventKeyword || hasTimeWithAlle) && date && time) {
    let title = message;
    title = title.replace(/\b(oggi|domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/gi, "");
    title = title.replace(/\b(alle|ore)\s*\d{1,2}(:\d{2})?\b/gi, "");
    title = title.replace(/\b\d{1,2}:\d{2}\b/g, "");
    title = title.replace(/\b\d{1,2}\.\d{2}\b/g, "");
    title = title.replace(/\b(di sera|di mattina|pomeriggio|stasera|stamattina)\b/gi, "");
    title = normalizeTitle(title);
    
    if (title && !isForbiddenTitle(title)) {
      const start_at = buildISODateTime(date, time);
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "CREATE_EVENT", title, start_at },
        reply: `Creo "${title}" per ${formatDateIT(date)} alle ${time}?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo "${title}" per ${formatDateIT(date)} alle ${time}?`
      };
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
  
  // === INCOMPLETE CREATE COMMANDS ===
  if (/^(crea|aggiungi|nuovo|nuova)\s+(?:un\s+)?(?:task|attivita|promemoria|to-?do)\s*$/i.test(lower)) {
    return {
      matched: true,
      intent: "CREATE_TASK",
      action: { type: "NONE" },
      missingFields: ["title"],
      reply: "Che task?",
      needsConfirmation: true,
      confirmationQuestion: "Che task?"
    };
  }
  
  if (/^(crea|aggiungi|nuovo|nuova)\s+(?:un\s+)?(?:evento|appuntamento|meeting|riunione)\s*$/i.test(lower)) {
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
  
  // === QUERY COMMANDS (using centralized terminology) ===
  if (TASK_QUERY_PATTERN.test(lower)) {
    return { matched: true, intent: "QUERY_TASKS", action: { type: "QUERY_TASKS" } };
  }
  
  if (EVENT_QUERY_PATTERN.test(lower)) {
    return { matched: true, intent: "QUERY_EVENTS", action: { type: "QUERY_EVENTS" } };
  }
  
  if (EXPENSE_QUERY_PATTERN.test(lower)) {
    return { matched: true, intent: "QUERY_BUDGET", action: { type: "QUERY_BUDGET" } };
  }
  
  // NOTE: Greetings and help handlers REMOVED.
  // These are handled by LLM Intent Classifier → GENERAL_CHAT → Conversational Brain.
  
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
  
  console.log(`[AI-FREE] Slot filling: intent=${activeIntent}, message="${message}", payload=${JSON.stringify(payload)}`);
  
  // === CREATE_TASK: aspettiamo solo il titolo ===
  if (activeIntent === 'CREATE_TASK') {
    const title = normalizeTitle(message);
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
    // Titolo non valido
    return {
      matched: true,
      intent: "CREATE_TASK",
      action: { type: "NONE" },
      missingFields: ["title"],
      reply: "Dimmi il nome del task.",
      needsConfirmation: true,
      confirmationQuestion: "Dimmi il nome del task."
    };
  }
  
  // === CREATE_EVENT: slot filling per titolo/data/ora ===
  if (activeIntent === 'CREATE_EVENT') {
    // Recupera dati esistenti con fallback sicuri
    const existingTitle = payload.title || payload.pendingTitle || null;
    const existingDate = payload.date || payload.pending_date || null;
    const existingTime = payload.time || payload.pending_time || null;
    
    // Parse del messaggio corrente
    const pureTime = isPureTime(message);
    const pureDate = isPureDate(message);
    const { date: parsedDate, time: parsedTime } = parseDateTime(message);
    
    // Determina il nuovo titolo (se non esiste già)
    let newTitle = existingTitle;
    if (!existingTitle) {
      // Il messaggio potrebbe essere solo il titolo
      const hasTemporalContent = pureTime || pureDate || parsedDate || parsedTime;
      if (!hasTemporalContent) {
        // È solo testo -> è il titolo
        newTitle = normalizeTitle(message);
        if (newTitle && !isForbiddenTitle(newTitle)) {
          return {
            matched: true,
            intent: "CREATE_EVENT",
            action: { type: "NONE", title: newTitle },
            missingFields: ["date", "time"],
            reply: `Quando "${newTitle}"?`,
            needsConfirmation: true,
            confirmationQuestion: `Quando "${newTitle}"?`
          };
        }
      }
    }
    
    // Merge date/time: usa esistenti + nuovi
    const finalDate = parsedDate || pureDate || existingDate;
    const finalTime = parsedTime || pureTime || existingTime;
    const finalTitle = newTitle || existingTitle;
    
    // Se abbiamo tutto -> conferma
    if (finalTitle && finalDate && finalTime) {
      const start_at = buildISODateTime(finalDate, finalTime);
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "CREATE_EVENT", title: finalTitle, start_at },
        reply: `Creo "${finalTitle}" per ${formatDateIT(finalDate)} alle ${finalTime}?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo "${finalTitle}" per ${formatDateIT(finalDate)} alle ${finalTime}?`
      };
    }
    
    // Se manca solo l'ora
    if (finalTitle && finalDate && !finalTime) {
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "NONE", title: finalTitle },
        missingFields: ["time"],
        reply: "A che ora?",
        needsConfirmation: true,
        confirmationQuestion: "A che ora?"
      };
    }
    
    // Se manca solo la data
    if (finalTitle && !finalDate && finalTime) {
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "NONE", title: finalTitle },
        missingFields: ["date"],
        reply: "Che giorno?",
        needsConfirmation: true,
        confirmationQuestion: "Che giorno?"
      };
    }
    
    // Se manca titolo
    if (!finalTitle) {
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "NONE" },
        missingFields: ["title"],
        reply: "Come si chiama l'evento?",
        needsConfirmation: true,
        confirmationQuestion: "Come si chiama l'evento?"
      };
    }
    
    // Mancano data e ora
    return {
      matched: true,
      intent: "CREATE_EVENT",
      action: { type: "NONE", title: finalTitle },
      missingFields: ["date", "time"],
      reply: `Quando "${finalTitle}"?`,
      needsConfirmation: true,
      confirmationQuestion: `Quando "${finalTitle}"?`
    };
  }
  
  // === RECORD_EXPENSE: slot filling ===
  if (activeIntent === 'RECORD_EXPENSE') {
    const existingAmount = payload.amount;
    const existingCategory = payload.category;
    
    // Se manca l'importo
    const numMatch = message.match(/^(\d+(?:[.,]\d{1,2})?)$/);
    if (numMatch && !existingAmount) {
      const amount = parseFloat(numMatch[1].replace(",", "."));
      if (existingCategory) {
        return {
          matched: true,
          intent: "RECORD_EXPENSE",
          action: { type: "RECORD_EXPENSE", amount, category: existingCategory },
          reply: `Registro €${amount.toFixed(2)} in ${existingCategory}?`,
          needsConfirmation: true,
          confirmationQuestion: `Registro €${amount.toFixed(2)} in ${existingCategory}?`
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
    
    // Se abbiamo importo e manca categoria
    if (existingAmount && !existingCategory) {
      const category = message.trim().toLowerCase();
      if (category.length >= 2 && !category.match(/^\d/)) {
        return {
          matched: true,
          intent: "RECORD_EXPENSE",
          action: { type: "RECORD_EXPENSE", amount: existingAmount, category },
          reply: `Registro €${existingAmount.toFixed(2)} in ${category}?`,
          needsConfirmation: true,
          confirmationQuestion: `Registro €${existingAmount.toFixed(2)} in ${category}?`
        };
      }
    }
  }
  
  // === AMBIGUOUS CREATE -> TYPE CHOICE ===
  if (state.intent_payload?.title && !state.intent_payload?.type) {
    const lower = message.toLowerCase().trim();
    const title = state.intent_payload.title;
    
    if (lower === "task" || lower === "attività" || lower === "promemoria") {
      return {
        matched: true,
        intent: "CREATE_TASK",
        action: { type: "CREATE_TASK", title },
        reply: `Creo "${title}"?`,
        needsConfirmation: true,
        confirmationQuestion: `Creo "${title}"?`
      };
    }
    
    if (lower === "evento" || lower === "appuntamento" || lower === "meeting") {
      return {
        matched: true,
        intent: "CREATE_EVENT",
        action: { type: "NONE", title },
        missingFields: ["date", "time"],
        reply: `Quando "${title}"?`,
        needsConfirmation: true,
        confirmationQuestion: `Quando "${title}"?`
      };
    }
  }
  
  return null;
}
