/**
 * Centralized Terminology Map
 * 
 * Single source of truth for synonym patterns used by:
 * - Intent Classifier (deterministic fallback)
 * - Deterministic Router (query detection)
 * 
 * Covers Italian, English, and natural variants.
 * Used ONLY as fallback when LLM classifier fails.
 */

// ============================================================================
// QUERY PATTERNS — detect user asking about existing data
// ============================================================================

/** Matches any natural way to ask about tasks */
export const TASK_QUERY_PATTERN = /(?:che|quali|cosa|ho|mostra|vedi|lista|elenco|quanti|i miei|le mie|elenca|visualizza)\s*(?:i\s+|le\s+|dei\s+|di\s+)?(?:miei\s+|mie\s+)?(?:task|tasks|attivit[aà]|cose\s+da\s+fare|to-?do|todos?|impegni|compiti)|(?:task|attivit[aà]|cose\s+da\s+fare|to-?do)\s+(?:di\s+)?(?:oggi|domani|settimana)|(?:cosa\s+(?:devo|ho\s+da)\s+fare)|(?:show|list|my)\s*(?:tasks?|to-?dos?)/i;

/** Matches any natural way to ask about events */
export const EVENT_QUERY_PATTERN = /(?:che|quali|ho|mostra|vedi|lista|elenco|quanti|i miei|le mie|elenca|visualizza)\s*(?:i\s+|gli\s+|dei\s+|di\s+)?(?:miei\s+)?(?:eventi|event|appuntamenti|impegni\s+(?:in\s+)?calendario|agenda)|(?:eventi|appuntamenti|impegni|agenda)\s+(?:di\s+)?(?:oggi|domani|settimana)|(?:cosa\s+ho\s+in\s+agenda)|(?:show|list|my)\s*(?:events?|appointments?|calendar)/i;

/** Matches any natural way to ask about budget/expenses */
export const EXPENSE_QUERY_PATTERN = /(?:mostra|vedi|quanto|quante|come|elenca|visualizza)\s*(?:le\s+|i\s+)?(?:mie\s+|miei\s+)?(?:spese|budget|speso|uscite|finanze|soldi)|(?:spese|budget|speso|soldi|euro|€)\s*(?:di\s+)?(?:oggi|settimana|mese)|(?:quanto\s+ho\s+speso)|(?:show|my)\s*(?:expenses?|budget|spending)/i;

// ============================================================================
// FINANCIAL DECISION PATTERNS
// ============================================================================

export const FINANCIAL_DECISION_PATTERN = /(?:posso\s+permettermi|posso\s+spendere|sto\s+spendendo\s+troppo|quanto\s+posso|ce\s+la\s+faccio|me\s+lo\s+posso\s+permettere|can\s+i\s+afford|budget\s+enough|am\s+i\s+spending\s+too\s+much)/i;

// ============================================================================
// FINANCIAL QUERY PATTERNS
// ============================================================================

export const FINANCIAL_QUERY_PATTERN = /(?:come\s+sto\s+andando|come\s+vanno\s+le\s+finanze|situazione\s+finanziaria|livello\s+di\s+rischio|burn\s+rate|risk\s+level|how\s+much.*spent|how\s+am\s+i\s+doing|spending\s+summary|spese\s+totali)/i;

// ============================================================================
// PLANNING PATTERNS
// ============================================================================

export const PLANNING_PATTERN = /(?:quando\s+(?:dovrei|mi\s+consigli)|pianifica|organizza\s*(?:mi)?\s*(?:la\s+)?giornata|plan\s+my|schedule|help\s+me\s+plan|quando\s+(?:allenar|esercit)|come\s+organizzo|aiutami\s+a\s+pianificare|routine|programma\s*(?:mi)?|when\s+should\s+i)/i;

// ============================================================================
// GENERAL CHAT PATTERNS
// ============================================================================

export const GENERAL_CHAT_PATTERN = /(?:grazie|thanks|bravo|bene|ok\s+grazie|perfetto|come\s+stai|come\s+va|buongiorno|buonasera|ciao|hey|ehi|hello|hi|cosa\s+puoi\s+fare|aiutami|consigliami|come\s+funzion|help|what\s+can\s+you\s+do)/i;

// ============================================================================
// CREATION PATTERNS — for router scope (NOT queries)
// ============================================================================

export const CREATION_PATTERN = /\b(crea|aggiungi|ricordami|devo|€|euro|\d+\s*€|nuovo|nuova|elimina|cancella|rimuovi)\b/i;
