/**
 * MESSAGE ROUTER - Deterministic routing between FREE and PREMIUM
 * 
 * ROUTING RULES:
 * 
 * → AI FREE (Operator):
 *   - "crea", "elimina", "mostra", "segna", "registra" (action verbs)
 *   - Explicit CRUD commands
 * 
 * → AI PREMIUM (Coach):
 *   - "cosa dovrei fare", "aiutami", "consigliami", "da dove inizio"
 *   - Reflection/advice/guidance requests
 * 
 * PREMIUM GATING:
 * - If user is FREE and requests PREMIUM feature → show upgrade message
 * - NO simulation of intelligence for FREE users
 */

import { 
  parseExplicitCommand, 
  isPremiumRequest,
  handleAmbiguous,
  handleCancel,
  type OperatorIntent,
  type OperatorResponse
} from './freeOperator';
import { 
  getPremiumUpgradeMessage,
  type CoachResponse 
} from './premiumCoach';

// ========== TYPES ==========

export type RouteTarget = 'OPERATOR' | 'COACH' | 'NONE';

export interface RouteDecision {
  target: RouteTarget;
  intent: OperatorIntent;
  extracted?: string;
  confidence: number;
  isPremiumRequired: boolean;
}

export type UnifiedResponse = (OperatorResponse | CoachResponse) & {
  routedTo: RouteTarget;
};

// ========== ROUTING FUNCTIONS ==========

/**
 * Determine route for message
 * RULE: Explicit commands → Operator, Advice requests → Coach
 */
export function routeMessage(message: string): RouteDecision {
  const trimmed = message.trim();
  
  // Empty message
  if (!trimmed) {
    return {
      target: 'NONE',
      intent: 'NONE',
      confidence: 0,
      isPremiumRequired: false
    };
  }
  
  // Check for premium (advice) request first
  if (isPremiumRequest(trimmed)) {
    return {
      target: 'COACH',
      intent: 'NONE',
      confidence: 0.9,
      isPremiumRequired: true
    };
  }
  
  // Parse explicit command
  const parsed = parseExplicitCommand(trimmed);
  
  if (parsed.intent !== 'NONE') {
    return {
      target: 'OPERATOR',
      intent: parsed.intent,
      extracted: parsed.extracted,
      confidence: parsed.confidence,
      isPremiumRequired: false
    };
  }
  
  // No explicit command found
  return {
    target: 'NONE',
    intent: 'NONE',
    confidence: 0,
    isPremiumRequired: false
  };
}

/**
 * Check if user has premium access
 * TODO: Implement actual premium check from database
 */
export function hasPremiumAccess(_userId: string): boolean {
  // For now, return false to simulate free user
  // In production, this would check the user's subscription status
  return false;
}

/**
 * Handle premium feature request for free user
 * Returns upgrade message instead of simulating intelligence
 */
export function handlePremiumForFreeUser(): UnifiedResponse {
  const upgradeMessage = getPremiumUpgradeMessage();
  return {
    ...upgradeMessage,
    routedTo: 'COACH'
  };
}

/**
 * Handle no route found (ambiguous input)
 * RULE: Ask for clarification, don't interpret
 */
export function handleNoRoute(): UnifiedResponse {
  const ambiguous = handleAmbiguous();
  return {
    ...ambiguous,
    routedTo: 'OPERATOR'
  };
}

/**
 * Handle cancel command
 */
export function handleCancelRoute(): UnifiedResponse {
  const cancel = handleCancel();
  return {
    ...cancel,
    routedTo: 'OPERATOR'
  };
}

// ========== PATTERN DETECTION ==========

/**
 * Detect if message is a data input (for follow-up context)
 * Used when operator is waiting for specific data
 */
export function isDataInput(message: string, expectedType: string): boolean {
  const trimmed = message.trim().toLowerCase();
  
  switch (expectedType) {
    case 'TITLE':
      // Any non-empty text that's not a control word
      return trimmed.length >= 2 && !isControlWord(trimmed);
    
    case 'DATE':
      // Date patterns
      return /(?:oggi|domani|dopodomani|luned|marted|mercoled|gioved|venerd|sabato|domenica|\d{1,2}[\/\-\.]\d{1,2})/i.test(trimmed);
    
    case 'TIME':
      // Time patterns
      return /(?:\d{1,2}[:.]\d{2}|alle?\s*\d{1,2}|ore\s*\d{1,2})/i.test(trimmed);
    
    case 'AMOUNT':
      // Number patterns
      return /^\d+(?:[.,]\d+)?(?:\s*€)?$/.test(trimmed) || /^€?\s*\d+/.test(trimmed);
    
    case 'CATEGORY':
      // Any non-empty text
      return trimmed.length >= 2 && !isControlWord(trimmed);
    
    case 'TYPE':
      // "task" or "evento"
      return /^(?:task|evento|appuntamento)$/i.test(trimmed);
    
    case 'INDEX':
      // Number 1-N
      return /^\d+$/.test(trimmed);
    
    default:
      return false;
  }
}

/**
 * Check if word is a control word (cancel/confirm)
 */
function isControlWord(word: string): boolean {
  const controlWords = [
    'no', 'si', 'sì', 'ok', 'okay', 'annulla', 'stop', 
    'basta', 'va bene', 'perfetto', 'certo', 'procedi'
  ];
  return controlWords.includes(word.toLowerCase());
}

/**
 * Extract specific data from message
 */
export function extractData(message: string, type: string): string | number | null {
  const trimmed = message.trim();
  
  switch (type) {
    case 'AMOUNT': {
      const match = trimmed.match(/(\d+(?:[.,]\d+)?)/);
      return match ? parseFloat(match[1].replace(',', '.')) : null;
    }
    
    case 'TIME': {
      const match = trimmed.match(/(\d{1,2})[:.:](\d{2})/);
      if (match) {
        return `${match[1].padStart(2, '0')}:${match[2]}`;
      }
      const hourMatch = trimmed.match(/(?:alle?\s*)?(\d{1,2})/i);
      if (hourMatch) {
        return `${hourMatch[1].padStart(2, '0')}:00`;
      }
      return null;
    }
    
    case 'DATE': {
      const lower = trimmed.toLowerCase();
      const today = new Date();
      
      if (lower.includes('oggi')) {
        return today.toISOString().split('T')[0];
      }
      if (lower.includes('domani')) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
      }
      
      // Weekday detection
      const weekdays: Record<string, number> = {
        'lunedi': 1, 'lunedì': 1,
        'martedi': 2, 'martedì': 2,
        'mercoledi': 3, 'mercoledì': 3,
        'giovedi': 4, 'giovedì': 4,
        'venerdi': 5, 'venerdì': 5,
        'sabato': 6,
        'domenica': 0
      };
      
      for (const [name, day] of Object.entries(weekdays)) {
        if (lower.includes(name)) {
          const currentDay = today.getDay();
          let daysToAdd = day - currentDay;
          if (daysToAdd <= 0) daysToAdd += 7;
          const targetDate = new Date(today);
          targetDate.setDate(today.getDate() + daysToAdd);
          return targetDate.toISOString().split('T')[0];
        }
      }
      
      return null;
    }
    
    case 'TYPE': {
      const lower = trimmed.toLowerCase();
      if (/task/i.test(lower)) return 'task';
      if (/evento|appuntamento/i.test(lower)) return 'event';
      return null;
    }
    
    default:
      return trimmed;
  }
}
