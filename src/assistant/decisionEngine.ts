/**
 * Decision Engine - Strict 3-Phase Architecture
 * Phase 1: Classification
 * Phase 2: Decision Object (MANDATORY)
 * Phase 3: Execution
 * 
 * NEVER respond without a valid Decision Object
 */

export type IntentType = 'ACTION' | 'QUERY' | 'SUGGESTION' | 'CHAT' | 'ERROR' | 'INFORMATIONAL' | 'UNKNOWN';
export type DomainType = 'calendar' | 'task' | 'expense' | 'planning' | 'wellness' | 'general' | 'productivity' | 'finance' | 'social' | null;
export type ActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'READ' | 'create' | 'update' | 'delete' | 'query' | 'respond' | 'clarify' | null;
export type ResponseStyle = 'concise' | 'supportive' | 'neutral' | 'friendly';

export interface ContextRequired {
  today_tasks?: boolean;
  today_events?: boolean;
  budget?: boolean;
  wellness?: boolean;
  recent_history?: boolean;
}

/**
 * Decision Object - ALL fields required for response generation
 * If any field is missing/invalid → NO response
 */
export interface DecisionObject {
  intent: IntentType;
  domain: DomainType;         // MANDATORY for SUGGESTION
  constraints: Constraints;
  action: ActionType;
  requires_ai: boolean;
  requires_action?: boolean;
  action_type?: ActionType;
  context_required?: ContextRequired;
  response_style?: ResponseStyle;
  confidence?: number;
  extracted_data?: Record<string, any>;
  valid: boolean;             // False if any required field is missing
  validationError?: string;
}

// Alias for compatibility
export type AssistantDecision = DecisionObject;

export interface Constraints {
  timeRange?: 'today' | 'tomorrow' | 'week' | 'month' | null;
  category?: string;
  priority?: 'low' | 'medium' | 'high';
  excludeDomains?: DomainType[];
  previousSuggestions?: string[];
  userCorrections?: string[];
}

/**
 * Session context - persists during conversation
 * User corrections UPDATE constraints, never reset intent
 */
interface SessionContext {
  currentDecision: DecisionObject | null;
  constraints: Constraints;
  lastIntent: IntentType | null;
  lastDomain: DomainType;
  correctionCount: number;
}

const sessions = new Map<string, SessionContext>();

function getSession(userId: string): SessionContext {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      currentDecision: null,
      constraints: {},
      lastIntent: null,
      lastDomain: null,
      correctionCount: 0
    });
  }
  return sessions.get(userId)!;
}

export function resetSession(userId: string): void {
  sessions.delete(userId);
}

// ============ PHASE 1: CLASSIFICATION ============

const ACTION_TRIGGERS = {
  create: /(?:aggiungi|crea|nuovo|inserisci|registra|programma|ricordami|devo|segna)/i,
  update: /(?:modifica|sposta|cancella|elimina|completa|fatto|finito|cambia)/i,
  query: /(?:mostra|vedi|elenca|lista|quanti|quanto|cosa\s+ho)/i
};

const SUGGESTION_TRIGGERS = /(?:cosa\s+(?:potrei|dovrei|posso)\s+fare|cosa\s+mi\s+(?:consigli|suggerisci)|suggeriscimi|consigliami|tu\s+cosa\s+faresti|da\s+dove\s+(?:inizio|comincio)|hai\s+(?:suggerimenti|consigli|idee))/i;

const INFORMATIONAL_TRIGGERS = /(?:che\s+)?(?:cos['']?è|cosa\s+significa|perch[eé]|come\s+mai|spiegami|dimmi\s+(?:cos['']?è|perch[eé])|chi|dove|quando|qual\s+è|quali\s+sono|come\s+funziona|come\s+si\s+fa)/i;

const SOCIAL_TRIGGERS = {
  greeting: /^(?:ciao|salve|buongiorno|buonasera|hey|hi|hello)/i,
  thanks: /^(?:grazie|thanks|ok|perfetto|ottimo)/i,
  farewell: /^(?:arrivederci|a\s+dopo|bye|addio)/i,
  help: /(?:aiuto|help|cosa\s+(?:puoi|sai)\s+fare)/i
};

const DOMAIN_KEYWORDS: Partial<Record<NonNullable<DomainType>, RegExp>> = {
  productivity: /(?:task|attività|compito|lavoro|studio|progetto|deadline)/i,
  task: /(?:task|attività|compito|lavoro|studio|progetto|deadline)/i,
  wellness: /(?:relax|riposo|benessere|meditazione|esercizio|salute|stress)/i,
  finance: /(?:spesa|budget|soldi|costo|pagamento|euro|€)/i,
  expense: /(?:spesa|budget|soldi|costo|pagamento|euro|€)/i,
  planning: /(?:evento|appuntamento|calendario|riunione|meeting|programma)/i,
  calendar: /(?:evento|appuntamento|calendario|riunione|meeting|programma)/i,
  social: /(?:amici|famiglia|uscire|chiamare|messaggio)/i,
  general: /.*/
};

