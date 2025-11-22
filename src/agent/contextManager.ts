/**
 * Context Manager - Gestione del contesto conversazionale
 */

export interface ConversationContext {
  lastMessage: string;
  lastIntent: string;
  lastAction?: {
    type: string;
    data: any;
    timestamp: Date;
  };
  userPreferences?: {
    defaultEventDuration?: number;
    preferredTimeOfDay?: string;
  };
}

class ContextManager {
  private contexts: Map<string, ConversationContext> = new Map();
  private readonly CONTEXT_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  setContext(userId: string, context: Partial<ConversationContext>): void {
    const existing = this.contexts.get(userId) || {
      lastMessage: '',
      lastIntent: ''
    };
    this.contexts.set(userId, {
      ...existing,
      ...context,
      lastMessage: context.lastMessage || existing.lastMessage,
      lastIntent: context.lastIntent || existing.lastIntent,
    });
  }

  getContext(userId: string): ConversationContext | null {
    const context = this.contexts.get(userId);
    if (!context) return null;

    // Check if context is expired
    if (context.lastAction) {
      const timeSinceLastAction = Date.now() - context.lastAction.timestamp.getTime();
      if (timeSinceLastAction > this.CONTEXT_EXPIRY_MS) {
        this.clearContext(userId);
        return null;
      }
    }

    return context;
  }

  clearContext(userId: string): void {
    this.contexts.delete(userId);
  }

  updateLastAction(userId: string, action: { type: string; data: any }): void {
    const context = this.contexts.get(userId) || {
      lastMessage: '',
      lastIntent: ''
    };
    
    context.lastAction = {
      ...action,
      timestamp: new Date()
    };
    
    this.contexts.set(userId, context);
  }

  canInferFromContext(userId: string, currentMessage: string): boolean {
    const context = this.getContext(userId);
    if (!context || !context.lastAction) return false;

    // Check if current message is short and contextual
    const lowerMessage = currentMessage.toLowerCase().trim();
    
    // Contextual follow-up patterns
    const contextualPatterns = [
      /^(?:anche|pure|inoltre|e)\b/i,
      /^(?:lo stesso|uguale|simile)\b/i,
      /^(?:metti|aggiungi)\s+(?:pure|anche)?$/i,
    ];

    // Short messages might be contextual
    if (currentMessage.length < 20) {
      return contextualPatterns.some(p => p.test(lowerMessage));
    }

    return false;
  }

  inferFromContext(userId: string, currentMessage: string): any {
    const context = this.getContext(userId);
    if (!context || !context.lastAction) return null;

    const lastAction = context.lastAction;
    const modifications: any = {};

    // Extract any new information from current message
    const amountMatch = currentMessage.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?/);
    if (amountMatch) {
      modifications.amount = parseFloat(amountMatch[1].replace(',', '.'));
    }

    // Extract date references
    if (/domani/i.test(currentMessage)) {
      modifications.date = 'domani';
    } else if (/oggi/i.test(currentMessage)) {
      modifications.date = 'oggi';
    }

    // Return merged data
    return {
      type: lastAction.type,
      data: {
        ...lastAction.data,
        ...modifications
      }
    };
  }
}

export const contextManager = new ContextManager();
