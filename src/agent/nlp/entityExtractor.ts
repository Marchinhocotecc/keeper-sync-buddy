/**
 * Entity Extractor - Estrazione intelligente di entità dal testo
 */

export interface ExtractedEntities {
  title?: string;
  description?: string;
  amount?: number;
  category?: string;
  rawText: string;
}

const CATEGORY_KEYWORDS = {
  lavoro: ['lavoro', 'ufficio', 'meeting', 'riunione', 'colloquio', 'progetto', 'cliente', 'presentazione'],
  salute: ['dentista', 'dottore', 'medico', 'visita', 'controllo', 'analisi', 'farmacia', 'terapia', 'palestra', 'sport'],
  personale: ['compleanno', 'anniversario', 'festa', 'amici', 'famiglia', 'cena', 'pranzo', 'aperitivo'],
  casa: ['casa', 'affitto', 'bolletta', 'spesa', 'pulizie', 'riparazione', 'manutenzione'],
  trasporti: ['auto', 'macchina', 'revisione', 'tagliando', 'benzina', 'treno', 'aereo', 'viaggio'],
  finanze: ['banca', 'pagamento', 'bolletta', 'tasse', 'assicurazione', 'mutuo'],
  studio: ['corso', 'lezione', 'esame', 'studio', 'università', 'scuola', 'biblioteca'],
  shopping: ['comprare', 'acquistare', 'negozio', 'abbigliamento', 'scarpe', 'shopping'],
  cibo: ['supermercato', 'spesa', 'ristorante', 'pizzeria', 'bar', 'caffè', 'cibo', 'alimentari'],
};

const EXPENSE_CATEGORY_KEYWORDS = {
  cibo: ['supermercato', 'spesa', 'cibo', 'alimentari', 'frutta', 'verdura', 'carne', 'pesce'],
  trasporti: ['benzina', 'diesel', 'carburante', 'treno', 'metro', 'bus', 'taxi', 'uber'],
  shopping: ['vestiti', 'abbigliamento', 'scarpe', 'accessori', 'elettronica', 'negozio'],
  bollette: ['bolletta', 'luce', 'gas', 'acqua', 'telefono', 'internet', 'affitto'],
  salute: ['farmacia', 'medicinali', 'dottore', 'medico', 'visita', 'analisi'],
  intrattenimento: ['cinema', 'teatro', 'concerto', 'libro', 'musica', 'streaming', 'gioco'],
  altro: []
};

export function extractEntities(message: string, intentType: string): ExtractedEntities {
  const lowerMessage = message.toLowerCase().trim();
  
  const entities: ExtractedEntities = {
    rawText: message
  };

  // Extract amount (for expenses)
  if (intentType === 'create_expense') {
    const amountMatch = message.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro|eur)?/i);
    if (amountMatch) {
      entities.amount = parseFloat(amountMatch[1].replace(',', '.'));
    }
    
    entities.category = detectExpenseCategory(lowerMessage);
  } else {
    // Extract general category
    entities.category = detectGeneralCategory(lowerMessage);
  }

  // Extract title
  entities.title = extractTitle(message, intentType);

  // Extract description (if different from title)
  entities.description = extractDescription(message, entities.title || '');

  return entities;
}

function extractTitle(message: string, intentType: string): string {
  let title = message.trim();

  // Remove common prefixes
  const prefixesToRemove = [
    /^(?:crea|aggiungi|nuovo|metti|inserisci|ricordami|ricorda)\s+(?:un\s+|di\s+)?/i,
    /^(?:evento|appuntamento|task|compito|nota|spesa|meeting|riunione)[:;\s]+/i,
    /^(?:devo|dovrei|bisogna)\s+/i,
    /^(?:ho|sono)\s+(?:speso|pagato|comprato)\s+/i,
  ];

  for (const prefix of prefixesToRemove) {
    title = title.replace(prefix, '');
  }

  // Remove date/time expressions for events
  if (intentType === 'create_event') {
    title = title
      .replace(/\b(?:oggi|domani|dopodomani|stasera|ieri)\b/gi, '')
      .replace(/\b(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\b/gi, '')
      .replace(/\b(?:lunedi|martedi|mercoledi|giovedi|venerdi)\b/gi, '')
      .replace(/\b(?:mattina|pomeriggio|sera|notte|pranzo)\b/gi, '')
      .replace(/(?:alle?|ore|h)\s+\d{1,2}(?:[:\.]\d{2})?/gi, '')
      .replace(/\d{1,2}[:\.]\d{2}/g, '')
      .replace(/\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?/g, '')
      .replace(/(?:tra|fra)\s+\d+\s+(?:ore|minuti|giorni|settimane)/gi, '')
      .replace(/\bil\s+\d{1,2}\s+\w+/gi, '');
  }

  // Remove expense-specific info
  if (intentType === 'create_expense') {
    title = title
      .replace(/\d+(?:[.,]\d{1,2})?\s*(?:€|euro|eur)/gi, '')
      .replace(/€\s*\d+(?:[.,]\d{1,2})?/gi, '');
  }

  // Clean up
  title = title
    .replace(/\s+/g, ' ')
    .replace(/^[:\-,.\s]+/, '')
    .replace(/[:\-,.\s]+$/, '')
    .trim();

  // Capitalize first letter
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  // Default titles based on intent
  if (!title || title.length < 2) {
    const defaults: { [key: string]: string } = {
      create_event: 'Evento',
      create_task: 'Nuovo compito',
      create_note: 'Nota',
      create_expense: 'Spesa'
    };
    title = defaults[intentType] || 'Promemoria';
  }

  return title;
}

function extractDescription(message: string, title: string): string | undefined {
  // If the message is much longer than the title, extract additional context as description
  const cleanMessage = message.toLowerCase().trim();
  const cleanTitle = title.toLowerCase().trim();

  if (cleanMessage.length > cleanTitle.length + 20) {
    // Try to find additional context
    let description = message.trim();
    
    // Remove the title part
    const titleIndex = description.toLowerCase().indexOf(cleanTitle);
    if (titleIndex !== -1) {
      description = description.slice(titleIndex + cleanTitle.length).trim();
    }

    // Clean up
    description = description
      .replace(/^[:\-,.\s]+/, '')
      .trim();

    if (description.length > 10) {
      return description;
    }
  }

  return undefined;
}

function detectGeneralCategory(text: string): string {
  let maxScore = 0;
  let bestCategory = 'personale';

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score += 1;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

function detectExpenseCategory(text: string): string {
  let maxScore = 0;
  let bestCategory = 'altro';

  for (const [category, keywords] of Object.entries(EXPENSE_CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score += 1;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

export function cleanTextForStorage(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[:\-,.\s]+/, '')
    .replace(/[:\-,.\s]+$/, '')
    .trim();
}