const CORRECTION_PATTERNS = [
  /^no,?\s+/i,
  /^non\s+(?:voglio|intendo|quello)/i,
  /^intendo\s+/i,
  /^preferisco\s+/i,
  /^invece\s+/i,
  /^meglio\s+/i,
  /^(?:solo|esclusivamente)\s+/i
];

function isCorrection(message: string): boolean {
  return CORRECTION_PATTERNS.some(p => p.test(message));
}

function detectDomain(message: string): DomainType {
  for (const [domain, pattern] of Object.entries(DOMAIN_KEYWORDS)) {
    if (domain !== 'general' && pattern.test(message)) {
      return domain as DomainType;
    }
  }
  return null;
}

function classifyIntent(message: string): { intent: IntentType; action: ActionType; subtype?: string } {
  const normalized = message.toLowerCase().trim();

  // Check social first
  for (const [subtype, pattern] of Object.entries(SOCIAL_TRIGGERS)) {
    if (pattern.test(normalized)) {
      return { intent: 'ACTION', action: 'respond', subtype };
    }
  }

  // Check action triggers
  for (const [actionType, pattern] of Object.entries(ACTION_TRIGGERS)) {
    if (pattern.test(normalized)) {
      return { 
        intent: 'ACTION', 
        action: actionType as ActionType 
      };
    }
  }

  // Check suggestion
  if (SUGGESTION_TRIGGERS.test(normalized)) {
    return { intent: 'SUGGESTION', action: 'respond' };
  }

  // Check informational (but NOT about app data)
  if (INFORMATIONAL_TRIGGERS.test(normalized)) {
    const appData = /(?:task|evento|spesa|budget|calendario)/i;
    if (!appData.test(normalized)) {
      return { intent: 'INFORMATIONAL', action: 'respond' };
    }
  }

  return { intent: 'UNKNOWN', action: 'clarify' };
}

// ============ PHASE 2: DECISION OBJECT ============

export function buildDecision(
  userId: string,
  message: string
): DecisionObject {
  const session = getSession(userId);
  const isUserCorrection = isCorrection(message);

  // If correction, update constraints only - keep intent
  if (isUserCorrection && session.currentDecision) {
    return updateConstraintsFromCorrection(userId, message, session);
  }

  // Fresh classification
  const { intent, action, subtype } = classifyIntent(message);
  const detectedDomain = detectDomain(message);

  // Build constraints
  const constraints: Constraints = {
    ...session.constraints, // Carry forward session constraints
    previousSuggestions: session.constraints.previousSuggestions || [],
    userCorrections: session.constraints.userCorrections || []
  };

  // Detect time range
  if (/oggi/i.test(message)) constraints.timeRange = 'today';
  else if (/domani/i.test(message)) constraints.timeRange = 'tomorrow';
  else if (/settimana/i.test(message)) constraints.timeRange = 'week';
  else if (/mese/i.test(message)) constraints.timeRange = 'month';

  // Detect priority
  if (/urgent|importante|priorit/i.test(message)) constraints.priority = 'high';

  // Determine domain (MANDATORY for SUGGESTION)
  let domain: DomainType = detectedDomain;
  
  // For suggestions, domain is MANDATORY
  if (intent === 'SUGGESTION' && !domain) {
    // Use last domain from session or default to productivity
    domain = session.lastDomain || 'productivity';
  }

  // Determine if external AI is needed
  const requires_ai = shouldUseExternalAI(intent, action, message);

  // Validate decision
  const validation = validateDecision(intent, domain, action, constraints);

  const decision: DecisionObject = {
    intent,
    domain,
    constraints,
    action,
    requires_ai,
    valid: validation.valid,
    validationError: validation.error
  };

  // Update session
  session.currentDecision = decision;
  session.lastIntent = intent;
  if (domain) session.lastDomain = domain;
  session.correctionCount = 0;

  console.log('Decision Object:', JSON.stringify(decision, null, 2));

  return decision;
}

