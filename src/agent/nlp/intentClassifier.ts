/**
 * Intent Classifier - Classificazione intelligente degli intenti utente
 */

export type IntentType = 
  | 'create_event'
  | 'create_task'
  | 'create_note'
  | 'create_expense'
  | 'read_calendar'
  | 'read_tasks'
  | 'read_notes'
  | 'read_expenses'
  | 'read_summary'
  | 'update_wellness'
  | 'emotional_support'
  | 'generic_question'
  | 'ambiguous';

export interface ClassifiedIntent {
  type: IntentType;
  confidence: 'high' | 'medium' | 'low';
  alternatives?: IntentType[];
  reason?: string;
}

const INTENT_PATTERNS = {
  create_event: {
    keywords: [
      'appuntamento', 'incontro', 'meeting', 'riunione', 'evento',
      'dentista', 'dottore', 'medico', 'visita', 'controllo',
      'revisione', 'tagliando', 'colloquio', 'intervista',
      'palestra', 'allenamento', 'corso', 'lezione',
      'compleanno', 'festa', 'cena', 'pranzo', 'aperitivo',
      'scadenza', 'consegna', 'presentazione'
    ],
    patterns: [
      // Date/time indicators strongly suggest events
      /(?:domani|oggi|dopodomani|stasera|giovedì|lunedì|martedì|mercoledì|venerdì|sabato|domenica)/i,
      /(?:alle|ore|h)\s+\d{1,2}/i,
      /(?:mattina|pomeriggio|sera|notte|pranzo)/i,
      /(?:tra|fra)\s+\d+\s+(?:ore|minuti|giorni)/i,
      /\d{1,2}[\/\-]\d{1,2}/,
      // Action verbs for events
      /(?:ho|devo|vado|andiamo)\s+(?:a|dal|in)/i,
      /(?:metti|segna|ricorda|promemoria)/i,
    ]
  },
  
  create_task: {
    keywords: [
      'ricordami', 'ricorda', 'promemoria', 'devo',
      'comprare', 'acquistare', 'prendere',
      'chiamare', 'telefonare', 'contattare',
      'inviare', 'mandare', 'spedire',
      'pagare', 'saldare', 'versare',
      'preparare', 'organizzare', 'sistemare',
      'controllare', 'verificare', 'controllare',
      'fare', 'completare', 'finire',
      'portare', 'ritirare', 'consegnare'
    ],
    patterns: [
      /^(?:devo|dovrei|bisogna)\s+/i,
      /^(?:ricordami|ricorda)\s+(?:di|che)/i,
      /^(?:comprare|prendere|chiamare|inviare|mandare|pagare)/i,
      /\b(?:task|todo|compito|attività)\b/i,
    ]
  },

  create_note: {
    keywords: [
      'nota', 'appunta', 'annota', 'segna', 'scrivi',
      'prendi nota', 'tieni presente', 'ricordati',
      'memo', 'memorandum', 'idea'
    ],
    patterns: [
      /^(?:nota|prendi\s+nota|annota|segna)/i,
      /^(?:ricordati|tieni\s+presente)\s+(?:che|di)/i,
      /\b(?:nota|memo|idea)\b/i,
    ]
  },

  create_expense: {
    keywords: [
      'speso', 'pagato', 'comprato', 'acquistato',
      'spesa', 'pagamento', 'costo', 'prezzo',
      'euro', '€'
    ],
    patterns: [
      /(?:ho|sono)\s+(?:speso|pagato|comprato)/i,
      /(?:spesa|pagamento|costo)\s+(?:di|per)/i,
      /\d+\s*(?:€|euro|eur)/i,
      /€\s*\d+/i,
    ]
  },

  read_calendar: {
    keywords: [
      'calendario', 'eventi', 'appuntamenti', 'impegni',
      'cosa ho', 'che faccio', 'programma'
    ],
    patterns: [
      /(?:mostra|dimmi|vedi|fammi\s+vedere)\s+(?:il\s+)?(?:calendario|eventi|appuntamenti)/i,
      /(?:cosa|che)\s+(?:ho|faccio|devo\s+fare)\s+(?:oggi|domani|settimana)/i,
      /(?:programma|impegni)\s+(?:di|della|del)/i,
    ]
  },

  read_tasks: {
    keywords: [
      'task', 'compiti', 'attività', 'todo', 'da fare'
    ],
    patterns: [
      /(?:mostra|dimmi|vedi|elenca)\s+(?:i\s+)?(?:task|compiti|attività|todo)/i,
      /(?:cosa|quali)\s+(?:devo\s+fare|task\s+ho|compiti\s+ho)/i,
      /\b(?:da\s+fare|to-?do)\b/i,
    ]
  },

  read_notes: {
    keywords: [
      'note', 'appunti', 'memo'
    ],
    patterns: [
      /(?:mostra|dimmi|vedi|leggi|elenca)\s+(?:le\s+)?(?:note|appunti|memo)/i,
      /(?:cosa|quali)\s+(?:note\s+ho|ho\s+scritto|ho\s+annotato)/i,
    ]
  },

  read_expenses: {
    keywords: [
      'spese', 'speso', 'budget', 'bilancio', 'costi'
    ],
    patterns: [
      /quanto\s+ho\s+speso/i,
      /(?:mostra|dimmi|vedi)\s+(?:le\s+)?spese/i,
      /\b(?:budget|bilancio|costi)\b/i,
    ]
  },

  read_summary: {
    keywords: [
      'riepilogo', 'riassunto', 'sommario', 'situazione'
    ],
    patterns: [
      /(?:mostra|dimmi|fammi\s+vedere)\s+(?:il\s+)?(?:riepilogo|riassunto|sommario)/i,
      /(?:come|cosa)\s+(?:va|ho\s+fatto)\s+(?:oggi|settimana|mese)/i,
      /\b(?:situazione|panoramica)\b/i,
    ]
  },

  update_wellness: {
    keywords: [
      'dormito', 'sonno', 'ore',
      'passi', 'camminato', 'km',
      'meditato', 'meditazione', 'yoga'
    ],
    patterns: [
      /(?:ho|sono)\s+dormito.*(?:ore|h)/i,
      /(?:ho\s+fatto|camminato).*(?:passi|km)/i,
      /(?:ho\s+)?meditato/i,
      /\d+\s*(?:ore|h)\s+(?:di\s+)?sonno/i,
    ]
  },

  emotional_support: {
    keywords: [
      'stressato', 'stanco', 'ansioso', 'preoccupato',
      'demotivato', 'sfiduciato', 'sovraccarico', 'esausto',
      'depresso', 'triste', 'male', 'giù',
      'non riesco', 'non ce la faccio', 'troppo'
    ],
    patterns: [
      /(?:sono|mi\s+sento)\s+(?:stressato|stanco|ansioso|preoccupato|demotivato|sovraccarico|esausto|depresso|triste|male|giù)/i,
      /non\s+(?:riesco|ce\s+la\s+faccio)\s+(?:a|più)/i,
      /(?:troppo|tanto)\s+(?:stress|lavoro|carico|stanco)/i,
      /(?:aiuto|help)/i,
    ]
  },

  generic_question: {
    keywords: [
      'perché', 'come', 'cosa', 'quando', 'dove', 'chi',
      'cos\'è', 'cosa significa', 'spiegami', 'dimmi'
    ],
    patterns: [
      /^(?:perché|come\s+mai|cos[aè]|cosa\s+significa|spiegami|come\s+funziona)/i,
      /\?$/,
    ]
  }
};

