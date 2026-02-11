/**
 * LAYER 3 — USER CONFIRMATION (deterministic templates)
 * 
 * RESPONSIBILITY: Build confirmation messages and pending action objects.
 * NO LLM — just templates.
 */

import { AnalyzedItem } from "./analyzeCore.ts";
import { PendingAction } from "./types.ts";

// ============================================================================
// TITLE NORMALIZATION
// ============================================================================

function normalizeTitle(raw: string): string {
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

// ============================================================================
// DATE FORMATTING
// ============================================================================

function formatDateIT(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

function buildISODateTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

// ============================================================================
// ANALYZED ITEM → ACTION
// ============================================================================

export interface ActionToConfirm {
  type: string;         // CREATE_TASK, CREATE_EVENT, RECORD_EXPENSE
  payload: any;
  confirmMessage: string;
}

export function itemToAction(item: AnalyzedItem): ActionToConfirm | null {
  const title = item.title ? normalizeTitle(item.title) : null;
  
  switch (item.type) {
    case 'task':
      if (!title) return null;
      return {
        type: 'CREATE_TASK',
        payload: { title, due_date: item.date || undefined },
        confirmMessage: item.date
          ? `Creo "${title}" per ${formatDateIT(item.date)}?`
          : `Creo "${title}"?`
      };
      
    case 'event':
      if (!title || !item.date || !item.time) return null;
      return {
        type: 'CREATE_EVENT',
        payload: { title, start_at: buildISODateTime(item.date, item.time) },
        confirmMessage: `Creo "${title}" per ${formatDateIT(item.date)} alle ${item.time}?`
      };
      
    case 'expense':
      if (!item.amount || item.amount <= 0) return null;
      const category = item.category || item.title?.toLowerCase() || 'altro';
      return {
        type: 'RECORD_EXPENSE',
        payload: { amount: item.amount, category },
        confirmMessage: `Registro €${item.amount.toFixed(2)} in ${category}?`
      };
      
    default:
      return null;
  }
}

// ============================================================================
// BUILD CONFIRMATION RESPONSE
// ============================================================================

export function buildSingleConfirmation(action: ActionToConfirm): PendingAction {
  return {
    type: `CONFIRM_${action.type}`,
    payload: action.payload,
    question: action.confirmMessage
  };
}

export function buildMultiConfirmation(actions: ActionToConfirm[]): PendingAction {
  return {
    type: "CONFIRM_MULTI",
    payload: {
      intents: actions.map(a => ({
        type: `CONFIRM_${a.type}`,
        payload: a.payload,
      }))
    },
    question: actions.map(a => a.confirmMessage).join("\n")
  };
}

export function buildMultiConfirmMessage(actions: ActionToConfirm[]): string {
  const lines = actions.map((a, i) => `${i + 1}. ${a.confirmMessage}`).join("\n");
  return `Ho trovato ${actions.length} azioni:\n${lines}\n\nConfermi tutto?`;
}
