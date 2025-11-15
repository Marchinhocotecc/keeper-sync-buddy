/**
 * Intent Parser - Analizza i messaggi dell'utente e identifica l'intento
 */

export type Intent = 
  | { type: 'create_event'; data: { title: string; date?: string; time?: string } }
  | { type: 'create_expense'; data: { amount: number; category: string; description?: string } }
  | { type: 'create_task'; data: { title: string; priority?: 'low' | 'medium' | 'high'; dueDate?: string } }
  | { type: 'create_note'; data: { content: string; category?: string } }
  | { type: 'read_summary'; data: { scope: 'today' | 'week' | 'month' } }
  | { type: 'read_expenses'; data: { period?: string } }
  | { type: 'read_tasks'; data: { filter?: 'all' | 'pending' | 'completed' } }
  | { type: 'read_notes'; data: {} }
  | { type: 'update_wellness'; data: { sleep?: number; steps?: number; meditation?: number } }
  | { type: 'coaching_request'; data: { sentiment: string; context: string } }
  | { type: 'navigation'; data: { page: string } }
  | { type: 'generic_question'; data: { question: string } }
  | { type: 'contextual_follow_up'; data: { message: string; lastAction?: any } }
  | { type: 'unknown'; data: { message: string } };

const INTENT_PATTERNS = {
  create_event: [
    /(?:crea|aggiungi|nuovo|metti)\s+(?:un\s+)?(?:evento|appuntamento|incontro|meeting|impegno)/i,
    /(?:metti|inserisci)\s+(?:in\s+)?(?:agenda|calendario)/i,
    /(?:domani|oggi|dopodomani|stasera|più\s+tardi|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica).*(?:alle|ore|h)/i,
    /(?:vederci|incontrare|incontro).*(?:alle|ore|domani|oggi)/i
  ],
  create_expense: [
    /(?:ho\s+)?(?:speso|pagato|comprato|costo|uscita)/i,
    /(?:aggiungi|inserisci|registra)\s+(?:una\s+)?(?:spesa|pagamento)/i,
    /(?:\d+)\s*(?:€|euro|eur)/i
  ],
  create_task: [
    /(?:aggiungi|crea|nuovo)\s+(?:un\s+)?(?:task|compito|attività)/i,
    /(?:devo|ricordami|ricorda|sistema)/i,
    /(?:todo|to-do|da\s+fare)/i,
    /(?:fare|completare|finire)\s+(?:di|il|la)/i
  ],
  create_note: [
    /(?:nota|prendi\s+nota|scrivi|appunta|annota|segna)/i,
    /(?:ricordati|ricorda\s+che|tieni\s+presente)/i,
    /(?:memo|memorandum)/i
  ],
  read_summary: [
    /(?:mostra|fammi\s+vedere|dimmi)\s+(?:il\s+)?(?:riepilogo|riassunto|sommario)/i,
    /(?:come|cosa)\s+(?:va|ho\s+fatto)\s+(?:oggi|questa\s+settimana|questo\s+mese)/i
  ],
  read_expenses: [
    /quanto\s+ho\s+speso/i,
    /(?:mostra|vedi|dimmi)\s+(?:le\s+)?spese/i,
    /bilancio|budget/i
  ],
  read_tasks: [
    /(?:mostra|vedi|elenca)\s+(?:i\s+)?(?:task|compiti|attività)/i,
    /(?:cosa|quali)\s+(?:devo\s+fare|task\s+ho)/i
  ],
  read_notes: [
    /(?:mostra|vedi|elenca|leggi)\s+(?:le\s+)?(?:note|appunti)/i,
    /(?:cosa|quali)\s+(?:note\s+ho|ho\s+scritto)/i
  ],
  update_wellness: [
    /(?:ho\s+)?dormito.*(?:ore|h)/i,
    /(?:ho\s+fatto|camminato).*(?:passi|km)/i,
    /(?:ho\s+)?meditato/i
  ],
  coaching_request: [
    /(?:sono|mi\s+sento)\s+(?:stressato|stanco|ansioso|preoccupato|demotivato)/i,
    /non\s+riesco\s+a\s+(?:concentrarmi|dormire|rilassarmi)/i,
    /(?:aiuto|consiglio|suggerimento)/i,
    /come\s+posso\s+(?:migliorare|fare|gestire)/i
  ],
  navigation: [
    /(?:vai|apri|mostra)\s+(?:a|la\s+pagina|su)\s+(?:home|calendario|spese|impostazioni|assistente)/i
  ]
};

