/**
 * Hybrid Assistant - Main entry point
 * Combines local and external AI for optimal responses
 * Includes XML command parsing and execution
 */

import { shouldUseExternalAI, getRouterDecision } from './router';
import { processLocally, LocalAssistantResponse } from './localAssistant';
import { processExternally, ConversationMessage } from './externalAssistant';
import { loadMemory, saveToMemory, formatMemoryForContext, ConversationEntry } from './memory';
import { parseAICommand, hasActionCommand } from '@/lib/ai/parseAICommand';
import { executeAICommand } from '@/lib/ai/executeAICommand';
import { needsExternalAI } from '@/lib/ai/externalAI';

export interface HybridAssistantResponse {
  message: string;
  source: 'local' | 'external';
  success: boolean;
  data?: any;
  suggestions?: Array<{ text: string; priority: string }>;
  type?: string;
  commandExecuted?: boolean;
  commandResult?: string;
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
    return await processWithExternalAI(message, userId, conversationHistory);
  }
  
  // Try local first
  const localResponse = await processLocally(message, userId);
  
  // Check if local response indicates it needs help
  if (localResponse.text && needsExternalAI(localResponse.text)) {
    return await processWithExternalAI(message, userId, conversationHistory);
  }
  
  // If local confidence is low, fall back to external
  if (localResponse.confidence < CONFIDENCE_THRESHOLD) {
    return await processWithExternalAI(message, userId, conversationHistory);
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

/**
 * Process message with external AI and handle XML commands
 */
async function processWithExternalAI(
  message: string,
  userId: string,
  conversationHistory: ConversationMessage[]
): Promise<HybridAssistantResponse> {
  const externalResponse = await processExternally(message, userId, conversationHistory);
  
  // Parse the XML response
  const parsed = parseAICommand(externalResponse.text);
  
  let commandExecuted = false;
  let commandResult = '';
  let finalMessage = parsed.message;
  
  // Execute command if present
  if (hasActionCommand(parsed)) {
    const result = await executeAICommand(userId, parsed.action);
    commandExecuted = true;
    commandResult = result.message;
    
    // Append command result to message
    if (result.success) {
      finalMessage = `${parsed.message}\n\n${result.message}`;
    } else {
      finalMessage = `${parsed.message}\n\n❌ ${result.message}`;
    }
  }
  
  // Save to memory
  await saveToMemory(userId, message, finalMessage, 'external');
  
  return {
    message: finalMessage,
    source: 'external',
    success: externalResponse.success,
    type: externalResponse.type,
    commandExecuted,
    commandResult
  };
}

// Re-export utilities
export { loadMemory, clearMemory } from './memory';
export { shouldUseExternalAI } from './router';