function updateConstraintsFromCorrection(
  userId: string,
  message: string,
  session: SessionContext
): DecisionObject {
  const currentDecision = session.currentDecision!;
  
  // Extract correction info
  const correctionInfo = message.toLowerCase();
  
  // Update constraints based on correction
  const newConstraints: Constraints = {
    ...currentDecision.constraints,
    userCorrections: [
      ...(currentDecision.constraints.userCorrections || []),
      message
    ]
  };

  // Parse domain exclusions
  if (/non\s+(?:voglio\s+)?(?:lavoro|task|produttività)/i.test(correctionInfo)) {
    newConstraints.excludeDomains = [...(newConstraints.excludeDomains || []), 'productivity'];
  }
  if (/non\s+(?:voglio\s+)?(?:spesa|soldi|budget)/i.test(correctionInfo)) {
    newConstraints.excludeDomains = [...(newConstraints.excludeDomains || []), 'finance'];
  }
  if (/non\s+(?:voglio\s+)?(?:relax|benessere)/i.test(correctionInfo)) {
    newConstraints.excludeDomains = [...(newConstraints.excludeDomains || []), 'wellness'];
  }

  // Detect new domain from correction
  const newDomain = detectDomain(message);
  const domain = newDomain || currentDecision.domain;

  session.correctionCount++;

  const decision: DecisionObject = {
    intent: currentDecision.intent, // KEEP intent
    domain,
    constraints: newConstraints,
    action: currentDecision.action, // KEEP action
    requires_ai: currentDecision.requires_ai,
    valid: true
  };

  session.currentDecision = decision;
  if (domain) session.lastDomain = domain;

  console.log('Updated Decision (correction):', JSON.stringify(decision, null, 2));

  return decision;
}

function shouldUseExternalAI(intent: IntentType, action: ActionType, message: string): boolean {
  // External AI ONLY for complex parsing
  if (intent === 'ACTION' && (action === 'create' || action === 'update')) {
    // Complex date/time parsing
    if (/(?:alle?\s+\d|domani|prossim[ao]|tra\s+\d)/i.test(message)) {
      return true;
    }
  }
  
  // Informational questions that need knowledge
  if (intent === 'INFORMATIONAL') {
    return true;
  }

  return false;
}

function validateDecision(
  intent: IntentType,
  domain: DomainType,
  action: ActionType,
  constraints: Constraints
): { valid: boolean; error?: string } {
  // SUGGESTION requires domain
  if (intent === 'SUGGESTION' && !domain) {
    return { valid: false, error: 'SUGGESTION requires domain' };
  }

  // ACTION requires action type
  if (intent === 'ACTION' && !action) {
    return { valid: false, error: 'ACTION requires action type' };
  }

  return { valid: true };
}

// ============ PHASE 3: EXECUTION CONTROLLER ============

export interface ExecutionResult {
  shouldRespond: boolean;
  message: string;
  suggestions?: string[];
  showQuickActions: boolean;
  source: 'local' | 'external';
  decision: DecisionObject;
}

/**
 * Get UI controls based on decision
 * Quick actions ONLY for ACTION intent
 * Suggestions NEVER show quick actions
 */
export function getUIControls(decision: DecisionObject): {
  showQuickActions: boolean;
  maxSuggestions: number;
} {
  switch (decision.intent) {
    case 'ACTION':
      return {
        showQuickActions: decision.action === 'create' || decision.action === 'update',
        maxSuggestions: 3
      };
    
    case 'SUGGESTION':
      // NEVER show quick actions for suggestions
      return {
        showQuickActions: false,
        maxSuggestions: 3
      };
    
    case 'INFORMATIONAL':
      return {
        showQuickActions: false,
        maxSuggestions: 0
      };
    
    case 'UNKNOWN':
      return {
        showQuickActions: false,
        maxSuggestions: 0
      };
    
    default:
      return {
        showQuickActions: false,
        maxSuggestions: 0
      };
  }
}

/**
 * Track suggested items to avoid repetition
 */
export function trackSuggestion(userId: string, suggestion: string): void {
  const session = getSession(userId);
  if (!session.constraints.previousSuggestions) {
    session.constraints.previousSuggestions = [];
  }
  session.constraints.previousSuggestions.push(suggestion);
  
  // Keep only last 10
  if (session.constraints.previousSuggestions.length > 10) {
    session.constraints.previousSuggestions.shift();
  }
}

export function getSessionConstraints(userId: string): Constraints {
  return getSession(userId).constraints;
}

export function getCurrentDecision(userId: string): DecisionObject | null {
  return getSession(userId).currentDecision;
}

/**
 * Track unknown count for limiting repeated unknown responses
 */
const unknownCounts = new Map<string, number>();

export function getUnknownCount(userId: string): number {
  return unknownCounts.get(userId) || 0;
}

export function incrementUnknownCount(userId: string): number {
  const count = (unknownCounts.get(userId) || 0) + 1;
  unknownCounts.set(userId, count);
  return count;
}

export function resetUnknownCount(userId: string): void {
  unknownCounts.set(userId, 0);
}