export function parseIntent(message: string, lastAction?: any): Intent {
  const msg = message.toLowerCase().trim();

  // Check for contextual follow-up (memory)
  if (isContextualFollowUp(msg) && lastAction) {
    return {
      type: 'contextual_follow_up',
      data: { message, lastAction }
    };
  }

  // Check coaching requests first (high priority for user wellbeing)
  for (const pattern of INTENT_PATTERNS.coaching_request) {
    if (pattern.test(msg)) {
      return {
        type: 'coaching_request',
        data: { sentiment: detectSentiment(msg), context: message }
      };
    }
  }

  // Check create event
  for (const pattern of INTENT_PATTERNS.create_event) {
    if (pattern.test(msg)) {
      return {
        type: 'create_event',
        data: extractEventData(message)
      };
    }
  }

  // Check create expense
  for (const pattern of INTENT_PATTERNS.create_expense) {
    if (pattern.test(msg)) {
      return {
        type: 'create_expense',
        data: extractExpenseData(message)
      };
    }
  }

  // Check create task
  for (const pattern of INTENT_PATTERNS.create_task) {
    if (pattern.test(msg)) {
      return {
        type: 'create_task',
        data: extractTaskData(message)
      };
    }
  }

  // Check create note
  for (const pattern of INTENT_PATTERNS.create_note) {
    if (pattern.test(msg)) {
      return {
        type: 'create_note',
        data: extractNoteData(message)
      };
    }
  }

  // Check read summary
  for (const pattern of INTENT_PATTERNS.read_summary) {
    if (pattern.test(msg)) {
      return {
        type: 'read_summary',
        data: { scope: extractTimeScope(msg) }
      };
    }
  }

  // Check read expenses
  for (const pattern of INTENT_PATTERNS.read_expenses) {
    if (pattern.test(msg)) {
      return {
        type: 'read_expenses',
        data: { period: extractPeriod(msg) }
      };
    }
  }

  // Check read tasks
  for (const pattern of INTENT_PATTERNS.read_tasks) {
    if (pattern.test(msg)) {
      return {
        type: 'read_tasks',
        data: { filter: extractTaskFilter(msg) }
      };
    }
  }

  // Check read notes
  for (const pattern of INTENT_PATTERNS.read_notes) {
    if (pattern.test(msg)) {
      return {
        type: 'read_notes',
        data: {}
      };
    }
  }

  // Check update wellness
  for (const pattern of INTENT_PATTERNS.update_wellness) {
    if (pattern.test(msg)) {
      return {
        type: 'update_wellness',
        data: extractWellnessData(message)
      };
    }
  }

  // Check navigation
  for (const pattern of INTENT_PATTERNS.navigation) {
    if (pattern.test(msg)) {
      return {
        type: 'navigation',
        data: { page: extractPage(msg) }
      };
    }
  }

  // If no specific intent matched, check if it's a complex/generic question
  if (isComplexQuestion(msg)) {
    return {
      type: 'generic_question',
      data: { question: message }
    };
  }

  return {
    type: 'unknown',
    data: { message }
  };
}

function detectSentiment(msg: string): string {
  if (/stressato|ansioso|preoccupato/i.test(msg)) return 'stressed';
  if (/stanco|esausto|affaticato/i.test(msg)) return 'tired';
  if (/demotivato|sfiduciato/i.test(msg)) return 'unmotivated';
  if (/non\s+riesco/i.test(msg)) return 'struggling';
  return 'neutral';
}

function extractEventData(msg: string): { title: string; date?: string; time?: string } {
  const timeMatch = msg.match(/(?:alle|ore)\s+(\d{1,2}(?::\d{2})?)/);
  const dateMatch = msg.match(/(?:domani|oggi|dopodomani|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)/i);
  
  let title = msg.replace(/(?:crea|aggiungi|nuovo|metti|inserisci|in|agenda|calendario|evento|appuntamento)/gi, '').trim();
  if (timeMatch) title = title.replace(timeMatch[0], '').trim();
  if (dateMatch) title = title.replace(dateMatch[0], '').trim();
  
  return {
    title: title || 'Nuovo evento',
    date: dateMatch ? dateMatch[0] : undefined,
    time: timeMatch ? timeMatch[1] : undefined
  };
}

