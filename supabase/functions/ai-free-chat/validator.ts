/**
 * LAYER 2 — VALIDATION & COMPLETENESS (deterministic)
 * 
 * RESPONSIBILITY: Check if analyzed items have all required fields.
 * NO LLM, NO questions to user — just flag what's missing.
 */

import { AnalyzedItem } from "./analyzeCore.ts";

// ============================================================================
// TYPES
// ============================================================================

export interface ValidatedItem {
  item: AnalyzedItem;
  valid: boolean;
  missingFields: string[];
}

// ============================================================================
// FORBIDDEN TITLES
// ============================================================================

const FORBIDDEN_TITLES = [
  "ok", "no", "sì", "si", "yes", "ciao", "salve", "grazie", "boh",
  "vediamo", "pianifichiamo", "perfetto", "va bene", "top", "dai",
  "annulla", "lascia stare", "niente", "nulla", "stop", "task", "evento",
  "un", "una", "il", "la", "lo", "i", "gli", "le", "crea", "aggiungi",
  "cosa", "tasks", "events", "expenses"
];

export function isForbiddenTitle(title: string): boolean {
  const lower = title.toLowerCase().trim();
  return FORBIDDEN_TITLES.includes(lower) || lower.length < 2;
}

// ============================================================================
// VALIDATE SINGLE ITEM
// ============================================================================

export function validateItem(item: AnalyzedItem): ValidatedItem {
  const missing: string[] = [];
  
  switch (item.type) {
    case 'task':
      if (!item.title || item.title.trim().length < 2 || isForbiddenTitle(item.title)) {
        missing.push('title');
      }
      break;
      
    case 'event':
      if (!item.title || item.title.trim().length < 2 || isForbiddenTitle(item.title)) {
        missing.push('title');
      }
      if (!item.date) missing.push('date');
      if (!item.time) missing.push('time');
      break;
      
    case 'expense':
      if (item.amount === null || item.amount === undefined || item.amount <= 0) {
        missing.push('amount');
      }
      break;
      
    case 'query':
    case 'greeting':
      // Always valid
      break;
      
    default:
      if (!item.title || item.title.trim().length < 2) {
        missing.push('title');
      }
  }
  
  return { item, valid: missing.length === 0, missingFields: missing };
}

// ============================================================================
// VALIDATE ALL ITEMS
// ============================================================================

export function validateItems(items: AnalyzedItem[]): ValidatedItem[] {
  return items.map(validateItem);
}

// ============================================================================
// MISSING FIELD QUESTION BUILDER
// ============================================================================

export function buildMissingFieldQuestion(item: AnalyzedItem, missingFields: string[]): string {
  const title = item.title && !isForbiddenTitle(item.title) ? `"${item.title}"` : '';
  
  if (missingFields.includes('title')) {
    switch (item.type) {
      case 'task': return 'Che task vuoi creare?';
      case 'event': return 'Che evento vuoi creare?';
      case 'expense': return 'Che spesa vuoi registrare?';
      default: return 'Cosa vuoi fare?';
    }
  }
  
  if (missingFields.includes('date') && missingFields.includes('time')) {
    return title ? `Quando ${title}?` : 'Quando?';
  }
  if (missingFields.includes('date')) {
    return title ? `Che giorno ${title}?` : 'Che giorno?';
  }
  if (missingFields.includes('time')) {
    return title ? `A che ora ${title}?` : 'A che ora?';
  }
  if (missingFields.includes('amount')) {
    return 'Quanto hai speso?';
  }
  
  return 'Puoi darmi più dettagli?';
}