export function classifyIntent(message: string): ClassifiedIntent {
  const lowerMessage = message.toLowerCase().trim();
  const scores: Map<IntentType, number> = new Map();

  // Calculate scores for each intent
  for (const [intentType, config] of Object.entries(INTENT_PATTERNS)) {
    let score = 0;
    
    // Keyword matching
    for (const keyword of config.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        score += 2;
      }
    }

    // Pattern matching
    for (const pattern of config.patterns) {
      if (pattern.test(lowerMessage)) {
        score += 3;
      }
    }

    if (score > 0) {
      scores.set(intentType as IntentType, score);
    }
  }

  // Find the best match
  if (scores.size === 0) {
    return {
      type: 'ambiguous',
      confidence: 'low',
      reason: 'No clear intent detected'
    };
  }

  const sortedScores = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  const [bestIntent, bestScore] = sortedScores[0];
  const alternatives = sortedScores.slice(1, 4).map(([intent]) => intent);

  // Determine confidence based on score gap
  let confidence: 'high' | 'medium' | 'low';
  if (bestScore >= 5) {
    confidence = 'high';
  } else if (bestScore >= 3) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // If multiple intents have similar scores, it's ambiguous
  if (sortedScores.length > 1 && sortedScores[1][1] >= bestScore - 1) {
    return {
      type: 'ambiguous',
      confidence: 'low',
      alternatives: [bestIntent, ...alternatives.slice(0, 2)],
      reason: 'Multiple possible interpretations'
    };
  }

  return {
    type: bestIntent,
    confidence,
    alternatives: alternatives.length > 0 ? alternatives : undefined
  };
}

export function isDateTimePresent(message: string): boolean {
  const dateTimeIndicators = [
    /\b(?:oggi|domani|dopodomani|stasera|ieri)\b/i,
    /\b(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\b/i,
    /\b(?:mattina|pomeriggio|sera|notte|pranzo)\b/i,
    /(?:alle|ore|h)\s+\d{1,2}/i,
    /\d{1,2}[:\.]\d{2}/,
    /\d{1,2}[\/\-]\d{1,2}/,
    /(?:tra|fra)\s+\d+\s+(?:ore|minuti|giorni|settimane)/i,
  ];

  return dateTimeIndicators.some(pattern => pattern.test(message));
}
