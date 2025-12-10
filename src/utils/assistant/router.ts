/**
 * Message Router - Determines whether to use local or external AI
 */

// Patterns that suggest complex reasoning requiring external AI
const EXTERNAL_AI_PATTERNS = [
  /cosa potrei fare/i,
  /consigli/i,
  /come posso/i,
  /aiutami a/i,
  /organizz/i,
  /non so/i,
  /ho un'ora/i,
  /mi sento/i,
  /non riesco/i,
  /pianific/i,
  /ottimizz/i,
  /dubbi/i,
  /obiettiv/i,
  /suggeri/i,
  /raccomand/i,
  /miglior/i,
  /strateg/i,
  /priori/i,
  /pensiero/i,
  /ragion/i,
  /perché/i,
  /spieg/i,
  /analiz/i,
  /valut/i,
];

// Patterns for simple local intents
const LOCAL_PATTERNS = [
  /^(ciao|hey|salve|buongiorno|buonasera)/i,
  /^(grazie|ok|perfetto|ottimo|bene)/i,
  /mostra.*task/i,
  /lista.*task/i,
  /i miei task/i,
  /quanti task/i,
  /mostra.*spese/i,
  /mostra.*eventi/i,
  /mostra.*calendario/i,
  /crea.*task/i,
  /aggiungi.*task/i,
  /nuovo task/i,
  /crea.*evento/i,
  /aggiungi.*evento/i,
  /salva.*nota/i,
  /crea.*nota/i,
];

// Keywords that suggest emotional/complex support
const COMPLEX_KEYWORDS = [
  'stressato', 'ansioso', 'preoccupato', 'ansia',
  'stanco', 'esausto', 'affaticato',
  'demotivato', 'sfiduciato', 'triste',
  'confuso', 'incerto', 'indeciso',
  'sopraffatto', 'overwhelmed',
  'lifestyle', 'abitudini', 'routine',
  'produttività', 'efficienza',
];

export function shouldUseExternalAI(message: string): boolean {
  const normalizedMessage = message.toLowerCase().trim();
  
  // Quick check for simple greetings
  if (normalizedMessage.length < 15 && LOCAL_PATTERNS.some(p => p.test(normalizedMessage))) {
    return false;
  }
  
  // Check for complex keywords
  if (COMPLEX_KEYWORDS.some(keyword => normalizedMessage.includes(keyword))) {
    return true;
  }
  
  // Check for external AI patterns
  if (EXTERNAL_AI_PATTERNS.some(pattern => pattern.test(normalizedMessage))) {
    return true;
  }
  
  // Check for local patterns
  if (LOCAL_PATTERNS.some(pattern => pattern.test(normalizedMessage))) {
    return false;
  }
  
  // Long messages likely need more reasoning
  if (normalizedMessage.length > 100) {
    return true;
  }
  
  // Questions with "?" that aren't simple commands
  if (normalizedMessage.includes('?') && normalizedMessage.length > 30) {
    return true;
  }
  
  // Default to local for short/simple messages
  return false;
}

export type AssistantSource = 'local' | 'external';

export interface RouterDecision {
  useExternal: boolean;
  reason: string;
}

export function getRouterDecision(message: string): RouterDecision {
  const useExternal = shouldUseExternalAI(message);
  
  let reason = 'default';
  const normalizedMessage = message.toLowerCase().trim();
  
  if (COMPLEX_KEYWORDS.some(k => normalizedMessage.includes(k))) {
    reason = 'complex_keywords';
  } else if (EXTERNAL_AI_PATTERNS.some(p => p.test(normalizedMessage))) {
    reason = 'external_pattern';
  } else if (LOCAL_PATTERNS.some(p => p.test(normalizedMessage))) {
    reason = 'local_pattern';
  } else if (normalizedMessage.length > 100) {
    reason = 'long_message';
  }
  
  return { useExternal, reason };
}