function extractExpenseData(msg: string): { amount: number; category: string; description?: string } {
  const amountMatch = msg.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 0;
  
  const categories = ['cibo', 'trasporti', 'shopping', 'bollette', 'salute', 'intrattenimento', 'altro'];
  let category = 'altro';
  for (const cat of categories) {
    if (msg.toLowerCase().includes(cat)) {
      category = cat;
      break;
    }
  }
  
  let description = msg.replace(/(?:ho|speso|pagato|comprato|aggiungi|spesa|€|euro|\d+)/gi, '').trim();
  
  return { amount, category, description: description || undefined };
}

function extractTaskData(msg: string): { title: string; priority?: 'low' | 'medium' | 'high'; dueDate?: string } {
  let title = msg.replace(/(?:aggiungi|crea|nuovo|task|compito|attività|devo|ricordami|ricorda|todo|to-do|da\s+fare)/gi, '').trim();
  
  let priority: 'low' | 'medium' | 'high' | undefined = 'medium';
  if (/urgente|importante|priorità\s+alta/i.test(msg)) priority = 'high';
  if (/bassa\s+priorità|non\s+urgente/i.test(msg)) priority = 'low';
  
  const dateMatch = msg.match(/(?:entro|per)\s+(?:domani|oggi|dopodomani|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)/i);
  
  return {
    title: title || 'Nuovo compito',
    priority,
    dueDate: dateMatch ? dateMatch[0] : undefined
  };
}

function extractTimeScope(msg: string): 'today' | 'week' | 'month' {
  if (/oggi/i.test(msg)) return 'today';
  if (/settimana/i.test(msg)) return 'week';
  if (/mese/i.test(msg)) return 'month';
  return 'today';
}

function extractPeriod(msg: string): string | undefined {
  if (/oggi/i.test(msg)) return 'today';
  if (/settimana/i.test(msg)) return 'week';
  if (/mese/i.test(msg)) return 'month';
  return undefined;
}

function extractTaskFilter(msg: string): 'all' | 'pending' | 'completed' {
  if (/completat|fatt|finit/i.test(msg)) return 'completed';
  if (/da\s+fare|pendent/i.test(msg)) return 'pending';
  return 'all';
}

function extractWellnessData(msg: string): { sleep?: number; steps?: number; meditation?: number } {
  const sleepMatch = msg.match(/(\d+)\s*(?:ore|h)/i);
  const stepsMatch = msg.match(/(\d+)\s*(?:passi|km)/i);
  const meditationMatch = msg.match(/(\d+)\s*(?:minuti|min)/i);
  
  return {
    sleep: sleepMatch ? parseInt(sleepMatch[1]) : undefined,
    steps: stepsMatch ? parseInt(stepsMatch[1]) : undefined,
    meditation: meditationMatch ? parseInt(meditationMatch[1]) : undefined
  };
}

function extractPage(msg: string): string {
  if (/home/i.test(msg)) return '/';
  if (/calendario/i.test(msg)) return '/calendar';
  if (/spese/i.test(msg)) return '/expenses';
  if (/impostazioni/i.test(msg)) return '/settings';
  if (/assistente/i.test(msg)) return '/assistant';
  return '/';
}

function isComplexQuestion(msg: string): boolean {
  const questionWords = ['perché', 'come mai', 'cos\'è', 'cosa significa', 'spiegami', 'come funziona'];
  return questionWords.some(word => msg.includes(word)) && msg.length > 20;
}

function extractNoteData(msg: string): { content: string; category?: string } {
  let content = msg.replace(/(?:nota|prendi\s+nota|scrivi|appunta|annota|segna|ricordati|ricorda\s+che|tieni\s+presente|memo)/gi, '').trim();
  content = content.replace(/^[:;,.\-!?]\s*/, '').trim();
  
  const categories = ['lavoro', 'personale', 'casa', 'finanza', 'salute', 'studio'];
  let category = undefined;
  for (const cat of categories) {
    if (msg.toLowerCase().includes(cat)) {
      category = cat;
      break;
    }
  }
  
  return { content: content || 'Nuova nota', category };
}

function isContextualFollowUp(msg: string): boolean {
  const followUpPatterns = [
    /^(?:anche|pure|inoltre|e|aggiungi anche|metti anche)/i,
    /^(?:lo stesso|uguale|simile)/i,
    /^(?:\d+|domani|oggi|ieri)/i
  ];
  return followUpPatterns.some(p => p.test(msg)) || msg.length < 15;
}
