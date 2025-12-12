/**
 * XML Command Parser - Parses AI XML responses into structured commands
 */

export interface AICommand {
  type: 'create_event' | 'create_task' | 'create_expense' | 'update_budget' | 'create_note' | null;
  payload: Record<string, any>;
}

export interface ParsedAIResponse {
  message: string;
  action: AICommand;
}

/**
 * Extract text content from XML tag
 */
function extractXMLContent(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extract action type attribute from action tag
 */
function extractActionType(xml: string): string | null {
  const actionMatch = xml.match(/<action\s+type=["']?([^"'>]+)["']?[^>]*>/i);
  return actionMatch ? actionMatch[1].trim().toLowerCase() : null;
}

/**
 * Extract all parameters from action block
 */
function extractActionParams(actionContent: string): Record<string, any> {
  const params: Record<string, any> = {};
  
  // Common parameter tags
  const paramTags = ['title', 'date', 'startTime', 'endTime', 'start_time', 'end_time', 
                     'amount', 'category', 'description', 'priority', 'content', 'budget'];
  
  for (const tag of paramTags) {
    const value = extractXMLContent(actionContent, tag);
    if (value !== null) {
      // Convert snake_case to camelCase for consistency
      const camelKey = tag.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      params[camelKey] = value;
    }
  }
  
  return params;
}

/**
 * Normalize action type to internal format
 */
function normalizeActionType(type: string): AICommand['type'] {
  const typeMap: Record<string, AICommand['type']> = {
    'create_event': 'create_event',
    'createevent': 'create_event',
    'add_event': 'create_event',
    'addevent': 'create_event',
    'event': 'create_event',
    
    'create_task': 'create_task',
    'createtask': 'create_task',
    'add_task': 'create_task',
    'addtask': 'create_task',
    'task': 'create_task',
    
    'create_expense': 'create_expense',
    'createexpense': 'create_expense',
    'add_expense': 'create_expense',
    'addexpense': 'create_expense',
    'expense': 'create_expense',
    'spesa': 'create_expense',
    
    'update_budget': 'update_budget',
    'updatebudget': 'update_budget',
    'budget': 'update_budget',
    'set_budget': 'update_budget',
    
    'create_note': 'create_note',
    'createnote': 'create_note',
    'add_note': 'create_note',
    'addnote': 'create_note',
    'note': 'create_note',
    'nota': 'create_note',
  };
  
  return typeMap[type.toLowerCase()] || null;
}

/**
 * Parse XML response from AI into structured format
 */
export function parseAICommand(xmlResponse: string): ParsedAIResponse {
  // Default response
  const defaultResponse: ParsedAIResponse = {
    message: xmlResponse,
    action: { type: null, payload: {} }
  };

  try {
    // Check if it's wrapped in <response> tag
    const hasResponseWrapper = /<response>/i.test(xmlResponse);
    
    if (hasResponseWrapper) {
      // Extract message from <message> tag
      const messageContent = extractXMLContent(xmlResponse, 'message');
      if (messageContent) {
        defaultResponse.message = messageContent;
      }
      
      // Check for <action> tag
      const actionContent = extractXMLContent(xmlResponse, 'action');
      if (actionContent) {
        const actionType = extractActionType(xmlResponse);
        if (actionType) {
          const normalizedType = normalizeActionType(actionType);
          const params = extractActionParams(actionContent);
          
          defaultResponse.action = {
            type: normalizedType,
            payload: params
          };
        }
      }
    } else {
      // Try to extract message directly (plain text response)
      // Remove any XML tags for display
      defaultResponse.message = xmlResponse
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    return defaultResponse;
  } catch (error) {
    console.error('Error parsing AI command:', error);
    return defaultResponse;
  }
}

/**
 * Check if response has a valid action command
 */
export function hasActionCommand(parsed: ParsedAIResponse): boolean {
  return parsed.action.type !== null && Object.keys(parsed.action.payload).length > 0;
}
