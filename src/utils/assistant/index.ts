/**
 * Hybrid Assistant - Main entry point
 * Combines local and external AI for optimal responses
 */

import { shouldUseExternalAI, getRouterDecision } from './router';
import { processLocally, LocalAssistantResponse } from './localAssistant';
import { processExternally, ConversationMessage } from './externalAssistant';
import { loadMemory, saveToMemory, formatMemoryForContext, ConversationEntry } from './memory';

export interface HybridAssistantResponse {
  message: string;
  source: 'local' | 'external';
  success: boolean;
  data?: any;
  suggestions?: Array<{ text: string; priority: string }>;
  type?: string;
}

const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Main handler for processing messages through the hybrid system
 */
export async function handleMessage(
  message: string,
  userId: string
): Promise<HybridAssistantResponse> {
  // Load conversation memory
  const memory = await loadMemory(userId);
  const conversationHistory = formatMemoryForContext(memory);
  
  // Get router decision
  const decision = getRouterDecision(message);
  
  // If router suggests external, go directly
  if (decision.useExternal) {
    const externalResponse = await processExternally(message, userId, conversationHistory);
    
    // Save to memory
    await saveToMemory(userId, message, externalResponse.text, 'external');
    
    return {
      message: externalResponse.text,
      source: 'external',
      success: externalResponse.success,
      type: externalResponse.type
    };
  }
  
  // Try local first
  const localResponse = await processLocally(message, userId);
  
  // If local confidence is low, fall back to external
  if (localResponse.confidence < CONFIDENCE_THRESHOLD) {
    const externalResponse = await processExternally(message, userId, conversationHistory);
    
    // Save to memory
    await saveToMemory(userId, message, externalResponse.text, 'external');
    
    return {
      message: externalResponse.text,
      source: 'external',
      success: externalResponse.success,
      type: externalResponse.type
    };
  }
  
  // Use local response
  await saveToMemory(userId, message, localResponse.text, 'local');
  
  return {
    message: localResponse.text,
    source: 'local',
    success: true,
    data: localResponse.data,
    suggestions: localResponse.suggestions
  };
}

// Re-export utilities
export { loadMemory, clearMemory } from './memory';
export { shouldUseExternalAI } from './router';
